'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  JoinRoomForm,
  type JoinedRoom,
} from '@/components/join-room-form'
import { Button } from '@/components/ui/button'

export function JoinRoomScreen({
  roomCode,
  onJoined,
}: {
  roomCode?: string
  onJoined?: (room: JoinedRoom) => void
}) {
  const router = useRouter()
  const handleJoined =
    onJoined ?? ((room: JoinedRoom) => router.push(`/${room.roomCode}`))

  const roomCodeLocked = roomCode !== undefined

  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-lg rounded-[2rem] border p-7 shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Join room
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Join your friends.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          {roomCodeLocked
            ? 'Tell us what to call you to join this room.'
            : 'Enter the room code you were given and tell us what to call you.'}
        </p>
        <JoinRoomForm roomCode={roomCode} onJoined={handleJoined} />
        <Button asChild variant="outline" className="mt-3 w-full">
          <Link href="/home">Back to home</Link>
        </Button>
      </section>
    </main>
  )
}
