import { randomUUID } from 'node:crypto'

import {
  type CommandResult,
  type MatchClaimCommand,
  type PlayerRole,
  type RoomPhase,
  type RoomSnapshot,
  type ScoreboardEntry,
} from '../lib/game-protocol'
import {
  FIRST_PLAYABLE_CONFIGURATION,
  generateTwoCardMatchup,
} from '../lib/pic-match'
import { fingerprintClientToken } from './token-fingerprint'

export const MAX_ROOM_MEMBERS = FIRST_PLAYABLE_CONFIGURATION.participantCapacity
export const INCORRECT_CLAIM_COOLDOWN_MS = 1_000
const MAX_REMEMBERED_COMMANDS_PER_PLAYER = 100
const MAX_REMEMBERED_REMOVALS = 256

type Member = {
  playerId: string
  token: string
  name: string
  role: PlayerRole
  joinedAt: number
  active: boolean
  game: GameSeat | null
}

type GameSeat = {
  position: number
  score: number
  cooldownUntil: number | null
}

type GameState = {
  seed: string
  pairRevision: number
  matchup: ReturnType<typeof generateTwoCardMatchup> | null
  lastAcceptedClaim: {
    scorerId: string
    scorerName: string
    symbolId: string
    pairRevision: number
  } | null
  winnerPlayerId: string | null
}

export type GameRoomOptions = {
  now?: number
  createPlayerId?: () => string
  seed?: string
}

export class GameRoom {
  readonly code: string
  phase: RoomPhase = 'lobby'
  revision = 1
  lastMeaningfulActivityAt: number

  private readonly members: Member[]
  private readonly removedTokenFingerprints = new Set<string>()
  private game: GameState | null = null
  private readonly createPlayerId: () => string
  private readonly initialSeed: string
  private readonly commandResults = new Map<
    string,
    Map<string, CommandResult>
  >()

  constructor(
    code: string,
    host: { token: string; name: string },
    options: GameRoomOptions = {},
  ) {
    const now = options.now ?? Date.now()
    this.code = code
    this.lastMeaningfulActivityAt = now
    this.createPlayerId = options.createPlayerId ?? randomUUID
    this.initialSeed = options.seed ?? `${code}:${now}:${randomUUID()}`
    this.members = [this.createMember(host.token, host.name, 'host', now)]
  }

  join(token: string, name: string, now = Date.now()): CommandResult {
    if (this.isRemovedToken(token)) {
      return {
        status: 'removed_from_room',
        message: 'The host removed you from this room. You can’t rejoin it.',
      }
    }

    const existing = this.findMember(token)

    if (existing?.active) {
      this.touch(now)
      return { status: 'success' }
    }

    if (this.phase === 'finished') {
      return {
        status: 'game_in_progress',
        message: 'This game has already finished.',
      }
    }

    if (this.activeMembers().length >= MAX_ROOM_MEMBERS) {
      return { status: 'room_full', message: 'This room is full.' }
    }

    if (existing) {
      existing.name = name
      existing.active = true
      existing.game ??= this.createSeat()
    } else {
      const member = this.createMember(token, name, 'player', now)
      member.game = this.phase === 'playing' ? this.createSeat() : null
      this.members.push(member)
    }

    this.changed(now)
    return { status: 'success' }
  }

  leave(token: string, now = Date.now()): CommandResult {
    const member = this.findActiveMember(token)
    if (!member) return { status: 'success' }

    member.active = false
    if (member.role === 'host') {
      member.role = 'player'
      const successor = this.activeMembers()[0]
      if (successor) successor.role = 'host'
    }

    this.commandResults.delete(token)
    if (this.phase === 'lobby') {
      const index = this.members.indexOf(member)
      if (index >= 0) this.members.splice(index, 1)
    }
    this.changed(now)
    return { status: 'success' }
  }

