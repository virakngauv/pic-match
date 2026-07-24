'use client'

import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
  const currentMember = clientToken === null ? null : queriedCurrentMember

  useRoomPresence(
    roomCode,
    clientToken,
    currentMember !== null && currentMember !== undefined,
  )

  if (lobby === null) {
    return <RoomNotFound roomCode={roomCode} />
  }

  return (
    <ConnectedRoomLobby
      lobby={lobby}
      clientToken={clientToken}
      currentMember={currentMember}
      roomCode={roomCode}
    />
  )
}

function ConnectedRoomLobby({
  lobby,
  clientToken,
  currentMember,
  roomCode,
}: {
  lobby: NonNullable<FunctionReturnType<typeof api.rooms.getLobby>> | undefined
  clientToken: string | null | undefined
  currentMember:
    FunctionReturnType<typeof api.rooms.getCurrentMember> | undefined
  roomCode: string
}) {
  const isLobbyLoading = lobby === undefined
  const router = useRouter()
  const leaveRoom = useMutation(api.rooms.leave)
  const [isLeaving, setIsLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  const handleLeaveRoom = async () => {
    if (!clientToken || !currentMember) {
      return
    }

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
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-busy={isLobbyLoading}
    >
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
            {lobby?.roomCode ?? roomCode}
          </output>
        </div>

        <div className="mt-8 border-t pt-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">
              In this room
            </h2>
            {lobby ? (
              <span className="text-muted-foreground text-sm">
                {lobby.members.length}{' '}
                {lobby.members.length === 1 ? 'player' : 'players'}
              </span>
            ) : (
              <span
                className="bg-muted h-4 w-16 animate-pulse rounded-full"
                aria-hidden="true"
              />
            )}
          </div>
          <ul className="mt-4 grid gap-2" aria-label="Players in this room">
            {lobby ? (
              lobby.members.map((member) => (
                <li
                  key={member.playerId}
                  className="bg-background flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
                >
                  <span className="font-semibold">{member.name}</span>
                  <span className="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
                    {member.playerId === currentMember?.playerId
                      ? member.role === 'host'
                        ? 'You · Host'
                        : 'You'
                      : member.role === 'host'
                        ? 'Host'
                        : 'Player'}
                  </span>
                </li>
              ))
            ) : (
              <LobbyMemberSkeleton />
            )}
          </ul>
        </div>

        <div className="mt-8 grid min-h-10 justify-items-center gap-3">
          {leaveError ? (
            <p className="text-destructive text-sm" role="alert">
              {leaveError}
            </p>
          ) : null}
          {lobby && currentMember ? (
            <Button
              type="button"
              variant="outline"
              disabled={isLeaving}
              onClick={handleLeaveRoom}
            >
              {isLeaving ? 'Leaving…' : 'Leave room'}
            </Button>
          ) : lobby && currentMember === null ? (
            <Button asChild>
              <Link href={`/join?roomCode=${encodeURIComponent(roomCode)}`}>
                Join this room
              </Link>
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function LobbyMemberSkeleton() {
  return (
    <>
      <li
        className="bg-background flex items-center justify-between rounded-xl border px-4 py-3"
        aria-hidden="true"
      >
        <span className="bg-muted h-5 w-28 animate-pulse rounded-full" />
        <span className="bg-muted h-3 w-12 animate-pulse rounded-full" />
      </li>
      <li
        className="bg-background flex items-center justify-between rounded-xl border px-4 py-3"
        aria-hidden="true"
      >
        <span className="bg-muted h-5 w-20 animate-pulse rounded-full" />
        <span className="bg-muted h-3 w-14 animate-pulse rounded-full" />
      </li>
    </>
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
          Room not found.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Check the room code and try again.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/home">Back to home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
