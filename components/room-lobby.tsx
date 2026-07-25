'use client'

import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { JoinRoomScreen } from '@/components/join-room-screen'
import { usePlayerSession } from '@/components/player-session-provider'
import { Button } from '@/components/ui/button'
import { api } from '@/convex/_generated/api'
import { useRoomPresence } from '@/lib/use-room-presence'

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const { clientToken } = usePlayerSession()

  return <PresentRoomLobby roomCode={roomCode} clientToken={clientToken} />
}

function PresentRoomLobby({
  roomCode,
  clientToken,
}: {
  roomCode: string
  clientToken: string | null | undefined
}) {
  const lobby = useQuery(api.rooms.getLobby, { roomCode })
  const queriedCurrentMember = useQuery(
    api.rooms.getCurrentMember,
    clientToken ? { roomCode, clientToken } : 'skip',
  )

  useRoomPresence(
    roomCode,
    clientToken,
    Boolean(clientToken && queriedCurrentMember),
  )

  if (lobby === null) {
    return <RoomNotFound roomCode={roomCode} />
  }

  if (lobby === undefined || clientToken === undefined) {
    return <RoomEntrySkeleton />
  }

  if (clientToken === null) {
    return (
      <JoinRoomScreen roomCode={lobby.roomCode} navigateAfterJoin={false} />
    )
  }

  if (queriedCurrentMember === undefined) {
    return <RoomEntrySkeleton />
  }

  if (queriedCurrentMember === null) {
    return (
      <JoinRoomScreen roomCode={lobby.roomCode} navigateAfterJoin={false} />
    )
  }

  return (
    <ConnectedRoomLobby
      lobby={lobby}
      clientToken={clientToken}
      currentMember={queriedCurrentMember}
    />
  )
}

function RoomEntrySkeleton() {
  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-busy="true"
      aria-label="Checking room access"
    >
      <section
        className="bg-card mx-auto w-full max-w-lg rounded-[2rem] border p-7 shadow-sm sm:p-10"
        aria-hidden="true"
      >
        <div className="bg-muted h-3 w-24 animate-pulse rounded-full" />
        <div className="bg-muted mt-5 h-12 w-4/5 animate-pulse rounded-2xl" />
        <div className="bg-muted mt-4 h-5 w-full animate-pulse rounded-full" />
        <div className="bg-muted mt-2 h-5 w-2/3 animate-pulse rounded-full" />
        <div className="bg-muted mt-8 h-11 w-full animate-pulse rounded-xl" />
        <div className="bg-muted mt-5 h-11 w-full animate-pulse rounded-xl" />
        <div className="bg-muted mt-8 h-12 w-full animate-pulse rounded-full" />
      </section>
    </main>
  )
}

function ConnectedRoomLobby({
  lobby,
  clientToken,
  currentMember,
}: {
  lobby: NonNullable<FunctionReturnType<typeof api.rooms.getLobby>>
  clientToken: string
  currentMember: NonNullable<
    FunctionReturnType<typeof api.rooms.getCurrentMember>
  >
}) {
  const router = useRouter()
  const leaveRoom = useMutation(api.rooms.leave)
  const [isLeaving, setIsLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const handleLeaveRoom = async () => {
    setIsLeaving(true)
    setLeaveError(null)

    try {
      await leaveRoom({ roomCode: lobby.roomCode, clientToken })
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
            Ready to play.
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
            Share this room code with the people you want to play with, or join
            when you’re ready.
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
                  {member.playerId === currentMember.playerId
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

        <div className="mt-8 grid min-h-10 justify-items-center gap-3">
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

function RoomNotFound({ roomCode }: { roomCode: string }) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Sorry, room {roomCode} doesn’t exist.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          You can return home or create a new room to start playing.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/create">Create a new room</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Go home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
