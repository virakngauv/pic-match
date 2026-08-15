'use client'

import { useEffect, useRef, useState } from 'react'

import { GameCard, type GameCardModel } from '@/components/game-card'
import { GameNavigation } from '@/components/game-navigation'
import { getPairLayoutPlans } from '@/lib/card-layout'
import type { MatchClaimPayload, MatchClaimResult } from '@/lib/match-claim'
import { cn } from '@/lib/utils'

const INCORRECT_FEEDBACK_MS = 1_000

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
  isLeaving,
  leaveError,
  onGoHome,
  onLeaveRoom,
  onSubmitClaim,
}: {
  roomCode: string
  player: GamePlayer
  pairRevision: number
  cards: readonly GameCardModel[]
  scoreboard: readonly ScoreboardEntry[]
  cooldownUntil: number | null
  isLeaving: boolean
  leaveError: string | null
  onGoHome: () => void
  onLeaveRoom: () => void
  onSubmitClaim: (claim: MatchClaimPayload) => Promise<MatchClaimResult>
}) {
  return (
    <main
      className="game-surface"
      aria-label={`Game for ${player.name}`}
      data-player-position={player.position}
    >
      <div className="game-shell">
        <header className="game-header" aria-labelledby="game-heading">
          <div className="game-header-copy flex min-w-0 flex-1 items-baseline justify-between gap-3 lg:block">
            <p className="text-accent shrink-0 text-[0.65rem] font-bold tracking-[0.14em] uppercase sm:text-xs lg:tracking-[0.18em]">
              <span className="sr-only">
                Room {roomCode}, round {pairRevision + 1}
              </span>
              <span className="sm:hidden" aria-hidden="true">
                {roomCode} · R{pairRevision + 1}
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                Room {roomCode} · Round {pairRevision + 1}
              </span>
            </p>
            <h1
              id="game-heading"
              className="truncate text-xl leading-none font-semibold tracking-[-0.04em] sm:text-2xl lg:mt-2 lg:text-4xl"
            >
              Find the match.
            </h1>
          </div>
          <p className="text-muted-foreground game-header-instructions sr-only max-w-xs text-sm leading-6 lg:not-sr-only">
            The same symbol appears once on each card.
          </p>
          <GameNavigation
            isLeaving={isLeaving}
            leaveError={leaveError}
            onGoHome={onGoHome}
            onLeaveRoom={onLeaveRoom}
          />
        </header>
        <GameRound
          key={pairRevision}
          player={player}
          pairRevision={pairRevision}
          cards={cards}
          scoreboard={scoreboard}
          cooldownUntil={cooldownUntil}
          interactionDisabled={isLeaving}
          onSubmitClaim={onSubmitClaim}
        />
      </div>
    </main>
  )
}

type ClaimFeedback =
  'incorrect' | 'stale' | 'accepted' | 'cooldown' | 'error' | null

