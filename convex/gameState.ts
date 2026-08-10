import { v } from 'convex/values'

import {
  FIRST_PLAYABLE_CONFIGURATION,
  FIRST_PLAYABLE_CONFIGURATION_ID,
  generateTwoCardMatchup,
} from '../lib/spot-it'
import type { Doc, Id } from './_generated/dataModel'
import { roomMemberRole } from './roomMembers'

export const gameCardView = v.object({
  id: v.string(),
  symbolIds: v.array(v.string()),
})

export const gameScoreboardEntryView = v.object({
  playerId: v.id('roomMembers'),
  name: v.string(),
  role: roomMemberRole,
  position: v.number(),
  score: v.number(),
})

export const playingGameStateView = {
  pairRevision: v.number(),
  cards: v.array(gameCardView),
  scoreboard: v.array(gameScoreboardEntryView),
}

export const finishedGameStateView = {
  winner: gameScoreboardEntryView,
  scoreboard: v.array(gameScoreboardEntryView),
}

type StoredGameState = Pick<
  Doc<'games'>,
  'configurationId' | 'seed' | 'pairRevision'
>

type StoredGameScore = Pick<
  Doc<'gameParticipants'>,
  'roomMemberId' | 'name' | 'role' | 'position' | 'score'
>

export function createInitialGameState(roomId: Id<'rooms'>, startedAt: number) {
  return {
    configurationId: FIRST_PLAYABLE_CONFIGURATION_ID,
    seed: `${FIRST_PLAYABLE_CONFIGURATION_ID}:${roomId}:${startedAt}`,
    pairRevision: 0,
  }
}

export function presentPlayingGameState(
  game: StoredGameState,
  participants: readonly StoredGameScore[],
) {
  const cards = resolvePlayingGameCards(game)

  return {
    pairRevision: game.pairRevision,
    cards,
    scoreboard: presentScoreboard(participants),
  }
}

/** Presents a persisted winner and final scoreboard in frozen game order. */
export function presentFinishedGameState(
  game: Pick<Doc<'games'>, 'winnerRoomMemberId'>,
  participants: readonly StoredGameScore[],
) {
  if (!game.winnerRoomMemberId) {
    throw new Error('The finished game is missing its winner.')
  }

  const winner = participants.find(
    (participant) => participant.roomMemberId === game.winnerRoomMemberId,
  )

  if (!winner) {
    throw new Error(
      'The finished game winner is not in its participant roster.',
    )
  }

  return {
    winner: presentScoreboardEntry(winner),
    scoreboard: presentScoreboard(participants),
  }
}

/** Resolves the public card pair for a persisted game revision. */
export function resolvePlayingGameCards(game: StoredGameState) {
  if (game.configurationId !== FIRST_PLAYABLE_CONFIGURATION_ID) {
    throw new Error('The game uses an unsupported gameplay configuration.')
  }

  if (!game.seed) {
    throw new Error('The game is missing its persisted gameplay state.')
  }

  const matchup = generateTwoCardMatchup(
    FIRST_PLAYABLE_CONFIGURATION,
    game.seed,
    game.pairRevision,
  )

  return matchup.cards.map((card) => ({
    id: card.id,
    symbolIds: [...card.symbolIds],
  }))
}

/** Maps the frozen participant roster to its stable public scoreboard. */
function presentScoreboard(participants: readonly StoredGameScore[]) {
  return [...participants]
    .sort((left, right) => left.position - right.position)
    .map(presentScoreboardEntry)
}

/** Maps one frozen participant score to its public representation. */
function presentScoreboardEntry(participant: StoredGameScore) {
  return {
    playerId: participant.roomMemberId,
    name: participant.name,
    role: participant.role,
    position: participant.position,
    score: participant.score,
  }
}
