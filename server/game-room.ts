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
} from '../lib/spot-it'

export const MAX_ROOM_MEMBERS = FIRST_PLAYABLE_CONFIGURATION.participantCapacity
export const INCORRECT_CLAIM_COOLDOWN_MS = 1_000
const MAX_REMEMBERED_COMMANDS_PER_PLAYER = 100

type Member = {
  playerId: string
  token: string
  name: string
  role: PlayerRole
  joinedAt: number
  active: boolean
}

type Participant = {
  playerId: string
  name: string
  role: PlayerRole
  position: number
  score: number
  cooldownUntil: number | null
}

type GameState = {
  seed: string
  pairRevision: number
  participants: Participant[]
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
    const existing = this.findMember(token)

    if (existing?.active) {
      this.touch(now)
      return { status: 'success' }
    }

    if (this.phase !== 'lobby') {
      return {
        status: 'game_in_progress',
        message: 'This game has already started.',
      }
    }

    if (this.activeMembers().length >= MAX_ROOM_MEMBERS) {
      return { status: 'room_full', message: 'This room is full.' }
    }

    if (existing) {
      existing.name = name
      existing.active = true
    } else {
      this.members.push(this.createMember(token, name, 'player', now))
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
      const departingParticipant = this.game?.participants.find(
        (candidate) => candidate.playerId === member.playerId,
      )
      if (departingParticipant) departingParticipant.role = 'player'
      const successor = this.activeMembers()[0]
      if (successor) {
        successor.role = 'host'
        const participant = this.game?.participants.find(
          (candidate) => candidate.playerId === successor.playerId,
        )
        if (participant) participant.role = 'host'
      }
    }

    this.commandResults.delete(token)
    if (this.phase === 'lobby') {
      const index = this.members.indexOf(member)
      if (index >= 0) this.members.splice(index, 1)
    }
    this.changed(now)
    return { status: 'success' }
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
    if (members.length < 2) {
      return {
        status: 'invalid',
        message: 'At least 2 players are required to start the game.',
      }
    }

    this.game = {
      seed: `${this.initialSeed}:${this.revision}:${now}`,
      pairRevision: 0,
      participants: members.map((member, position) => ({
        playerId: member.playerId,
        name: member.name,
        role: member.role,
        position,
        score: 0,
        cooldownUntil: null,
      })),
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

    const participant = this.participantForToken(token)
    if (!participant || this.phase !== 'playing' || !this.game) {
      return {
        status: 'forbidden',
        message: 'Only current game participants can submit a match.',
      }
    }

    this.touch(now)
    if (participant.cooldownUntil && participant.cooldownUntil > now) {
      return this.remember(token, claim.commandId, {
        status: 'cooldown',
        message: 'Wait for your cooldown to finish.',
        cooldownUntil: participant.cooldownUntil,
      })
    }

    if (claim.pairRevision !== this.game.pairRevision) {
      return this.remember(token, claim.commandId, {
        status: 'stale',
        message: 'The cards changed before this claim arrived.',
      })
    }

    const cards = generateTwoCardMatchup(
      FIRST_PLAYABLE_CONFIGURATION,
      this.game.seed,
      this.game.pairRevision,
    ).cards
    const correct =
      cards[0].symbolIds.includes(claim.firstSymbolId) &&
      cards[1].symbolIds.includes(claim.secondSymbolId) &&
      claim.firstSymbolId === claim.secondSymbolId

    if (!correct) {
      participant.cooldownUntil = now + INCORRECT_CLAIM_COOLDOWN_MS
      this.changed(now)
      return this.remember(token, claim.commandId, {
        status: 'incorrect',
        message: 'Incorrect match.',
        cooldownUntil: participant.cooldownUntil,
      })
    }

    participant.score += 1
    participant.cooldownUntil = null
    this.game.lastAcceptedClaim = {
      scorerId: participant.playerId,
      scorerName: participant.name,
      symbolId: claim.firstSymbolId,
      pairRevision: this.game.pairRevision,
    }

    if (participant.score >= FIRST_PLAYABLE_CONFIGURATION.winningScore) {
      this.game.winnerPlayerId = participant.playerId
      this.phase = 'finished'
    } else {
      this.game.pairRevision += 1
    }

    this.changed(now)
    return this.remember(token, claim.commandId, { status: 'success' })
  }

  prepareRematch(token: string, now = Date.now()): CommandResult {
    const actor = this.findActiveMember(token)
    const participant = this.participantForToken(token)
    if (!actor || actor.role !== 'host' || !participant) {
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
      if (!this.members[index]?.active) this.members.splice(index, 1)
    }
    this.commandResults.clear()
    this.changed(now)
    return { status: 'success' }
  }

  snapshotFor(token: string): RoomSnapshot {
    const member = this.findActiveMember(token)
    if (!member) {
      return {
        status: this.phase === 'lobby' ? 'joinable' : 'game_in_progress',
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
    const participant = game.participants.find(
      (candidate) => candidate.playerId === member.playerId,
    )
    if (!participant) {
      return { status: 'game_in_progress', roomCode: this.code }
    }

    const scoreboard = game.participants.map(toScoreboardEntry)
    const player = {
      playerId: participant.playerId,
      name: participant.name,
      role: participant.role,
      position: participant.position,
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

    const matchup = generateTwoCardMatchup(
      FIRST_PLAYABLE_CONFIGURATION,
      game.seed,
      game.pairRevision,
    )

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
      cooldownUntil: participant.cooldownUntil,
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

  private participantForToken(token: string) {
    const member = this.findActiveMember(token)
    return member && this.game
      ? (this.game.participants.find(
          (participant) => participant.playerId === member.playerId,
        ) ?? null)
      : null
  }

  private requireGame() {
    if (!this.game) throw new Error('Room game state is missing.')
    return this.game
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

function toScoreboardEntry(participant: Participant): ScoreboardEntry {
  return {
    playerId: participant.playerId,
    name: participant.name,
    role: participant.role,
    position: participant.position,
    score: participant.score,
  }
}
