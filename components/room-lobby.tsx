'use client'

import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import Link from 'next/link'
import { useEffect, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { api } from '@/convex/_generated/api'
import {
  getPrivatePlayerKey,
  removePrivatePlayerKey,
} from '@/lib/player-session'
import { useRoomPresence } from '@/lib/use-room-presence'

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const privatePlayerKey = useSyncExternalStore(
    subscribeToPlayerKey,
    () => getPrivatePlayerKey(roomCode),
    getServerPlayerKey,
  )

  const lobby = useQuery(
    api.rooms.getLobby,
    privatePlayerKey
      ? {
          roomCode,
          privatePlayerKey,
        }
      : 'skip',
  )

  useEffect(() => {
    if (lobby === null) {
      removePrivatePlayerKey(roomCode)
    }
  }, [lobby, roomCode])

  if (privatePlayerKey === undefined) {
    return <LobbyLoading />
  }

  if (!privatePlayerKey) {
    return <LobbyMembershipRequired roomCode={roomCode} />
  }

  if (lobby === undefined) {
    return <LobbyLoading />
  }

  if (lobby === null) {
    return <LobbyMembershipRequired roomCode={roomCode} />
  }

  return (
    <ConnectedRoomLobby
      lobby={lobby}
      privatePlayerKey={privatePlayerKey}
      roomCode={roomCode}
    />
  )
}

function ConnectedRoomLobby({
  lobby,
  privatePlayerKey,
  roomCode,
}: {
  lobby: NonNullable<FunctionReturnType<typeof api.rooms.getLobby>>
  privatePlayerKey: string
  roomCode: string
}) {
  useRoomPresence(roomCode, privatePlayerKey)

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

        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/home">Back to home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}

function subscribeToPlayerKey() {
  return () => {}
}

function getServerPlayerKey() {
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
