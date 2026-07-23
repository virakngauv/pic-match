import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Home — Spot It',
  description: 'Create a new Spot It room or join your friends.',
}

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden px-5 py-6 sm:px-8">
      <div
        className="bg-accent/15 absolute -top-24 -right-24 size-72 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <div
        className="bg-primary/8 absolute -bottom-28 -left-24 size-80 rounded-full blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <Link
            href="/home"
            className="text-lg font-bold tracking-tight"
            aria-label="Spot It home"
          >
            spot it<span className="text-accent">.</span>
          </Link>
          <span className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">
            Play together
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_0.8fr]">
          <div className="max-w-2xl">
            <p className="text-accent mb-5 text-xs font-bold tracking-[0.18em] uppercase">
              Quick rooms. Fast matches.
            </p>
            <h1 className="text-5xl leading-[0.96] font-semibold tracking-[-0.05em] text-balance sm:text-7xl">
              Ready to spot the match?
            </h1>
            <p className="text-muted-foreground mt-6 max-w-lg text-base leading-7 sm:text-lg">
              Start a fresh room for your group or enter a room code to join a
              game already in progress.
            </p>
          </div>

          <div className="bg-card rounded-[2rem] border p-5 shadow-[0_24px_80px_-44px_rgba(40,30,20,0.45)] sm:p-7">
            <div className="mb-6 flex items-center gap-3" aria-hidden="true">
              <span className="bg-accent size-10 rounded-full" />
              <span className="bg-primary size-7 rounded-full" />
              <span className="border-accent size-5 rounded-full border-4" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Choose how to play
            </h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              You can invite friends after creating a room, or join with a code
              someone shared with you.
            </p>
            <div className="mt-7 grid gap-3">
              <Button asChild className="h-12 w-full text-base">
                <Link href="/create">Create a room</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 w-full text-base"
              >
                <Link href="/join">Join a room</Link>
              </Button>
            </div>
          </div>
        </section>

        <footer className="text-muted-foreground flex items-center justify-between gap-4 border-t py-5 text-xs">
          <span>Spot It room prototype</span>
          <Link
            href="/wiring-lab"
            className="font-semibold underline-offset-4 hover:underline"
          >
            Open wiring lab
          </Link>
        </footer>
      </div>
    </main>
  )
}
