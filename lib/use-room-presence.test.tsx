import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useRoomPresence } from './use-room-presence'

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/convex/_generated/api', () => ({
  api: {
    presence: {
      heartbeat: 'heartbeat',
    },
  },
}))

vi.mock('convex/react', () => ({
  useMutation: () => mocks.heartbeat,
}))

describe('useRoomPresence', () => {
  afterEach(() => {
    mocks.heartbeat.mockClear()
  })

  it('reports that the first heartbeat was dispatched without waiting for it', async () => {
    const pendingHeartbeat = new Promise(() => {})
    mocks.heartbeat.mockReturnValueOnce(pendingHeartbeat)

    const { result, unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token'),
    )

    await waitFor(() => {
      expect(result.current).toBe(true)
      expect(mocks.heartbeat).toHaveBeenCalledWith({
        roomCode: 'ROOM2',
        clientToken: 'client-token',
        sessionId: expect.any(String),
      })
    })

    unmount()
  })

  it('does not send a disconnect mutation during cleanup', async () => {
    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token'),
    )

    await waitFor(() => {
      expect(mocks.heartbeat).toHaveBeenCalledTimes(1)
    })

    unmount()
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1)
  })
})
