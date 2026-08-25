import type { CSSProperties } from 'react'

import {
  SELECTED_SYMBOL_SCALE,
  getSelectedSymbolRotationOffset,
} from '@/lib/card-selection'
import { getPicMatchSymbolPresentation } from '@/lib/pic-match-symbols'
import type { CardLayoutPlan } from '@/lib/card-layout'
import { cn } from '@/lib/utils'

export type GameCardModel = {
  id: string
  symbolIds: readonly string[]
}

export type RevealedMatch = {
  symbolId: string
  scorerName: string
}

const SYMBOL_COLORS = [
  'oklch(0.51 0.19 28)',
  'oklch(0.48 0.16 145)',
  'oklch(0.48 0.17 260)',
  'oklch(0.55 0.18 320)',
] as const

const SCORE_REVEAL_MUTED_FILTER = 'saturate(0)'

/** Renders one server-derived card as a circular set of symbol controls. */
export function GameCard({
  card,
  cardNumber,
  layoutPlan,
  selectedSymbolId,
  revealedMatch,
  showIncorrectFeedback,
  disabled,
  onSelectSymbol,
}: {
  card: GameCardModel
  cardNumber: number
  layoutPlan: CardLayoutPlan
  selectedSymbolId: string | null
  revealedMatch: RevealedMatch | null
  showIncorrectFeedback: boolean
  disabled: boolean
  onSelectSymbol: (symbolId: string) => void
}) {
  const symbolLayouts = new Map(
    layoutPlan.symbols.map((layout) => [layout.symbolId, layout]),
  )
  return (
    <article
      className="bg-card [container-type:inline-size] relative aspect-square w-full min-w-72 overflow-hidden rounded-full border-4 border-white shadow-[0_18px_55px_rgba(73,52,31,0.16),inset_0_0_0_1px_var(--border)]"
      aria-label={`Card ${cardNumber}`}
      data-card-id={card.id}
      data-layout-template={layoutPlan.templateId}
      data-template-rotation={layoutPlan.templateRotation}
      data-rotation-profile={layoutPlan.rotationProfileId}
    >
      <p className="sr-only">
        Card {cardNumber} contains {card.symbolIds.length} symbols.
      </p>
      {card.symbolIds.map((symbolId) => {
        const symbol = getPicMatchSymbolPresentation(symbolId)
        const layout = symbolLayouts.get(symbolId)
        const isSelected = selectedSymbolId === symbolId
        const isIncorrect = isSelected && showIncorrectFeedback
        const isRevealed = revealedMatch?.symbolId === symbolId
        const isRevealMuted = revealedMatch !== null && !isRevealed

        if (!layout) {
          throw new Error(`Missing layout for symbol ${symbolId}.`)
        }

        const color =
          SYMBOL_COLORS[
            hashText(`${card.id}:${symbolId}:color`) % SYMBOL_COLORS.length
          ]
        const selectionRotation = getSelectedSymbolRotationOffset(
          card.id,
          symbolId,
        )
        const glyphTransform = isSelected
          ? `rotate(${layout.rotation}deg) rotate(${selectionRotation}deg) scale(${SELECTED_SYMBOL_SCALE})`
          : `rotate(${layout.rotation}deg)`

        return (
          <button
            key={symbolId}
            type="button"
            aria-label={`${symbol.label} on card ${cardNumber}`}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onSelectSymbol(symbolId)}
            className={cn(
              'focus-visible:ring-ring/70 absolute inline-flex [height:max(var(--symbol-min-target-size,3rem),var(--symbol-target-size))] [width:max(var(--symbol-min-target-size,3rem),var(--symbol-target-size))] cursor-pointer items-center justify-center overflow-visible rounded-full border-0 p-0 [font-size:clamp(1.5rem,var(--symbol-font-size),5rem)] leading-none focus-visible:z-10 focus-visible:ring-4 focus-visible:outline-none disabled:cursor-default',
              isIncorrect
                ? 'z-[1] border-2 border-red-700/70 bg-red-100/80 ring-4 ring-red-500/50'
                : isRevealed
                  ? 'z-[1] border-2 border-emerald-700/70 bg-emerald-100/80 ring-4 ring-emerald-500/50'
                  : isSelected
                    ? 'border-accent/70! bg-accent/15 ring-accent/40 z-[1] border-2 ring-4'
                    : 'hover:brightness-110',
            )}
            data-symbol-id={symbolId}
            data-selected={isSelected}
            data-incorrect={isIncorrect}
            data-revealed={isRevealed}
            data-layout-slot={layout.slotIndex}
            data-symbol-size={layout.size}
            data-symbol-rotation={layout.rotation}
            data-symbol-x={layout.x}
            data-symbol-y={layout.y}
            data-collision-radius={layout.collisionRadius}
            style={
              {
                '--symbol-font-size': `${layout.size * 100}cqi`,
                '--symbol-target-size': `${layout.collisionRadius * 100}cqi`,
                color,
                left: `${50 + layout.x * 50}%`,
                top: `${50 + layout.y * 50}%`,
                transform: 'translate(-50%, -50%)',
              } as CSSProperties
            }
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 inline-flex items-center justify-center"
              data-symbol-filter=""
              data-score-reveal-muted={isRevealMuted}
              style={{
                filter: isRevealMuted ? SCORE_REVEAL_MUTED_FILTER : 'none',
              }}
            >
              <span
                className="inline-block drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]"
                data-symbol-glyph=""
                data-selection-rotation={selectionRotation}
                style={{ transform: glyphTransform }}
              >
                {symbol.glyph}
              </span>
            </span>
            {isIncorrect ? (
              <span
                aria-hidden="true"
                className="pic-match-incorrect-mark pointer-events-none absolute inset-0 z-10 inline-flex items-center justify-center text-5xl font-black text-red-700 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]"
              >
                ×
              </span>
            ) : null}
            {isRevealed && revealedMatch ? (
              <span
                aria-hidden="true"
                data-score-reveal=""
                className="pic-match-score-reveal pointer-events-none absolute inset-0 z-10 inline-flex items-center justify-center overflow-hidden p-[6%]"
              >
                <span className="line-clamp-2 max-w-full rounded-lg bg-white/95 px-[0.25em] py-[0.125em] text-center text-[clamp(0.55rem,0.3em,1.1rem)] leading-[1.15] font-bold break-words hyphens-auto text-emerald-900 shadow-sm ring-1 ring-emerald-700/30">
                  {revealedMatch.scorerName}
                </span>
              </span>
            ) : null}
          </button>
        )
      })}
    </article>
  )
}

/** Produces a stable unsigned hash for deterministic client-side layout. */
function hashText(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}
