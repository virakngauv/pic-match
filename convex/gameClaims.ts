import { v } from 'convex/values'

import { FIRST_PLAYABLE_CONFIGURATION } from '../lib/spot-it'
import { MATCH_CLAIM_STATUSES, type MatchClaimResult } from '../lib/match-claim'
import { mutation } from './_generated/server'
import { getGameParticipant } from './gameParticipants'
import { resolvePlayingGameCards } from './gameState'
import { validateClientToken } from './playerKeys'
import { getRoomPhase } from './roomLifecycle'
import { isActiveRoomMember } from './roomMembers'
import { normalizeRoomCode, ROOM_CODE_PATTERN } from './roomCode'

export const matchClaimResult = v.object({
  status: v.union(...MATCH_CLAIM_STATUSES.map((status) => v.literal(status))),
})

type ClaimCard = {
  symbolIds: readonly string[]
}

/** Classifies a claim against the exact card pair and revision it viewed. */
export function evaluateMatchClaim({
  currentRevision,
  viewedRevision,
  cards,
  firstSymbolId,
  secondSymbolId,
}: {
  currentRevision: number
  viewedRevision: number
  cards: readonly ClaimCard[]
  firstSymbolId: string
  secondSymbolId: string
}): MatchClaimResult {
  if (!Number.isInteger(viewedRevision) || viewedRevision < 0) {
    throw new Error('The viewed pair revision must be a non-negative integer.')
  }

  if (viewedRevision !== currentRevision) {
    return { status: 'stale' }
  }

  const firstCard = cards[0]
  const secondCard = cards[1]

  if (!firstCard || !secondCard || cards.length !== 2) {
    throw new Error('The current game does not have a valid card pair.')
  }

  const isFirstSelectionOnCard = firstCard.symbolIds.includes(firstSymbolId)
  const isSecondSelectionOnCard = secondCard.symbolIds.includes(secondSymbolId)

  if (
    !isFirstSelectionOnCard ||
    !isSecondSelectionOnCard ||
    firstSymbolId !== secondSymbolId
  ) {
    return { status: 'incorrect' }
  }

  return { status: 'accepted' }
}

/** Evaluates one participant claim and atomically accepts its score and pair. */
export const submit = mutation({
  args: {
    roomCode: v.string(),
    clientToken: v.string(),
    pairRevision: v.number(),
    firstSymbolId: v.string(),
    secondSymbolId: v.string(),
  },
  returns: matchClaimResult,
  handler: async (
    ctx,
    { roomCode, clientToken, pairRevision, firstSymbolId, secondSymbolId },
  ): Promise<MatchClaimResult> => {
    const normalizedRoomCode = normalizeRoomCode(roomCode)
    const validatedClientToken = validateClientToken(clientToken)

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      throw new Error('Room not found.')
    }

    const room = await ctx.db
      .query('rooms')
      .withIndex('by_code', (index) => index.eq('code', normalizedRoomCode))
      .unique()

    if (!room || getRoomPhase(room) !== 'playing' || !room.gameId) {
      throw new Error('The game is not accepting match claims.')
    }

    const member = await ctx.db
      .query('roomMembers')
      .withIndex('by_room_id_and_private_player_key', (index) =>
        index
          .eq('roomId', room._id)
          .eq('privatePlayerKey', validatedClientToken),
      )
      .unique()
    const participant = member
      ? await getGameParticipant(ctx, room.gameId, member._id)
      : null

    if (!member || !isActiveRoomMember(member.status) || participant === null) {
      throw new Error('Only active game participants can submit match claims.')
    }

    const game = await ctx.db.get(room.gameId)

    if (!game) {
      throw new Error('Unable to resolve the current game.')
    }

    const result = evaluateMatchClaim({
      currentRevision: game.pairRevision,
      viewedRevision: pairRevision,
      cards: resolvePlayingGameCards(game),
      firstSymbolId,
      secondSymbolId,
    })

    if (result.status === 'accepted') {
      const nextScore = participant.score + 1

      await ctx.db.patch(participant._id, { score: nextScore })

      if (nextScore >= FIRST_PLAYABLE_CONFIGURATION.winningScore) {
        await ctx.db.patch(game._id, {
          winnerRoomMemberId: participant.roomMemberId,
        })
        await ctx.db.patch(room._id, { phase: 'finished' })
      } else {
        await ctx.db.patch(game._id, { pairRevision: game.pairRevision + 1 })
      }
    }

    return result
  },
})
