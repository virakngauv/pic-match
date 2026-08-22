'use client'

import { useEffect, useRef, useState } from 'react'

import {
  GameCard,
  type GameCardModel,
  type RevealedMatch,
} from '@/components/game-card'
import {
  GameScoreboard,
  type GameScoreboardEntry,
} from '@/components/game-scoreboard'
import { getPairLayoutPlans } from '@/lib/card-layout'
import type { MatchClaimPayload, MatchClaimResult } from '@/lib/match-claim'
import { getSpotItSymbolPresentation } from '@/lib/spot-it-symbols'

const INCORRECT_FEEDBACK_MS = 1_000
const SCORE_REVEAL_MS = 1_500

export type ScoredClaim = {
  scorerId: string
  scorerName: string
  symbolId: string
  pairRevision: number
}

type ScoreboardEntry = GameScoreboardEntry
type GamePlayer = Omit<ScoreboardEntry, 'score'>

/** Presents the shared card pair and ordered scoreboard for an active player. */
export function GameScreen({
  roomCode,
  player,
  pairRevision,
  cards,
  scoreboard,
  lastAcceptedClaim,
  cooldownUntil,
  onSubmitClaim,
}: {
  roomCode: string
  player: GamePlayer
  pairRevision: number
  cards: readonly GameCardModel[]
  scoreboard: readonly ScoreboardEntry[]
  lastAcceptedClaim: ScoredClaim | null
  cooldownUntil: number | null
  onSubmitClaim: (claim: MatchClaimPayload) => Promise<MatchClaimResult>
}) {
  const displayedRound = useDisplayedRound({
    pairRevision,
    cards,
    lastAcceptedClaim: lastAcceptedClaim ?? null,
  })
  const revealedMatch: RevealedMatch | null = displayedRound.reveal
    ? {
        symbolId: displayedRound.reveal.symbolId,
        scorerName: displayedRound.reveal.scorerName,
      }
    : null

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
                Room {roomCode}, round {displayedRound.pairRevision + 1}
              </span>
              <span className="sm:hidden" aria-hidden="true">
                {roomCode} · R{displayedRound.pairRevision + 1}
              </span>
              <span className="hidden sm:inline" aria-hidden="true">
                Room {roomCode} · Round {displayedRound.pairRevision + 1}
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
        </header>
        <p
          role="status"
          aria-live="polite"
          aria-label="Score reveal"
          className="sr-only"
        >
          {displayedRound.reveal
            ? getScoreRevealMessage(displayedRound.reveal, player.playerId)
            : ''}
        </p>
        <GameScoreboard
          localPlayerId={player.playerId}
          scoreboard={scoreboard}
          revealScorerId={displayedRound.reveal?.scorerId ?? null}
        />
        <GameRound
          key={displayedRound.pairRevision}
          pairRevision={displayedRound.pairRevision}
          cards={displayedRound.cards}
          revealedMatch={revealedMatch}
          cooldownUntil={cooldownUntil}
          interactionDisabled={revealedMatch !== null}
          onSubmitClaim={onSubmitClaim}
        />
      </div>
    </main>
  )
}

type DisplayedRound = {
  pairRevision: number
  cards: readonly GameCardModel[]
  reveal: ScoredClaim | null
}

/**
 * Holds the previously displayed pair while a server-confirmed score reveal
 * plays, then advances to the latest server revision.
 */
function useDisplayedRound({
  pairRevision,
  cards,
  lastAcceptedClaim,
}: {
  pairRevision: number
  cards: readonly GameCardModel[]
  lastAcceptedClaim: ScoredClaim | null
}): DisplayedRound {
  const [displayedRound, setDisplayedRound] = useState<DisplayedRound>(() => ({
    pairRevision,
    cards,
    reveal: null,
  }))
  const [previousPairRevision, setPreviousPairRevision] = useState(pairRevision)
  const latestRoundRef = useRef({ pairRevision, cards })

  useEffect(() => {
    latestRoundRef.current = { pairRevision, cards }
  })

  if (previousPairRevision !== pairRevision) {
    setPreviousPairRevision(pairRevision)
    setDisplayedRound((current) => {
      if (current.pairRevision === pairRevision) {
        return current.cards === cards ? current : { ...current, cards }
      }

      const shouldHoldForReveal =
        current.reveal === null &&
        lastAcceptedClaim !== null &&
        lastAcceptedClaim.pairRevision === current.pairRevision &&
        pairRevision === current.pairRevision + 1

      return shouldHoldForReveal && lastAcceptedClaim !== null
        ? { ...current, reveal: lastAcceptedClaim }
        : { pairRevision, cards, reveal: null }
    })
  }

  useEffect(() => {
    if (displayedRound.reveal === null) {
      return
    }

    const timeout = window.setTimeout(() => {
      setDisplayedRound((current) => {
        if (current.reveal === null) {
          return current
        }

        return { ...latestRoundRef.current, reveal: null }
      })
    }, SCORE_REVEAL_MS)

    return () => window.clearTimeout(timeout)
  }, [displayedRound.reveal])

  return displayedRound
}

/** Builds the polite screen-reader announcement for an accepted claim. */
function getScoreRevealMessage(claim: ScoredClaim, localPlayerId: string) {
  const symbolLabel = getSpotItSymbolPresentation(claim.symbolId).label

  return claim.scorerId === localPlayerId
    ? `You matched ${symbolLabel} for a point.`
    : `${claim.scorerName} matched ${symbolLabel} for a point.`
}

type ClaimFeedback =
  'incorrect' | 'stale' | 'accepted' | 'cooldown' | 'error' | null

/** Owns local selection state for one immutable server pair revision. */
function GameRound({
  pairRevision,
  cards,
  revealedMatch,
  cooldownUntil,
  interactionDisabled,
  onSubmitClaim,
}: {
  pairRevision: number
  cards: readonly GameCardModel[]
  revealedMatch: RevealedMatch | null
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
  const feedbackMessage = isSubmitting
    ? 'Submitting match…'
    : isIncorrectFeedbackActive
      ? 'Incorrect match. Try again in a moment.'
      : isServerCooldownActive
        ? 'Please wait a moment before selecting again.'
        : feedback && feedback !== 'incorrect' && feedback !== 'cooldown'
          ? getClaimFeedbackMessage(feedback)
          : ''

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
                  revealedMatch={revealedMatch}
                  showIncorrectFeedback={isIncorrectFeedbackActive}
                  disabled={controlsDisabled}
                  onSelectSymbol={(symbolId) => selectSymbol(index, symbolId)}
                />
              </div>
            )
          })}
          <p
            id="match-claim-feedback"
            className={
              feedback === 'error' ? 'game-feedback-overlay' : 'sr-only'
            }
            role={feedback === 'error' ? 'alert' : 'status'}
            aria-label="Match claim feedback"
          >
            {feedbackMessage}
          </p>
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
