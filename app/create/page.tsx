import type { Metadata } from 'next'
import Link from 'next/link'

import { CreateRoomForm } from '@/components/create-room-form'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Create a Room — Pic Match',
}

export default function CreateRoomPage() {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-lg rounded-[2rem] border p-7 shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Create room
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Start a new room.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Tell us what to call you. We’ll make a room and send you straight to
          its lobby.
        </p>
        <CreateRoomForm />
        <Button asChild variant="outline" className="mt-3 w-full">
          <Link href="/home">Back to home</Link>
        </Button>
      </section>
    </main>
  )
}
