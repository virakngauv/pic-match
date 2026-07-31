import { describe, expect, it, vi } from 'vitest'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { explicitlyLeaveRoom, shouldTransferLobbyHost } from './roomDeparture'

function room(overrides: Partial<Doc<'rooms'>> = {}): Doc<'rooms'> {
  return {
    _id: 'room-1' as Id<'rooms'>,
    _creationTime: 1,
    code: 'bcdf2',
    creatorName: 'Host',
    createdAt: 1,
    phase: 'lobby',
    ...overrides,
  }
}

function member({
  id,
  role = 'player',
  status = 'active',
  joinedAt,
  creationTime = joinedAt,
}: {
  id: string
  role?: 'host' | 'player'
  status?: 'active' | 'left'
  joinedAt: number
  creationTime?: number
}): Doc<'roomMembers'> {
  return {
    _id: id as Id<'roomMembers'>,
    _creationTime: creationTime,
    roomId: 'room-1' as Id<'rooms'>,
    name: id,
    privatePlayerKey: id.padEnd(32, '0'),
    role,
    status,
    joinedAt,
  }
}

function testContext(initialMembers: Doc<'roomMembers'>[]) {
  const members = new Map(
    initialMembers.map((roomMember) => [roomMember._id, roomMember]),
  )
  let roomExists = true

  const patch = vi.fn(
    async (id: Id<'roomMembers'>, value: Partial<Doc<'roomMembers'>>) => {
      const current = members.get(id)
      if (!current) {
        throw new Error(`Missing member ${id}`)
      }
      members.set(id, { ...current, ...value })
    },
  )
  const deleteDocument = vi.fn(async (id: Id<'rooms'>) => {
    expect(id).toBe('room-1')
    roomExists = false
  })
  const take = vi.fn(async (limit: number) =>
    [...members.values()]
      .filter(
        (roomMember) =>
          roomMember.roomId === ('room-1' as Id<'rooms'>) &&
          roomMember.status === 'active',
      )
      .sort(
        (left, right) =>
          left.joinedAt - right.joinedAt ||
          left._creationTime - right._creationTime ||
          left._id.localeCompare(right._id),
      )
      .slice(0, limit),
  )
  const order = vi.fn(() => ({ take }))
  const withIndex = vi.fn(
    (
      _indexName: string,
      configure: (index: {
        eq: (field: string, value: unknown) => unknown
      }) => unknown,
    ) => {
      const index = {
        eq: vi.fn(function (this: unknown) {
          return this
        }),
      }
      configure(index)
      return { order }
    },
  )
  const query = vi.fn(() => ({ withIndex }))
  const ctx = {
    db: { query, patch, delete: deleteDocument },
  } as unknown as MutationCtx

  return {
    ctx,
    deleteDocument,
    members,
    patch,
    roomExists: () => roomExists,
  }
}

