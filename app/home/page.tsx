import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Home — Pic Match',
  description: 'Create a new Pic Match room or join your friends.',
}

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
      <div
        className="bg-accent/15 absolute -top-24 -right-24 size-72 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <div
        className="bg-primary/8 absolute -bottom-28 -left-24 size-80 rounded-full blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex w-full max-w-lg flex-col items-center gap-10">
        <p className="text-lg font-bold tracking-tight">
          pic match<span className="text-accent">.</span>
        </p>

        <section className="bg-card w-full rounded-[2rem] border p-7 shadow-[0_24px_80px_-44px_rgba(40,30,20,0.45)] sm:p-10">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
            Ready to find the match?
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
            Start a fresh room for your group, or enter a room code to join a
            game already in progress.
          </p>
          <div className="mt-8 grid gap-3">
            <Button asChild className="h-12 w-full text-base">
              <Link href="/create">Create a room</Link>
            </Button>
            <Button asChild variant="outline" className="h-12 w-full text-base">
              <Link href="/join">Join a room</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  )
}
