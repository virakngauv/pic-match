import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { SOLO_CHALLENGE } from '@/lib/solo-mode'

const initialSeconds = SOLO_CHALLENGE.initialTimeMs / 1000
const bonusSeconds = SOLO_CHALLENGE.correctBonusMs / 1000
const penaltySeconds = SOLO_CHALLENGE.incorrectPenaltyMs / 1000

/** Solo rules screen, styled to match the create and join screens. */
export function SoloStart() {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-lg rounded-[2rem] border p-7 shadow-sm sm:p-10">
        <h1 className="text-center text-4xl leading-[1.05] font-bold tracking-[-0.04em] text-balance sm:text-5xl">
          play solo<span className="text-accent">.</span>
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Tap on the matching symbol as many times as you can before the{' '}
          {initialSeconds}-second timer runs out. Every correct press gets you +
          {bonusSeconds} {bonusSeconds === 1 ? 'second' : 'seconds'}; every
          wrong tap is −{penaltySeconds}{' '}
          {penaltySeconds === 1 ? 'second' : 'seconds'}. Every run deals a fresh
          board.
        </p>
        <Button asChild className="mt-6 h-12 w-full text-base">
          <Link href="/solo/play">Play now</Link>
        </Button>
        <Button asChild variant="outline" className="mt-3 w-full">
          <Link href="/home">Back to home</Link>
        </Button>
      </section>
    </main>
  )
}