describe('lobby room departure', () => {
  it('does not transfer host ownership for a temporary presence loss', () => {
    const host = member({ id: 'host', role: 'host', joinedAt: 1 })

    expect(
      shouldTransferLobbyHost({
        room: room(),
        member: host,
        departureKind: 'presence_loss',
      }),
    ).toBe(false)
    expect(host).toMatchObject({ role: 'host', status: 'active' })
  })

  it('atomically promotes the longest-tenured active member on host leave', async () => {
    const host = member({ id: 'host', role: 'host', joinedAt: 1 })
    const oldest = member({ id: 'oldest', joinedAt: 2 })
    const newer = member({ id: 'newer', joinedAt: 3 })
    const alreadyLeft = member({ id: 'left', status: 'left', joinedAt: 0 })
    const { ctx, members, patch, roomExists } = testContext([
      newer,
      alreadyLeft,
      host,
      oldest,
    ])
    const removePresence = vi.fn(async () => undefined)

    await explicitlyLeaveRoom(ctx, room(), host, removePresence)

    expect(patch.mock.calls).toEqual([
      ['host', { role: 'player', status: 'left' }],
      ['oldest', { role: 'host' }],
    ])
    expect(members.get(oldest._id)).toMatchObject({
      role: 'host',
      status: 'active',
    })
    expect(members.get(newer._id)).toMatchObject({ role: 'player' })
    expect(roomExists()).toBe(true)
    expect(removePresence).toHaveBeenCalledWith('room-1', 'host')
  })

  it('uses creation time to break equal join-time ties', async () => {
    const host = member({ id: 'host', role: 'host', joinedAt: 1 })
    const firstCreated = member({
      id: 'first-created',
      joinedAt: 2,
      creationTime: 2,
    })
    const secondCreated = member({
      id: 'second-created',
      joinedAt: 2,
      creationTime: 3,
    })
    const { ctx, members } = testContext([secondCreated, host, firstCreated])

    await explicitlyLeaveRoom(ctx, room(), host, async () => undefined)

    expect(members.get(firstCreated._id)).toMatchObject({ role: 'host' })
    expect(members.get(secondCreated._id)).toMatchObject({ role: 'player' })
  })

  it('deletes a lobby that has no eligible successor', async () => {
    const host = member({ id: 'host', role: 'host', joinedAt: 1 })
    const { ctx, deleteDocument, members, roomExists } = testContext([host])

    await explicitlyLeaveRoom(ctx, room(), host, async () => undefined)

    expect(members.get(host._id)).toMatchObject({
      role: 'player',
      status: 'left',
    })
    expect(deleteDocument).toHaveBeenCalledWith('room-1')
    expect(roomExists()).toBe(false)
  })

  it('does not change host ownership when a non-host leaves', async () => {
    const host = member({ id: 'host', role: 'host', joinedAt: 1 })
    const player = member({ id: 'player', joinedAt: 2 })
    const { ctx, members, patch } = testContext([host, player])

    await explicitlyLeaveRoom(ctx, room(), player, async () => undefined)

    expect(patch).toHaveBeenCalledOnce()
    expect(patch).toHaveBeenCalledWith('player', { status: 'left' })
    expect(members.get(host._id)).toMatchObject({
      role: 'host',
      status: 'active',
    })
  })

  it('ignores a repeated leave after a competing attempt already completed', async () => {
    const host = member({ id: 'host', role: 'host', joinedAt: 1 })
    const player = member({ id: 'player', joinedAt: 2 })
    const state = testContext([host, player])
    const removePresence = vi.fn(async () => undefined)

    await explicitlyLeaveRoom(state.ctx, room(), host, removePresence)

    const departedHost = state.members.get(host._id)
    expect(departedHost).toBeDefined()
    await explicitlyLeaveRoom(state.ctx, room(), departedHost!, removePresence)

    expect(state.patch.mock.calls).toEqual([
      ['host', { role: 'player', status: 'left' }],
      ['player', { role: 'host' }],
    ])
    expect(removePresence).toHaveBeenCalledOnce()
  })

  it('does not transfer host ownership after the lobby', async () => {
    const host = member({ id: 'host', role: 'host', joinedAt: 1 })
    const player = member({ id: 'player', joinedAt: 2 })
    const { ctx, members, patch } = testContext([host, player])

    await explicitlyLeaveRoom(
      ctx,
      room({ phase: 'playing', startedAt: 10 }),
      host,
      async () => undefined,
    )

    expect(patch).toHaveBeenCalledOnce()
    expect(patch).toHaveBeenCalledWith('host', { status: 'left' })
    expect(members.get(player._id)).toMatchObject({ role: 'player' })
  })

  it.each([
    ['host leaves first', ['host', 'player']],
    ['successor leaves first', ['player', 'host']],
  ] as const)(
    'converges safely when competing leave attempts serialize: %s',
    async (_label, leaveOrder) => {
      const host = member({ id: 'host', role: 'host', joinedAt: 1 })
      const player = member({ id: 'player', joinedAt: 2 })
      const state = testContext([host, player])

      for (const memberId of leaveOrder) {
        const departingMember = state.members.get(memberId as Id<'roomMembers'>)
        expect(departingMember).toBeDefined()

        await explicitlyLeaveRoom(
          state.ctx,
          room(),
          departingMember!,
          async () => undefined,
        )
      }

      expect(state.roomExists()).toBe(false)
      expect([...state.members.values()]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _id: 'host', status: 'left' }),
          expect.objectContaining({ _id: 'player', status: 'left' }),
        ]),
      )
    },
  )
})
