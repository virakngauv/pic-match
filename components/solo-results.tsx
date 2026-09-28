'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  SOLO_STORAGE_KEY,
  formatSoloShareText,
  parseSoloScore,
} from '@/lib/solo-mode'

export function SoloResults({
  seed,
  score,
  target,
}: {
  seed: string | null
  score: number
  target: number | null
}) {
  // Null until the stored best is read; the pre-run best decides "new best".
  const [storedBest, setStoredBest] = useState<number | null>(null)
  const [shareStatus, setShareStatus] = useState('')
  const shareUrlRef = useRef('')

  useEffect(() => {
    queueMicrotask(() => {
      let previousBest = 0
      try {
        previousBest = parseSoloScore(
          localStorage.getItem(SOLO_STORAGE_KEY),
        ).bestScore
        localStorage.setItem(
          SOLO_STORAGE_KEY,
          JSON.stringify({
            version: 1,
            bestScore: Math.max(previousBest, score),
            lastScore: score,
          }),
        )
      } catch {
        // Storage is optional.
      }
      const url = new URL('/solo', window.location.origin)
      if (seed) {
        url.searchParams.set('seed', seed)
        url.searchParams.set('target', String(score))
      }
      shareUrlRef.current = url.href
      setStoredBest(previousBest)
    })
  }, [score, seed])

  const displayedBest = Math.max(storedBest ?? 0, score)
  const isNewBest = storedBest !== null && score > storedBest
  const playAgainHref =
    seed !== null && target !== null
      ? `/solo?seed=${encodeURIComponent(seed)}&target=${target}`
      : '/solo'
  const announcement =
    storedBest === null
      ? ''
      : `Time is up. Final score ${score}. ${
          isNewBest ? 'New personal best!' : `Personal best ${displayedBest}.`
        }`

  async function shareChallenge() {
    const url = shareUrlRef.current
    const text = formatSoloShareText(score, url)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Pic Match Solo challenge',
          text,
          url,
        })
        setShareStatus('Challenge shared.')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareStatus('Challenge copied to clipboard.')
    } catch {
      setShareStatus(`Copy this challenge link: ${url}`)
    }
  }

  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-label="Solo results"
    >
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Solo
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Time&apos;s up.
        </h1>
        <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] [overflow-wrap:anywhere]">
          You scored {score} {score === 1 ? 'pair' : 'pairs'}.
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
          {storedBest === null
            ? 'Recording your score…'
            : `Personal best: ${displayedBest}${isNewBest ? ' — new best!' : ''}`}
        </p>
        {target !== null ? (
          <p className="text-accent mt-4 text-lg font-bold">
            {score >= target
              ? `Challenge beaten — you passed ${target}!`
              : `Challenge target: ${target}`}
          </p>
        ) : null}
        <div className="mt-8 grid justify-items-center gap-3">
          <Button asChild className="min-w-28">
            <Link href={playAgainHref}>Play again</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-w-28"
            onClick={shareChallenge}
          >
            Share challenge
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Go home</Link>
          </Button>
        </div>
        {shareStatus ? (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {shareStatus}
          </p>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </section>
    </main>
  )
}
