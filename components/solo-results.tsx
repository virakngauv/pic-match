'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  SOLO_LAST_RUN_KEY,
  SOLO_RULES_PATH,
  SOLO_STORAGE_KEY,
  formatSoloShareText,
  parseSoloRunScore,
  parseSoloScore,
} from '@/lib/solo-mode'

type ShareState = 'idle' | 'copied' | 'shared' | 'error'

// How long the button keeps its success confirmation before reverting.
const SHARE_CONFIRMATION_MS = 1_000

export function SoloResults() {
  const router = useRouter()
  // Null until the finished run's score arrives from session storage.
  const [runScore, setRunScore] = useState<number | null>(null)
  // Null until the stored best is read; the pre-run best decides "new best".
  const [storedBest, setStoredBest] = useState<number | null>(null)
  const [shareState, setShareState] = useState<ShareState>('idle')
  // Bumps on every success so a re-share while the confirmation shows
  // restarts the revert timer instead of keeping the old schedule.
  const [shareNonce, setShareNonce] = useState(0)
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    queueMicrotask(() => {
      let score: number | null = null
      try {
        score = parseSoloRunScore(sessionStorage.getItem(SOLO_LAST_RUN_KEY))
      } catch {
        // Storage is optional; a missing run falls through to the redirect.
      }
      if (score === null) {
        // A direct visit without a finished run has nothing to show.
        router.replace(SOLO_RULES_PATH)
        return
      }
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
      setShareUrl(new URL(SOLO_RULES_PATH, window.location.origin).href)
      setRunScore(score)
      setStoredBest(previousBest)
    })
  }, [router])

  // "Link copied" / "Shared ✓" are momentary confirmations, not new labels.
  useEffect(() => {
    if (shareState !== 'copied' && shareState !== 'shared') return
    const timer = window.setTimeout(
      () => setShareState('idle'),
      SHARE_CONFIRMATION_MS,
    )
    return () => window.clearTimeout(timer)
  }, [shareNonce, shareState])

  const score = runScore
  const displayedBest = Math.max(storedBest ?? 0, score ?? 0)
  const isNewBest = storedBest !== null && score !== null && score > storedBest
  const announcement =
    storedBest === null || score === null
      ? ''
      : `Time is up. Final score ${score}. ${
          isNewBest ? 'New personal best!' : `Personal best ${displayedBest}.`
        }`

  async function shareChallenge() {
    if (score === null || !shareUrl) return
    const url = shareUrl
    const text = formatSoloShareText(score, url)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Pic Match Solo',
          text,
          url,
        })
        setShareState('shared')
        setShareNonce((nonce) => nonce + 1)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareState('copied')
      setShareNonce((nonce) => nonce + 1)
    } catch {
      setShareState('error')
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
        {score === null ? (
          <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
            Recording your score…
          </p>
        ) : (
          <>
            <p className="mt-4 text-2xl font-semibold tracking-[-0.03em] [overflow-wrap:anywhere]">
              You scored {score} {score === 1 ? 'pair' : 'pairs'}.
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
              {storedBest === null
                ? 'Recording your score…'
                : `Personal best: ${displayedBest}${isNewBest ? ' — new best!' : ''}`}
            </p>
          </>
        )}
        <div className="mt-8 grid justify-items-center gap-3">
          <Button asChild className="min-w-28">
            <Link href="/solo/play">Play again</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-w-28"
            onClick={shareChallenge}
          >
            {shareState === 'copied'
              ? 'Link copied'
              : shareState === 'shared'
                ? 'Shared ✓'
                : 'Challenge a friend'}
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Go home</Link>
          </Button>
        </div>
        {shareState === 'error' ? (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            Copy failed. Share this link instead: {shareUrl}
          </p>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </section>
    </main>
  )
}
