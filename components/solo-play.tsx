'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { GameCard } from '@/components/game-card'
import { getPairLayoutPlans } from '@/lib/card-layout'
import {
  answerSolo,
  createSoloSeed,
  getSoloPair,
  getSoloStage,
  startSoloState,
  tickSolo,
  type SoloState,
} from '@/lib/solo-mode'

export function SoloPlay({
  seed: initialSeed,
  target,
}: {
  seed: string | null
  target: number | null
}) {
  const router = useRouter()
  const [state, setState] = useState<SoloState | null>(null)

  useEffect(() => {
    queueMicrotask(() => {
      // The clock starts the moment the play screen mounts.
      setState(
        startSoloState(initialSeed ?? createSoloSeed(), target, Date.now()),
      )
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
    const params = new URLSearchParams({ seed: state.seed })
    params.set('score', String(state.score))
    if (state.target !== null) params.set('target', String(state.target))
    router.replace(`/solo/results?${params.toString()}`)
  }, [router, state?.score, state?.seed, state?.status, state?.target])

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

  if (!state || !pair || !plans) {
    return (
      <main className="game-surface" aria-label="Solo game">
        <div className="game-shell">
          <p className="text-muted-foreground place-self-center text-sm">
            Preparing Solo…
          </p>
        </div>
      </main>
    )
  }

  const stage = getSoloStage(state.pairIndex)
  const stats = [
    { label: 'Score', value: state.score },
    { label: 'Time left', value: `${Math.ceil(state.remainingMs / 1000)}s` },
    { label: 'Symbols', value: stage.symbolsPerCard },
  ]
  if (state.target !== null) {
    stats.push({ label: 'Beat', value: state.target })
  }

  return (
    <main className="game-surface" aria-label="Solo game">
      <div className="game-shell">
        <header
          className="game-header justify-center"
          aria-labelledby="solo-heading"
        >
          <h1
            id="solo-heading"
            className="truncate text-center text-xl leading-none font-bold tracking-[-0.04em] sm:text-2xl lg:text-4xl"
          >
            solo<span className="text-accent">.</span>
          </h1>
        </header>
        <p className="sr-only" role="status" aria-live="polite">
          {state.announcement}
        </p>
        <aside
          className="game-scoreboard bg-card border shadow-sm"
          aria-labelledby="solo-stats-heading"
        >
          <h2 id="solo-stats-heading" className="sr-only">
            Solo stats
          </h2>
          <div
            className="game-score-viewport"
            role="region"
            aria-label="Solo progress"
            tabIndex={0}
          >
            <ol
              className="game-score-list"
              aria-label="Score, time, and difficulty"
            >
              {stats.map((stat) => (
                <li
                  className="game-score-entry bg-background border"
                  key={stat.label}
                >
                  <span className="game-score-name text-xs font-semibold sm:text-base">
                    {stat.label}
                  </span>
                  <output
                    className="game-score-value font-mono text-sm font-bold sm:text-lg"
                    aria-label={`${stat.label} value`}
                    data-testid={`solo-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {stat.value}
                  </output>
                </li>
              ))}
            </ol>
          </div>
        </aside>
        <section className="game-board" aria-label="Solo game board">
          {pair.cards.map((card, index) => (
            <div className="game-card-slot" key={`${state.pairIndex}:${index}`}>
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
        </section>
      </div>
    </main>
  )
}
