import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useRoomPresence } from './use-room-presence'

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn().mockResolvedValue(null),
  heartbeat: vi.fn().mockResolvedValue({
    roomToken: 'room-token',
    sessionToken: 'session-token',
  }),
}))

vi.mock('@/convex/_generated/api', () => ({
  api: {
    presence: {
      disconnect: 'disconnect',
      heartbeat: 'heartbeat',
    },
  },
}))

vi.mock('convex/react', () => ({
  useConvex: () => ({ url: 'https://example.convex.cloud' }),
  useMutation: (reference: string) =>
    reference === 'heartbeat' ? mocks.heartbeat : mocks.disconnect,
}))

describe('useRoomPresence', () => {
  afterEach(() => {
    mocks.disconnect.mockClear()
    mocks.heartbeat.mockClear()
  })

  it('connects immediately and gracefully disconnects on cleanup', async () => {
    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token'),
    )

    await waitFor(() => {
      expect(mocks.heartbeat).toHaveBeenCalledWith({
        roomCode: 'ROOM2',
        clientToken: 'client-token',
        sessionId: expect.any(String),
      })
    })

    act(() => {
      unmount()
    })

    await waitFor(() => {
      expect(mocks.disconnect).toHaveBeenCalledWith({
        sessionToken: 'session-token',
      })
    })
  })
})
