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

  return {
    pairRevision: matchup.revision,
    cards: matchup.cards.map((card) => ({
      id: card.id,
      symbolIds: [...card.symbolIds],
    })),
    scoreboard: [...participants]
      .sort((left, right) => left.position - right.position)
      .map((participant) => ({
        playerId: participant.roomMemberId,
        name: participant.name,
        role: participant.role,
        position: participant.position,
        score: participant.score,
      })),
  }
}
