'use client'

import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { api } from '@/convex/_generated/api'
import { getClientToken, subscribeToClientToken } from '@/lib/player-session'
import { useRoomPresence } from '@/lib/use-room-presence'

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToClientToken(onStoreChange),
    [],
  )
  const clientToken = useSyncExternalStore(
    subscribe,
    getClientToken,
    getServerClientToken,
  )

  if (clientToken === undefined) {
    return <LobbyLoading />
  }

  if (!clientToken) {
    return <LobbyMembershipRequired roomCode={roomCode} />
  }

  return <PresentRoomLobby roomCode={roomCode} clientToken={clientToken} />
}

function PresentRoomLobby({
  roomCode,
  clientToken,
}: {
  roomCode: string
  clientToken: string
}) {
  const heartbeatStarted = useRoomPresence(roomCode, clientToken)
  const lobby = useQuery(
    api.rooms.getLobby,
    heartbeatStarted
      ? {
          roomCode,
          clientToken,
        }
      : 'skip',
  )

  if (lobby === undefined) {
    return <LobbyLoading />
  }

  if (lobby === null) {
    return <LobbyMembershipRequired roomCode={roomCode} />
  }

  return (
    <ConnectedRoomLobby
      lobby={lobby}
      clientToken={clientToken}
      roomCode={roomCode}
    />
  )
}

function ConnectedRoomLobby({
  lobby,
  clientToken,
  roomCode,
}: {
  lobby: NonNullable<FunctionReturnType<typeof api.rooms.getLobby>>
  clientToken: string
  roomCode: string
}) {
  const router = useRouter()
  const leaveRoom = useMutation(api.rooms.leave)
  const [isLeaving, setIsLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const handleLeaveRoom = async () => {
    setIsLeaving(true)
    setLeaveError(null)

    try {
      await leaveRoom({ roomCode, clientToken })
      router.push('/home')
    } catch {
      setLeaveError('Unable to leave the room. Please try again.')
      setIsLeaving(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 shadow-sm sm:p-10">
        <div className="text-center">
          <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
            Room lobby
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            You’re in.
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
            Share this room code with the people you want to play with.
          </p>
          <output className="bg-foreground text-background mt-8 block rounded-2xl px-5 py-6 font-mono text-3xl font-bold tracking-[0.22em] uppercase sm:text-4xl">
            {lobby.roomCode}
          </output>
        </div>

        <div className="mt-8 border-t pt-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">
              In this room
            </h2>
            <span className="text-muted-foreground text-sm">
              {lobby.members.length}{' '}
              {lobby.members.length === 1 ? 'player' : 'players'}
            </span>
          </div>
          <ul className="mt-4 grid gap-2" aria-label="Players in this room">
            {lobby.members.map((member) => (
              <li
                key={member.playerId}
                className="bg-background flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
              >
                <span className="font-semibold">{member.name}</span>
                <span className="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
                  {member.isSelf
                    ? member.role === 'host'
                      ? 'You · Host'
                      : 'You'
                    : member.role === 'host'
                      ? 'Host'
                      : 'Player'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid justify-items-center gap-3">
          {leaveError ? (
            <p className="text-destructive text-sm" role="alert">
              {leaveError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={isLeaving}
            onClick={handleLeaveRoom}
          >
            {isLeaving ? 'Leaving…' : 'Leave room'}
          </Button>
        </div>
      </section>
    </main>
  )
}

function getServerClientToken() {
  return undefined
}

function LobbyLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <p className="text-muted-foreground text-sm" role="status">
        Loading room…
      </p>
    </main>
  )
}

function LobbyMembershipRequired({ roomCode }: { roomCode: string }) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Join this room.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Enter your name to get your player identity for this room.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href={`/join?roomCode=${encodeURIComponent(roomCode)}`}>
              Continue to join
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Back to home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
