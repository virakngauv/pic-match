'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'

const REORDER_DURATION_MS = 260
const MOVE_TOLERANCE_PX = 0.5

export type GameScoreboardEntry = {
  playerId: string
  name: string
  role: 'host' | 'player'
  position: number
  score: number
}

type EntryPosition = {
  left: number
  top: number
}

/** Orders the active leaderboard by score with a stable seat tie-break. */
export function orderGameScoreboard(
  scoreboard: readonly GameScoreboardEntry[],
) {
  return [...scoreboard].sort(
    (left, right) => right.score - left.score || left.position - right.position,
  )
}

/** Presents the top, horizontally scrollable active-game leaderboard. */
export function GameScoreboard({
  localPlayerId,
  scoreboard,
  revealScorerId,
}: {
  localPlayerId: string
  scoreboard: readonly GameScoreboardEntry[]
  revealScorerId: string | null
}) {
  const orderedScoreboard = useMemo(
    () => orderGameScoreboard(scoreboard),
    [scoreboard],
  )
  const viewportRef = useRef<HTMLDivElement>(null)
  const entryRefs = useRef(new Map<string, HTMLLIElement>())
  const previousPositionsRef = useRef(new Map<string, EntryPosition>())
  const animationsRef = useRef(new Map<string, Animation>())
  const scrollLeftRef = useRef(0)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const preservedScrollLeft =
      viewport.scrollLeft > 0 ? viewport.scrollLeft : scrollLeftRef.current
    if (viewport.scrollLeft !== preservedScrollLeft) {
      viewport.scrollLeft = preservedScrollLeft
    }
    scrollLeftRef.current = viewport.scrollLeft
    const viewportBounds = viewport.getBoundingClientRect()
    const nextPositions = new Map<string, EntryPosition>()

    for (const entry of orderedScoreboard) {
      const element = entryRefs.current.get(entry.playerId)
      if (!element) continue
      const bounds = element.getBoundingClientRect()
      nextPositions.set(entry.playerId, {
        left: bounds.left - viewportBounds.left + viewport.scrollLeft,
        top: bounds.top - viewportBounds.top + viewport.scrollTop,
      })
    }

    const previousPositions = previousPositionsRef.current
    const reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    for (const entry of orderedScoreboard) {
      const element = entryRefs.current.get(entry.playerId)
      const previous = previousPositions.get(entry.playerId)
      const next = nextPositions.get(entry.playerId)
      if (!element || !previous || !next) continue

      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (
        reduceMotion ||
        typeof element.animate !== 'function' ||
        (Math.abs(deltaX) <= MOVE_TOLERANCE_PX &&
          Math.abs(deltaY) <= MOVE_TOLERANCE_PX)
      ) {
        continue
      }

      animationsRef.current.get(entry.playerId)?.cancel()
      element.dataset.reordering = 'true'
      const animation = element.animate(
        [{ translate: `${deltaX}px ${deltaY}px` }, { translate: '0 0' }],
        {
          duration: REORDER_DURATION_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'both',
        },
      )
      const clearAnimation = () => {
        if (animationsRef.current.get(entry.playerId) === animation) {
          animationsRef.current.delete(entry.playerId)
          delete element.dataset.reordering
        }
      }
      animation.onfinish = clearAnimation
      animation.oncancel = clearAnimation
      animationsRef.current.set(entry.playerId, animation)
    }

    previousPositionsRef.current = nextPositions
  }, [orderedScoreboard])

  useEffect(
    () => () => {
      for (const animation of animationsRef.current.values()) {
        animation.cancel()
      }
      animationsRef.current.clear()
    },
    [],
  )

  return (
    <aside
      className="game-scoreboard bg-card border shadow-sm"
      aria-labelledby="scoreboard-heading"
    >
      <h2 id="scoreboard-heading" className="sr-only">
        Scoreboard
      </h2>
      <p id="scoreboard-scroll-help" className="sr-only">
        Scores are ordered highest first. Scroll horizontally for more players.
      </p>
      <div
        ref={viewportRef}
        className="game-score-viewport"
        role="region"
        aria-label="Scrollable leaderboard"
        aria-describedby="scoreboard-scroll-help"
        tabIndex={0}
        onScroll={(event) => {
          scrollLeftRef.current = event.currentTarget.scrollLeft
        }}
      >
        <ol
          className="game-score-list"
          aria-label="Live leaderboard, highest score first"
        >
          {orderedScoreboard.map((entry, index) => {
            const isLocalPlayer = entry.playerId === localPlayerId
            const isRevealScorer = entry.playerId === revealScorerId

            return (
              <li
                ref={(element) => {
                  if (element) entryRefs.current.set(entry.playerId, element)
                  else {
                    entryRefs.current.delete(entry.playerId)
                    const animation = animationsRef.current.get(entry.playerId)
                    animation?.cancel()
                    if (
                      animationsRef.current.get(entry.playerId) === animation
                    ) {
                      animationsRef.current.delete(entry.playerId)
                    }
                  }
                }}
                key={entry.playerId}
                className={cn(
                  'game-score-entry border',
                  isLocalPlayer
                    ? 'border-accent bg-accent/10'
                    : 'bg-background',
                )}
                aria-current={isLocalPlayer ? 'true' : undefined}
                data-player-id={entry.playerId}
                data-player-position={entry.position}
                data-score-rank={index + 1}
                data-scored={isRevealScorer ? 'true' : undefined}
              >
                <span className="sr-only">Rank {index + 1}. </span>
                <span className="game-score-player min-w-0">
                  <span
                    className="game-score-name text-xs font-semibold sm:text-base"
                    data-scoreboard-name=""
                    title={entry.name}
                  >
                    {entry.name}
                  </span>
                </span>
                <output
                  className="game-score-value font-mono text-sm font-bold sm:text-lg"
                  aria-label={`${entry.name}'s score`}
                  aria-live="off"
                >
                  {entry.score}
                </output>
              </li>
            )
          })}
        </ol>
      </div>
    </aside>
  )
}
