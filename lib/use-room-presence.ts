'use client'

import { useMutation } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '@/convex/_generated/api'

export const ROOM_HEARTBEAT_INTERVAL_MS = 4_000

export function useRoomPresence(roomCode: string, clientToken: string) {
  const heartbeat = useMutation(api.presence.heartbeat)
  const [instanceId] = useState(() => crypto.randomUUID())
  const sessionId = JSON.stringify([instanceId, roomCode])
  const heartbeatKey = JSON.stringify([clientToken, roomCode])
  const [startedHeartbeatKey, setStartedHeartbeatKey] = useState<string | null>(
    null,
  )

  useEffect(() => {
    let canceled = false
    let heartbeatInFlight = false
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
          sessionId,
        })

        if (!heartbeatAccepted) {
          stopHeartbeat()
        }
      } catch (error) {
        if (!canceled) {
          console.error('Unable to update room presence.', error)
        }
      } finally {
        heartbeatInFlight = false
      }
    }

    function startHeartbeat() {
      if (intervalId) {
        clearInterval(intervalId)
      }

      void sendHeartbeat()
      setStartedHeartbeatKey(heartbeatKey)
      intervalId = setInterval(sendHeartbeat, ROOM_HEARTBEAT_INTERVAL_MS)
    }

    function stopHeartbeat() {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopHeartbeat()
      } else {
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
  }, [clientToken, heartbeat, heartbeatKey, roomCode, sessionId])

  return startedHeartbeatKey === heartbeatKey
}
