'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { GameCard } from '@/components/game-card'
import { Button } from '@/components/ui/button'
import { getPairLayoutPlans } from '@/lib/card-layout'
import {
  SOLO_CHALLENGE,
  SOLO_STORAGE_KEY,
  answerSolo,
  createSoloState,
  getSoloPair,
  getSoloStage,
  parseSoloScore,
  tickSolo,
  type SoloState,
} from '@/lib/solo-mode'

function newSeed(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

export function SoloMode({
  initialSeed,
  target,
}: {
  initialSeed: string | null
  target: number | null
}) {
  const [state, setState] = useState<SoloState | null>(null)
  const [bestScore, setBestScore] = useState(0)
  const [shareStatus, setShareStatus] = useState('')

  useEffect(() => {
    queueMicrotask(() => {
      setState(createSoloState(initialSeed ?? newSeed(), target))
      try {
        setBestScore(
          parseSoloScore(localStorage.getItem(SOLO_STORAGE_KEY)).bestScore,
        )
      } catch {
        // Browsers may deny storage; the run still works in memory.
      }
    })
  }, [initialSeed, target])

  useEffect(() => {
    if (state?.status !== 'playing') return
    const timer = window.setInterval(
      () => setState((current) => current && tickSolo(current, Date.now())),
      100,
    )
    return () => window.clearInterval(timer)
  }, [state?.status])

  useEffect(() => {
    if (state?.status !== 'finished') return
    const nextBest = Math.max(bestScore, state.score)
    try {
      localStorage.setItem(
        SOLO_STORAGE_KEY,
        JSON.stringify({
          version: 1,
          bestScore: nextBest,
          lastScore: state.score,
        }),
      )
    } catch {
      // Storage is optional.
    }
  }, [state?.status, state?.score, bestScore])

  const seed = state?.seed
  const pairIndex = state?.pairIndex
  const pair = useMemo(
    () =>
      seed !== undefined && pairIndex !== undefined
        ? getSoloPair(seed, pairIndex, pairIndex)
        : null,
    [seed, pairIndex],
  )
  const plans = useMemo(
    () => (pair ? getPairLayoutPlans(pair.cards, pair.revision) : null),
    [pair],
  )

  if (!state || !pair || !plans)
    return <main className="p-8 text-center">Preparing Solo…</main>

  const stage = getSoloStage(state.pairIndex)
  const displayedBest = Math.max(
    bestScore,
    state.status === 'finished' ? state.score : 0,
  )
  const isNewBest = state.status === 'finished' && state.score > bestScore
  const liveMessage =
    state.status === 'finished'
      ? `Time is up. Final score ${state.score}. ${isNewBest ? 'New personal best!' : ''}`
      : state.announcement

  function playAgain() {
    setShareStatus('')
    setBestScore((current) => Math.max(current, state!.score))
    setState(createSoloState(initialSeed ?? newSeed(), target))
  }

  async function shareChallenge() {
    const url = new URL('/solo', window.location.origin)
    url.searchParams.set('seed', state!.seed)
    url.searchParams.set('target', String(state!.score))
    const text = `I matched ${state!.score} pairs in Pic Match Solo. Can you beat me? ${url.href}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Pic Match Solo challenge',
          text,
          url: url.href,
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
      setShareStatus(`Copy this challenge link: ${url.href}`)
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link
            className="text-sm font-semibold underline underline-offset-4"
            href="/home"
          >
            ← Home
          </Link>
          <span className="text-accent text-sm font-bold tracking-[0.2em] uppercase">
            Solo
          </span>
        </header>
        <section className="bg-card rounded-3xl border p-5 text-center shadow-sm sm:p-7">
          <h1 className="text-3xl font-bold tracking-tight">
            Match as many pairs as you can before time runs out.
          </h1>
          <p className="text-muted-foreground mt-2">
            Tap the shared symbol on either card. Your first tap starts the
            30-second clock.
          </p>
          {state.target !== null ? (
            <p className="text-accent mt-3 text-xl font-bold">
              Beat {state.target}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-center gap-3 text-center">
            <div className="bg-muted min-w-28 rounded-2xl px-5 py-3">
              <span className="block text-xs font-semibold uppercase">
                Score
              </span>
              <strong className="text-2xl" data-testid="solo-score">
                {state.score}
              </strong>
            </div>
            <div className="bg-muted min-w-28 rounded-2xl px-5 py-3">
              <span className="block text-xs font-semibold uppercase">
                Time left
              </span>
              <strong className="text-2xl" data-testid="solo-time">
                {Math.ceil(state.remainingMs / 1000)}s
              </strong>
            </div>
            <div className="bg-muted min-w-28 rounded-2xl px-5 py-3">
              <span className="block text-xs font-semibold uppercase">
                Symbols
              </span>
              <strong className="text-2xl" data-testid="solo-difficulty">
                {stage.symbolsPerCard}
              </strong>
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {liveMessage}
          </p>
          {state.status === 'ready' ? (
            <p className="mt-4 font-semibold">
              Ready? Choose a symbol on either card.
            </p>
          ) : null}
          {state.status === 'finished' ? (
            <div
              className="mt-5 rounded-2xl border p-5"
              data-testid="solo-result"
            >
              <h2 className="text-2xl font-bold">
                Time&apos;s up! {state.score} pairs matched.
              </h2>
              <p className="mt-1">
                Personal best: {displayedBest}
                {isNewBest ? ' — new best!' : ''}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button onClick={playAgain}>Play again</Button>
                <Button variant="outline" onClick={shareChallenge}>
                  Share challenge
                </Button>
              </div>
              {shareStatus ? (
                <p className="mt-3 text-sm" role="status">
                  {shareStatus}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
        <div className="mt-6 grid justify-items-center gap-4 md:grid-cols-2 md:gap-8">
          {pair.cards.map((card, index) => (
            <div
              className="w-full max-w-80"
              key={`${state.pairIndex}:${index}`}
            >
              <GameCard
                card={card}
                cardNumber={index + 1}
                layoutPlan={plans[index as 0 | 1]}
                selectedSymbolId={state.feedback?.symbolId ?? null}
                revealedMatch={
                  state.feedback?.kind === 'correct'
                    ? {
                        symbolId: state.feedback.symbolId,
                        scorerName: 'Correct!',
                      }
                    : null
                }
                showIncorrectFeedback={state.feedback?.kind === 'incorrect'}
                disabled={
                  state.status === 'finished' || state.feedback !== null
                }
                onSelectSymbol={(symbolId) =>
                  setState(
                    (current) =>
                      current && answerSolo(current, symbolId, Date.now()),
                  )
                }
              />
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-5 text-center text-sm">
          Correct: +{SOLO_CHALLENGE.correctBonusMs / 1000}s · Incorrect: −
          {SOLO_CHALLENGE.incorrectPenaltyMs / 1000}s
        </p>
      </div>
    </main>
  )
}
