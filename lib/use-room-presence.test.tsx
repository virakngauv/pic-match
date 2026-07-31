import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_CONSECUTIVE_HEARTBEAT_FAILURES,
  ROOM_HEARTBEAT_INTERVAL_MS,
  useRoomPresence,
} from './use-room-presence'

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn().mockResolvedValue({ status: 'accepted' }),
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
  beforeEach(() => {
    window.sessionStorage.setItem('spot-it:client-instance-id', 'b'.repeat(32))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    mocks.heartbeat.mockReset()
    mocks.heartbeat.mockResolvedValue({ status: 'accepted' })
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
        clientInstanceId: 'b'.repeat(32),
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
    mocks.heartbeat.mockResolvedValue({ status: 'room_full' })

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

  it('clears a connected state when the member is no longer eligible', async () => {
    vi.useFakeTimers()
    mocks.heartbeat
      .mockResolvedValueOnce({ status: 'accepted' })
      .mockResolvedValueOnce({ status: 'not_eligible' })

    const { result, unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await act(async () => {})
    expect(result.current).toBe('connected')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS)
    })

    expect(result.current).toBe('inactive')
    unmount()
  })

  it('keeps heartbeats running while the page is hidden', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await act(async () => {})
    document.dispatchEvent(new Event('visibilitychange'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS)
    })

    expect(mocks.heartbeat).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('sends an immediate heartbeat when the page becomes visible', async () => {
    vi.useFakeTimers()
    const hidden = vi
      .spyOn(document, 'hidden', 'get')
      .mockReturnValueOnce(true)
      .mockReturnValue(false)

    const { unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await act(async () => {})
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))

    await act(async () => {})

    expect(hidden).toHaveBeenCalled()
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('restarts a failure-stopped interval when the page becomes visible', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    mocks.heartbeat.mockRejectedValue(new Error('transient failure'))

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

    mocks.heartbeat.mockResolvedValue({ status: 'accepted' })
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS)
    })

    expect(mocks.heartbeat).toHaveBeenCalledTimes(
      MAX_CONSECUTIVE_HEARTBEAT_FAILURES + 2,
    )
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

  it('clears a connected state after repeated heartbeat failures', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.heartbeat
      .mockResolvedValueOnce({ status: 'accepted' })
      .mockRejectedValue(new Error('deterministic failure'))

    const { result, unmount } = renderHook(() =>
      useRoomPresence('ROOM2', 'client-token', true),
    )

    await act(async () => {})
    expect(result.current).toBe('connected')

    for (
      let attempt = 0;
      attempt < MAX_CONSECUTIVE_HEARTBEAT_FAILURES;
      attempt += 1
    ) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS)
      })
    }

    expect(result.current).toBe('connecting')
    unmount()
  })

  it('resets the consecutive failure count after a successful heartbeat', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.heartbeat
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce({ status: 'accepted' })
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValueOnce({ status: 'accepted' })

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