  removePlayer(
    token: string,
    playerId: string,
    now = Date.now(),
  ): CommandResult<{ removedToken: string }> {
    const actor = this.findActiveMember(token)
    if (!actor || actor.role !== 'host') {
      return {
        status: 'forbidden',
        message: 'Only the host can remove a player.',
      }
    }
    if (this.phase !== 'lobby') {
      return {
        status: 'invalid',
        message: 'Players can only be removed from the lobby.',
      }
    }

    const target = this.members.find(
      (member) => member.active && member.playerId === playerId,
    )
    if (!target) {
      return {
        status: 'stale',
        message: 'That player is no longer in the lobby.',
      }
    }
    if (target === actor || target.role === 'host') {
      return {
        status: 'forbidden',
        message: 'The host cannot be removed from the room.',
      }
    }

    this.removedTokenFingerprints.add(fingerprintClientToken(target.token))
    while (this.removedTokenFingerprints.size > MAX_REMEMBERED_REMOVALS) {
      const oldest = this.removedTokenFingerprints.values().next().value
      if (oldest === undefined) break
      this.removedTokenFingerprints.delete(oldest)
    }
    const index = this.members.indexOf(target)
    this.members.splice(index, 1)
    this.commandResults.delete(target.token)
    this.changed(now)
    return { status: 'success', removedToken: target.token }
  }

  start(token: string, now = Date.now()): CommandResult {
    const actor = this.findActiveMember(token)
    if (!actor || actor.role !== 'host') {
      return {
        status: 'forbidden',
        message: 'Only the host can start the game.',
      }
    }
    if (this.phase !== 'lobby') {
      return {
        status: 'invalid',
        message: 'The game can only start from the lobby.',
      }
    }

    const members = this.activeMembers()
    if (members.length < 1) {
      return {
        status: 'invalid',
        message: 'At least 1 player is required to start the game.',
      }
    }

    for (const member of this.members) member.game = null
    let position = 0
    for (const member of members) {
      member.game = { position, score: 0, cooldownUntil: null }
      position += 1
    }

    this.game = {
      seed: `${this.initialSeed}:${this.revision}:${now}`,
      pairRevision: 0,
      matchup: null,
      lastAcceptedClaim: null,
      winnerPlayerId: null,
    }
    this.phase = 'playing'
    this.changed(now)
    return { status: 'success' }
  }

  claim(
    token: string,
    claim: MatchClaimCommand,
    now = Date.now(),
  ): CommandResult {
    const previous = this.commandResults.get(token)?.get(claim.commandId)
    if (previous) return previous

    const member = this.findActiveMember(token)
    const seat = member?.game ?? null
    if (!member || !seat || this.phase !== 'playing' || !this.game) {
      return {
        status: 'forbidden',
        message: 'Only current game participants can submit a match.',
      }
    }

    this.touch(now)
    if (seat.cooldownUntil && seat.cooldownUntil > now) {
      return this.remember(token, claim.commandId, {
        status: 'cooldown',
        message: 'Wait for your cooldown to finish.',
        cooldownUntil: seat.cooldownUntil,
      })
    }

    if (claim.pairRevision !== this.game.pairRevision) {
      return this.remember(token, claim.commandId, {
        status: 'stale',
        message: 'The cards changed before this claim arrived.',
      })
    }

    const cards = this.currentMatchup().cards
    const correct =
      cards[0].symbolIds.includes(claim.firstSymbolId) &&
      cards[1].symbolIds.includes(claim.secondSymbolId) &&
      claim.firstSymbolId === claim.secondSymbolId

    if (!correct) {
      seat.cooldownUntil = now + INCORRECT_CLAIM_COOLDOWN_MS
      this.changed(now)
      return this.remember(token, claim.commandId, {
        status: 'incorrect',
        message: 'Incorrect match.',
        cooldownUntil: seat.cooldownUntil,
      })
    }

    seat.score += 1
    seat.cooldownUntil = null
    this.game.lastAcceptedClaim = {
      scorerId: member.playerId,
      scorerName: member.name,
      symbolId: claim.firstSymbolId,
      pairRevision: this.game.pairRevision,
    }

    if (seat.score >= FIRST_PLAYABLE_CONFIGURATION.winningScore) {
      this.game.winnerPlayerId = member.playerId
      this.phase = 'finished'
    } else {
      this.game.pairRevision += 1
      this.game.matchup = null
    }

    this.changed(now)
    return this.remember(token, claim.commandId, { status: 'success' })
  }

  prepareRematch(token: string, now = Date.now()): CommandResult {
    const actor = this.findActiveMember(token)
    if (!actor || actor.role !== 'host' || !actor.game) {
      return {
        status: 'forbidden',
        message: 'Only the host can prepare a rematch.',
      }
    }
    if (this.phase !== 'finished') {
      return { status: 'invalid', message: 'The game has not finished.' }
    }

    this.phase = 'lobby'
    this.game = null
    for (let index = this.members.length - 1; index >= 0; index -= 1) {
      const member = this.members[index]
      if (!member?.active) this.members.splice(index, 1)
      else member.game = null
    }
    this.commandResults.clear()
    this.changed(now)
    return { status: 'success' }
  }

