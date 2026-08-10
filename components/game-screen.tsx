'use client'

import { useEffect, useState } from 'react'

import { GameCard, type GameCardModel } from '@/components/game-card'
import { Button } from '@/components/ui/button'
import type { MatchClaimPayload, MatchClaimResult } from '@/lib/match-claim'
import { cn } from '@/lib/utils'

type GamePlayer = {
  playerId: string
  name: string
  role: 'host' | 'player'
  position: number
}

type ScoreboardEntry = GamePlayer & {
  score: number
}

/** Presents the shared card pair and ordered scoreboard for an active player. */
export function GameScreen({
  roomCode,
  player,
  pairRevision,
  cards,
  scoreboard,
  cooldownUntil,
  onSubmitClaim,
}: {
  roomCode: string
  player: GamePlayer
  pairRevision: number
  cards: readonly GameCardModel[]
  scoreboard: readonly ScoreboardEntry[]
  cooldownUntil: number | null
  onSubmitClaim: (claim: MatchClaimPayload) => Promise<MatchClaimResult>
}) {
  return (
    <GameRound
      key={pairRevision}
      roomCode={roomCode}
      player={player}
      pairRevision={pairRevision}
      cards={cards}
      scoreboard={scoreboard}
      cooldownUntil={cooldownUntil}
      onSubmitClaim={onSubmitClaim}
    />
  )
}

type ClaimFeedback =
  | 'incomplete'
  | 'incorrect'
  | 'stale'
  | 'accepted'
  | 'cooldown'
  | 'error'
  | null

