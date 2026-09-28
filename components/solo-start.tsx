'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { SOLO_STORAGE_KEY, parseSoloScore } from '@/lib/solo-mode'

export function SoloStart() {
  const [bestScore, setBestScore] = useState<number | null>(null)

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setBestScore(
          parseSoloScore(localStorage.getItem(SOLO_STORAGE_KEY)).bestScore,
        )
      } catch {
        // Browsers may deny storage; the run still works without a best.
        setBestScore(0)
      }
    })
  }, [])

  const announcement =
    bestScore === null
      ? ''
      : `Solo mode ready. ${bestScore > 0 ? `Personal best ${bestScore}.` : ''}`

  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-label="Solo mode"
    >
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Solo
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Ready?
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Match as many pairs as you can before time runs out. Tap the shared
          symbol on either card — your 30-second clock starts the moment you
          press play. Every run deals a fresh board.
        </p>
        {bestScore !== null && bestScore > 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            Personal best: {bestScore}
          </p>
        ) : null}
        <div className="mt-8 grid justify-items-center gap-3">
          <Button asChild className="min-w-28">
            <Link href="/solo/play">Play now</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Back to home</Link>
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </section>
    </main>
  )
}
