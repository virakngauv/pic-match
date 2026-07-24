import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_CONSECUTIVE_HEARTBEAT_FAILURES,
  ROOM_HEARTBEAT_INTERVAL_MS,
  useRoomPresence,
} from './use-room-presence'

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
    vi.restoreAllMocks()
    mocks.heartbeat.mockReset()
    mocks.heartbeat.mockResolvedValue(true)
    vi.useRealTimers()
  })

  it('does not start presence before membership is confirmed', async () => {
    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', false),
    )

    await act(async () => {})
    expect(mocks.heartbeat).not.toHaveBeenCalled()

    unmount()
  })

  it('dispatches the first heartbeat after membership is confirmed', async () => {
    const pendingHeartbeat = new Promise(() => {})
    mocks.heartbeat.mockReturnValueOnce(pendingHeartbeat)

    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await waitFor(() => {
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
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await waitFor(() => {
      expect(mocks.heartbeat).toHaveBeenCalledTimes(1)
    })

    unmount()
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1)
  })

  it('stops presence when the server rejects a heartbeat', async () => {
    vi.useFakeTimers()
    mocks.heartbeat.mockResolvedValue(false)

    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await act(async () => {})
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS * 2)
    })
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('stops after repeated thrown heartbeat failures', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.heartbeat.mockRejectedValue(new Error('deterministic failure'))

    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await act(async () => {})

    for (
      let attempt = 1;
      attempt < MAX_CONSECUTIVE_HEARTBEAT_FAILURES;
      attempt += 1
    ) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS)
      })
    }

    expect(mocks.heartbeat).toHaveBeenCalledTimes(
      MAX_CONSECUTIVE_HEARTBEAT_FAILURES,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS * 2)
    })
    expect(mocks.heartbeat).toHaveBeenCalledTimes(
      MAX_CONSECUTIVE_HEARTBEAT_FAILURES,
    )

    unmount()
  })

  it('resets the consecutive failure count after a successful heartbeat', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.heartbeat
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce(true)

    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await act(async () => {})

    for (let attempt = 1; attempt < 6; attempt += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS)
      })
    }

    expect(mocks.heartbeat).toHaveBeenCalledTimes(6)

    unmount()
  })
})
