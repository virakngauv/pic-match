'use client'

import { useMutation } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '@/convex/_generated/api'
import { getOrCreateClientInstanceId } from '@/lib/player-session'

export const ROOM_HEARTBEAT_INTERVAL_MS = 4_000
export const MAX_CONSECUTIVE_HEARTBEAT_FAILURES = 3

export type RoomPresenceConnectionStatus =
  'inactive' | 'connecting' | 'connected' | 'room-full'

export function useRoomPresence(
  roomCode: string,
  clientToken: string | null | undefined,
  enabled: boolean,
) {
  const heartbeat = useMutation(api.presence.heartbeat)
  const [connection, setConnection] = useState<{
    roomCode: string
    status: RoomPresenceConnectionStatus
  }>({ roomCode, status: 'connecting' })

  useEffect(() => {
    if (!enabled || !clientToken) {
      return
    }

    const clientInstanceId = getOrCreateClientInstanceId()
    let canceled = false
    let heartbeatInFlight = false
    let heartbeatStoppedTerminally = false
    let consecutiveHeartbeatFailures = 0
    let intervalId: ReturnType<typeof setInterval> | null = null

    const sendHeartbeat = async () => {
      if (heartbeatInFlight) {
        return
      }

      heartbeatInFlight = true

      try {
        const heartbeatAccepted = await heartbeat({
          roomCode,
          clientToken,
          clientInstanceId,
        })

        if (canceled) {
          return
        }

        if (heartbeatAccepted.status === 'room_full') {
          heartbeatStoppedTerminally = true
          setConnection({ roomCode, status: 'room-full' })
          stopHeartbeat()
          return
        }

        if (heartbeatAccepted.status === 'not_eligible') {
          heartbeatStoppedTerminally = true
          setConnection({ roomCode, status: 'inactive' })
          stopHeartbeat()
          return
        }

        setConnection({ roomCode, status: 'connected' })
        consecutiveHeartbeatFailures = 0
      } catch (error) {
        if (!canceled) {
          console.error('Unable to update room presence.', error)

          consecutiveHeartbeatFailures += 1

          if (
            consecutiveHeartbeatFailures >= MAX_CONSECUTIVE_HEARTBEAT_FAILURES
          ) {
            setConnection({ roomCode, status: 'connecting' })
            stopHeartbeat()
          }
        }
      } finally {
        heartbeatInFlight = false
      }
    }

    function startHeartbeat() {
      if (heartbeatStoppedTerminally) {
        return
      }

      if (intervalId) {
        clearInterval(intervalId)
      }

      consecutiveHeartbeatFailures = 0
      void sendHeartbeat()
      intervalId = setInterval(sendHeartbeat, ROOM_HEARTBEAT_INTERVAL_MS)
    }

    function stopHeartbeat() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        startHeartbeat()
      }
    }

    const handleOnline = () => {
      startHeartbeat()
    }

    const handleOffline = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    startHeartbeat()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      canceled = true
      stopHeartbeat()

      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [clientToken, enabled, heartbeat, roomCode])

  if (!enabled || !clientToken) {
    return 'inactive'
  }

  return connection.roomCode === roomCode ? connection.status : 'connecting'
}