  snapshotFor(token: string): RoomSnapshot {
    const member = this.findActiveMember(token)
    if (!member) {
      if (this.isRemovedToken(token)) {
        return { status: 'removed_from_room', roomCode: this.code }
      }
      return {
        status: this.phase === 'finished' ? 'game_in_progress' : 'joinable',
        roomCode: this.code,
      }
    }

    if (this.phase === 'lobby') {
      return {
        status: 'lobby',
        roomCode: this.code,
        revision: this.revision,
        members: this.activeMembers().map(({ playerId, name, role }) => ({
          playerId,
          name,
          role,
        })),
        player: {
          playerId: member.playerId,
          name: member.name,
          role: member.role,
          position: null,
        },
      }
    }

    const game = this.requireGame()
    const seat = member.game
    if (!seat) throw new Error('Active member is missing a game seat.')
    const scoreboard = this.gameScoreboard()
    const player = {
      playerId: member.playerId,
      name: member.name,
      role: member.role,
      position: seat.position,
    }

    if (this.phase === 'finished') {
      const winner = scoreboard.find(
        (candidate) => candidate.playerId === game.winnerPlayerId,
      )
      if (!winner) throw new Error('Finished game is missing its winner.')
      return {
        status: 'finished',
        roomCode: this.code,
        revision: this.revision,
        player,
        winner,
        scoreboard,
      }
    }

    const matchup = this.currentMatchup()

    return {
      status: 'playing',
      roomCode: this.code,
      revision: this.revision,
      player,
      pairRevision: game.pairRevision,
      cards: matchup.cards.map((card) => ({
        id: card.id,
        symbolIds: [...card.symbolIds],
      })),
      scoreboard,
      lastAcceptedClaim: game.lastAcceptedClaim,
      cooldownUntil: seat.cooldownUntil,
    }
  }

  isEmpty() {
    return this.activeMembers().length === 0
  }

  private createMember(
    token: string,
    name: string,
    role: PlayerRole,
    joinedAt: number,
  ): Member {
    return {
      playerId: this.createPlayerId(),
      token,
      name,
      role,
      joinedAt,
      active: true,
      game: null,
    }
  }

  private activeMembers() {
    return this.members
      .filter((member) => member.active)
      .sort((left, right) => left.joinedAt - right.joinedAt)
  }

  private findMember(token: string) {
    return this.members.find((member) => member.token === token)
  }

  private findActiveMember(token: string) {
    const member = this.findMember(token)
    return member?.active ? member : null
  }

  private isRemovedToken(token: string) {
    return this.removedTokenFingerprints.has(fingerprintClientToken(token))
  }

  private createSeat(): GameSeat {
    let maxPosition = -1
    for (const member of this.members) {
      if (member.game && member.game.position > maxPosition) {
        maxPosition = member.game.position
      }
    }
    return { position: maxPosition + 1, score: 0, cooldownUntil: null }
  }

  private gameScoreboard(): ScoreboardEntry[] {
    return this.members
      .filter((member) => member.game)
      .sort((left, right) => left.game!.position - right.game!.position)
      .map((member) => ({
        playerId: member.playerId,
        name: member.name,
        role: member.role,
        position: member.game!.position,
        score: member.game!.score,
      }))
  }

  private requireGame() {
    if (!this.game) throw new Error('Room game state is missing.')
    return this.game
  }

  private currentMatchup() {
    const game = this.requireGame()
    game.matchup ??= generateTwoCardMatchup(
      FIRST_PLAYABLE_CONFIGURATION,
      game.seed,
      game.pairRevision,
    )
    return game.matchup
  }

  private touch(now: number) {
    this.lastMeaningfulActivityAt = now
  }

  private changed(now: number) {
    this.revision += 1
    this.touch(now)
  }

  private remember(token: string, commandId: string, result: CommandResult) {
    let results = this.commandResults.get(token)
    if (!results) {
      results = new Map()
      this.commandResults.set(token, results)
    }
    results.set(commandId, result)
    while (results.size > MAX_REMEMBERED_COMMANDS_PER_PLAYER) {
      const oldest = results.keys().next().value as string | undefined
      if (!oldest) break
      results.delete(oldest)
    }
    return result
  }
}