/** Owns local selection state for one immutable server pair revision. */
function GameRound({
  player,
  pairRevision,
  cards,
  scoreboard,
  cooldownUntil,
  interactionDisabled,
  onSubmitClaim,
}: {
  player: GamePlayer
  pairRevision: number
  cards: readonly GameCardModel[]
  scoreboard: readonly ScoreboardEntry[]
  cooldownUntil: number | null
  interactionDisabled: boolean
  onSubmitClaim: (claim: MatchClaimPayload) => Promise<MatchClaimResult>
}) {
  const [selectedSymbols, setSelectedSymbols] = useState<
    readonly [string | null, string | null]
  >([null, null])
  const [feedback, setFeedback] = useState<ClaimFeedback>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionLockedRef = useRef(false)
  const [submittedCooldownUntil, setSubmittedCooldownUntil] = useState<
    number | null
  >(cooldownUntil)
  const [incorrectFeedbackUntil, setIncorrectFeedbackUntil] = useState<
    number | null
  >(null)
  const effectiveCooldownUntil = Math.max(
    cooldownUntil ?? 0,
    submittedCooldownUntil ?? 0,
  )
  const isServerCooldownActive = useDeadlineActive(effectiveCooldownUntil)
  const isIncorrectFeedbackActive = useDeadlineActive(
    incorrectFeedbackUntil ?? 0,
  )
  const controlsDisabled =
    interactionDisabled ||
    isSubmitting ||
    isServerCooldownActive ||
    isIncorrectFeedbackActive ||
    feedback === 'accepted' ||
    feedback === 'stale'
  const cardLayoutPlans =
    cards.length === 2 ? getPairLayoutPlans(cards, pairRevision) : null
  const orderedScoreboard = [...scoreboard].sort(
    (left, right) => left.position - right.position,
  )

  useEffect(() => {
    if (incorrectFeedbackUntil === null) {
      return
    }

    const timeout = window.setTimeout(
      () => {
        setIncorrectFeedbackUntil(null)
        setSelectedSymbols([null, null])
        setFeedback(null)
      },
      Math.max(0, incorrectFeedbackUntil - Date.now()),
    )

    return () => window.clearTimeout(timeout)
  }, [incorrectFeedbackUntil])

  /** Submits a newly completed selection once and presents its outcome. */
  const submitClaim = async (firstSymbolId: string, secondSymbolId: string) => {
    if (controlsDisabled || submissionLockedRef.current) {
      return
    }

    submissionLockedRef.current = true
    setIsSubmitting(true)
    setFeedback(null)

    try {
      const result = await onSubmitClaim({
        pairRevision,
        firstSymbolId,
        secondSymbolId,
      })

      if ('cooldownUntil' in result) {
        setSubmittedCooldownUntil(result.cooldownUntil)
      }

      if (result.status === 'incorrect') {
        setIncorrectFeedbackUntil(deadlineFromNow(INCORRECT_FEEDBACK_MS))
        setFeedback('incorrect')
      } else if (result.status === 'stale') {
        setFeedback('stale')
        setSelectedSymbols([null, null])
      } else {
        setFeedback(result.status)
      }
    } catch (error) {
      console.error('Match claim submission failed.', error)
      setFeedback('error')
    } finally {
      submissionLockedRef.current = false
      setIsSubmitting(false)
    }
  }

  /** Toggles or replaces the local selection for one editable card. */
  const selectSymbol = (cardIndex: number, symbolId: string) => {
    if (controlsDisabled || submissionLockedRef.current) {
      return
    }

    const nextSymbolId =
      selectedSymbols[cardIndex] === symbolId ? null : symbolId
    const nextSelection =
      cardIndex === 0
        ? ([nextSymbolId, selectedSymbols[1]] as const)
        : ([selectedSymbols[0], nextSymbolId] as const)

    setSelectedSymbols(nextSelection)
    if (feedback !== 'error') {
      setFeedback(null)
    }

    const [firstSymbolId, secondSymbolId] = nextSelection
    if (firstSymbolId && secondSymbolId) {
      void submitClaim(firstSymbolId, secondSymbolId)
    }
  }

  return (
    <>
      <aside
        className="game-scoreboard bg-card border shadow-sm"
        aria-labelledby="scoreboard-heading"
      >
        <div className="game-scoreboard-heading">
          <h2
            id="scoreboard-heading"
            className="sr-only text-xl font-semibold lg:not-sr-only"
          >
            Scoreboard
          </h2>
          <span className="text-muted-foreground shrink-0 text-[0.65rem] font-bold tracking-[0.1em] uppercase lg:text-xs lg:tracking-[0.12em]">
            <span className="game-short-round" aria-hidden="true">
              R{pairRevision + 1} ·{' '}
            </span>
            First to 12
          </span>
        </div>
        <ol className="game-score-list">
          {orderedScoreboard.map((entry) => {
            const isLocalPlayer = entry.playerId === player.playerId

            return (
              <li
                key={entry.playerId}
                className={cn(
                  'game-score-entry border',
                  isLocalPlayer
                    ? 'border-accent bg-accent/10'
                    : 'bg-background',
                )}
                aria-current={isLocalPlayer ? 'true' : undefined}
                data-player-position={entry.position}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold lg:text-base">
                    {entry.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-[0.65rem] lg:text-xs">
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
                  className="bg-foreground text-background inline-flex size-8 shrink-0 items-center justify-center rounded-full px-2 font-mono text-sm font-bold lg:h-10 lg:min-w-10 lg:px-3 lg:text-lg"
                  aria-label={`${entry.name}'s score`}
                >
                  {entry.score}
                </output>
              </li>
            )
          })}
        </ol>
      </aside>

      {cards.length === 2 ? (
        <section className="game-board" aria-label="Shared game board">
          {cards.map((card, index) => {
            const layoutPlan = cardLayoutPlans?.[index as 0 | 1]

            if (!layoutPlan) {
              throw new Error('Missing a layout plan for a game card.')
            }

            return (
              <div className="game-card-slot" key={card.id}>
                <GameCard
                  card={card}
                  cardNumber={index + 1}
                  layoutPlan={layoutPlan}
                  selectedSymbolId={selectedSymbols[index] ?? null}
                  showIncorrectFeedback={isIncorrectFeedbackActive}
                  disabled={controlsDisabled}
                  onSelectSymbol={(symbolId) => selectSymbol(index, symbolId)}
                />
              </div>
            )
          })}
        </section>
      ) : (
        <div
          className="game-board game-board-unavailable bg-card rounded-[2rem] border p-8 text-center shadow-sm"
          role="status"
          aria-label="Shared game board unavailable"
        >
          <div>
            <p className="font-semibold">
              The cards are temporarily unavailable.
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              Keep this page open while the shared board reconnects.
            </p>
          </div>
        </div>
      )}

      {cards.length === 2 ? (
        <div className="game-feedback">
          <p
            id="match-claim-feedback"
            className={cn(
              'text-muted-foreground text-center text-sm leading-tight',
              feedback && 'font-semibold',
            )}
            role={feedback === 'error' ? 'alert' : 'status'}
            aria-label="Match claim feedback"
          >
            {isSubmitting
              ? 'Submitting match…'
              : isIncorrectFeedbackActive
                ? 'Incorrect match. Try again in a moment.'
                : isServerCooldownActive
                  ? 'Please wait a moment before selecting again.'
                  : feedback &&
                      feedback !== 'incorrect' &&
                      feedback !== 'cooldown'
                    ? getClaimFeedbackMessage(feedback)
                    : 'Select the match on both cards.'}
          </p>
        </div>
      ) : null}
    </>
  )
}

/** Maps claim outcomes to distinct, user-facing status messages. */
function getClaimFeedbackMessage(feedback: Exclude<ClaimFeedback, null>) {
  switch (feedback) {
    case 'incorrect':
      return 'Incorrect match. Try again in a moment.'
    case 'cooldown':
      return 'Please wait a moment before selecting again.'
    case 'stale':
      return 'That round already moved on. Select from the current cards.'
    case 'accepted':
      return 'Match accepted.'
    case 'error':
      return 'Unable to submit your match. Change or reselect either symbol to retry.'
  }
}

/** Creates a wall-clock deadline for interaction feedback started by an event. */
function deadlineFromNow(durationMs: number) {
  return Date.now() + durationMs
}

/** Renders once when a timestamp-based lock changes from active to expired. */
function useDeadlineActive(deadline: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const currentTime = Date.now()
    const remainingMs = deadline - currentTime

    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      remainingMs > 0 ? remainingMs + 10 : 0,
    )

    return () => window.clearTimeout(timeout)
  }, [deadline])

  return deadline > now
}
