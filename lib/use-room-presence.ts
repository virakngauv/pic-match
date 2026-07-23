'use client'

import { useConvex, useMutation } from 'convex/react'
import { useEffect, useRef, useState } from 'react'

import { api } from '@/convex/_generated/api'

export const ROOM_HEARTBEAT_INTERVAL_MS = 4_000

export function useRoomPresence(roomCode: string, privatePlayerKey: string) {
  const convex = useConvex()
  const heartbeat = useMutation(api.presence.heartbeat)
  const disconnect = useMutation(api.presence.disconnect)
  const [instanceId] = useState(() => crypto.randomUUID())
  const sessionId = JSON.stringify([instanceId, roomCode])
  const sessionTokenRef = useRef<string | null>(null)

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
        const result = await heartbeat({
          roomCode,
          privatePlayerKey,
          sessionId,
        })

        if (canceled) {
          await disconnect({ sessionToken: result.sessionToken })
          return
        }

        sessionTokenRef.current = result.sessionToken
      } catch (error) {
        if (!canceled) {
          console.error('Unable to update room presence.', error)
        }
      } finally {
        heartbeatInFlight = false
      }
    }

    const startHeartbeat = () => {
      if (intervalId) {
        clearInterval(intervalId)
      }

      void sendHeartbeat()
      intervalId = setInterval(sendHeartbeat, ROOM_HEARTBEAT_INTERVAL_MS)
    }

    const stopHeartbeat = async () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }

      const sessionToken = sessionTokenRef.current
      sessionTokenRef.current = null

      if (sessionToken) {
        await disconnect({ sessionToken })
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void stopHeartbeat()
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

    const handleBeforeUnload = () => {
      const sessionToken = sessionTokenRef.current

      if (!sessionToken) {
        return
      }

      const body = new Blob(
        [
          JSON.stringify({
            path: 'presence:disconnect',
            args: { sessionToken },
          }),
        ],
        { type: 'application/json' },
      )

      navigator.sendBeacon(`${convex.url}/api/mutation`, body)
    }

    startHeartbeat()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      canceled = true

      if (intervalId) {
        clearInterval(intervalId)
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeunload', handleBeforeUnload)

      const sessionToken = sessionTokenRef.current
      sessionTokenRef.current = null

      if (sessionToken) {
        void disconnect({ sessionToken })
      }
    }
  }, [convex.url, disconnect, heartbeat, privatePlayerKey, roomCode, sessionId])
}
