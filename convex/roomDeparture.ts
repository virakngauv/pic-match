import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { getRoomPhase } from './roomLifecycle'
import { isActiveRoomMember } from './roomMembers'

type DepartureKind = 'presence_loss' | 'explicit_leave'

type RemoveRoomPresence = (
  roomId: Id<'rooms'>,
  memberId: Id<'roomMembers'>,
) => Promise<unknown>

export function shouldTransferLobbyHost({
  room,
  member,
  departureKind,
}: {
  room: Doc<'rooms'>
  member: Doc<'roomMembers'>
  departureKind: DepartureKind
}) {
  return (
    departureKind === 'explicit_leave' &&
    getRoomPhase(room) === 'lobby' &&
    member.role === 'host' &&
    isActiveRoomMember(member.status)
  )
}

async function findLongestTenuredActiveSuccessor(
  ctx: MutationCtx,
  roomId: Id<'rooms'>,
  departingMemberId: Id<'roomMembers'>,
) {
  const oldestActiveMembers = await ctx.db
    .query('roomMembers')
    .withIndex('by_room_id_and_status_and_joined_at', (index) =>
      index.eq('roomId', roomId).eq('status', 'active'),
    )
    .order('asc')
    .take(2)

  return (
    oldestActiveMembers.find((member) => member._id !== departingMemberId) ??
    null
  )
}

export async function explicitlyLeaveRoom(
  ctx: MutationCtx,
  room: Doc<'rooms'>,
  member: Doc<'roomMembers'>,
  removeRoomPresence: RemoveRoomPresence,
) {
  if (!isActiveRoomMember(member.status)) {
    return
  }

  if (
    shouldTransferLobbyHost({
      room,
      member,
      departureKind: 'explicit_leave',
    })
  ) {
    const successor = await findLongestTenuredActiveSuccessor(
      ctx,
      room._id,
      member._id,
    )

    await ctx.db.patch(member._id, { role: 'player', status: 'left' })

    if (successor) {
      await ctx.db.patch(successor._id, { role: 'host' })
    } else {
      await ctx.db.delete(room._id)
    }
  } else {
    await ctx.db.patch(member._id, { status: 'left' })
  }

  await removeRoomPresence(room._id, member._id)
}