/** Owns local selection state for one immutable server pair revision. */
function GameRound({
  roomCode,
  player,
  pairRevision,
  cards,
  scoreboard,
  cooldownUntil,
  onSubmitClaim,
}: {
  roomCode: string
  player: GamePlayer
  pairRevision: number
  cards: readonly GameCardModel[]
  scoreboard: readonly ScoreboardEntry[]
  cooldownUntil: number | null
  onSubmitClaim: (claim: MatchClaimPayload) => Promise<MatchClaimResult>
}) {
  const [selectedSymbols, setSelectedSymbols] = useState<
    readonly [string | null, string | null]
  >([null, null])
  const [feedback, setFeedback] = useState<ClaimFeedback>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedCooldownUntil, setSubmittedCooldownUntil] = useState<
    number | null
  >(cooldownUntil)
  const effectiveCooldownUntil = Math.max(
    cooldownUntil ?? 0,
    submittedCooldownUntil ?? 0,
  )
  const cooldownNow = useCooldownClock(effectiveCooldownUntil)
  const cooldownRemainingMs = Math.max(0, effectiveCooldownUntil - cooldownNow)
  const isCooldownActive = cooldownRemainingMs > 0
  const cooldownHasEnded = effectiveCooldownUntil > 0 && !isCooldownActive
  const controlsDisabled = isSubmitting || isCooldownActive
  const orderedScoreboard = [...scoreboard].sort(
    (left, right) => left.position - right.position,
  )

  /** Replaces the local selection for one card in the current round. */
  const selectSymbol = (cardIndex: number, symbolId: string) => {
    if (controlsDisabled) {
      return
    }

    setSelectedSymbols((current) =>
      cardIndex === 0 ? [symbolId, current[1]] : [current[0], symbolId],
    )
    setFeedback(null)
  }

  /** Submits a complete selection once and presents its outcome. */
  const submitClaim = async () => {
    const [firstSymbolId, secondSymbolId] = selectedSymbols

    if (!firstSymbolId || !secondSymbolId) {
      setFeedback('incomplete')
      return
    }

    if (controlsDisabled) {
      return
    }

    setIsSubmitting(true)
    setFeedback(null)

    try {
      const result = await onSubmitClaim({
        pairRevision,
        firstSymbolId,
        secondSymbolId,
      })

      setFeedback(result.status)

      if ('cooldownUntil' in result) {
        setSubmittedCooldownUntil(result.cooldownUntil)
      }

      if (result.status === 'stale') {
        setSelectedSymbols([null, null])
      }
    } catch (error) {
      console.error('Match claim submission failed.', error)
      setFeedback('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main
      className="min-h-screen px-4 py-6 sm:px-8 sm:py-8"
      aria-label={`Game for ${player.name}`}
      data-player-position={player.position}
    >
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0" aria-labelledby="game-heading">
          <header className="flex flex-wrap items-end justify-between gap-4 px-1">
            <div>
              <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
                Room {roomCode} · Round {pairRevision + 1}
              </p>
              <h1
                id="game-heading"
                className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl"
              >
                Find the match.
              </h1>
            </div>
            <p className="text-muted-foreground max-w-xs text-sm leading-6">
              The same symbol appears once on each card.
            </p>
          </header>

          {cards.length === 2 ? (
            <div
              className="mt-6 grid gap-5 sm:grid-cols-2 sm:gap-7"
              aria-label="Shared game board"
            >
              {cards.map((card, index) => (
                <GameCard
                  key={card.id}
                  card={card}
                  cardNumber={index + 1}
                  selectedSymbolId={selectedSymbols[index] ?? null}
                  disabled={controlsDisabled}
                  onSelectSymbol={(symbolId) => selectSymbol(index, symbolId)}
                />
              ))}
            </div>
          ) : (
            <div
              className="bg-card mt-6 rounded-[2rem] border p-8 text-center shadow-sm"
              role="status"
              aria-label="Shared game board unavailable"
            >
              <p className="font-semibold">
                The cards are temporarily unavailable.
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                Keep this page open while the shared board reconnects.
              </p>
            </div>
          )}

          {cards.length === 2 ? (
            <div className="mt-6 flex min-h-24 flex-col items-center gap-3">
              <Button
                type="button"
                onClick={submitClaim}
                disabled={controlsDisabled}
                aria-describedby="match-claim-feedback"
              >
                {isSubmitting
                  ? 'Submitting…'
                  : isCooldownActive
                    ? 'Selection locked'
                    : 'Submit match'}
              </Button>
              <p
                id="match-claim-feedback"
                className={cn(
                  'text-muted-foreground text-center text-sm',
                  feedback && 'font-semibold',
                )}
                role={feedback === 'error' ? 'alert' : 'status'}
                aria-label="Match claim feedback"
              >
                {isCooldownActive
                  ? getCooldownMessage(cooldownRemainingMs)
                  : cooldownHasEnded
                    ? 'You can select symbols again.'
                    : feedback
                      ? getClaimFeedbackMessage(feedback)
                      : 'Select one symbol on each card, then submit your match.'}
              </p>
            </div>
          ) : null}
        </section>

        <aside
          className="bg-card h-fit rounded-[2rem] border p-5 shadow-sm lg:sticky lg:top-8"
          aria-labelledby="scoreboard-heading"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="scoreboard-heading" className="text-xl font-semibold">
              Scoreboard
            </h2>
            <span className="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
              First to 12
            </span>
          </div>
          <ol className="mt-4 grid gap-2">
            {orderedScoreboard.map((entry) => {
              const isLocalPlayer = entry.playerId === player.playerId

              return (
                <li
                  key={entry.playerId}
                  className={
                    isLocalPlayer
                      ? 'border-accent bg-accent/10 flex items-center gap-3 rounded-2xl border px-4 py-3'
                      : 'bg-background flex items-center gap-3 rounded-2xl border px-4 py-3'
                  }
                  aria-current={isLocalPlayer ? 'true' : undefined}
                  data-player-position={entry.position}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {entry.name}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {isLocalPlayer
                        ? entry.role === 'host'
                          ? 'You · Host'
                          : 'You'
                        : entry.role === 'host'
                          ? 'Host'
                          : 'Player'}
                    </span>
                  </span>
                  <output
                    className="bg-foreground text-background inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 font-mono text-lg font-bold"
                    aria-label={`${entry.name}'s score`}
                  >
                    {entry.score}
                  </output>
                </li>
              )
            })}
          </ol>
        </aside>
      </div>
    </main>
  )
}

/** Maps claim outcomes to distinct, user-facing status messages. */
function getClaimFeedbackMessage(feedback: Exclude<ClaimFeedback, null>) {
  switch (feedback) {
    case 'incomplete':
      return 'Select one symbol on each card before submitting.'
    case 'incorrect':
    case 'cooldown':
      return 'You can select symbols again.'
    case 'stale':
      return 'That round already moved on. Select from the current cards.'
    case 'accepted':
      return 'Match accepted.'
    case 'error':
      return 'Unable to submit your match. Please try again.'
  }
}

/** Keeps the cooldown presentation moving without relying on another query update. */
function useCooldownClock(cooldownUntil: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const initialTick = window.setTimeout(() => setNow(Date.now()), 0)

    if (cooldownUntil <= Date.now()) {
      return () => window.clearTimeout(initialTick)
    }

    const interval = window.setInterval(() => setNow(Date.now()), 250)
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      cooldownUntil - Date.now() + 10,
    )

    return () => {
      window.clearTimeout(initialTick)
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [cooldownUntil])

  return now
}

/** Presents a bounded whole-second countdown for the local participant. */
function getCooldownMessage(cooldownRemainingMs: number) {
  const seconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1_000))

  return `Incorrect match. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`
}
