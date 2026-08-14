import type { CSSProperties } from 'react'

import { getSpotItSymbolPresentation } from '@/lib/spot-it-symbols'
import type { CardLayoutPlan } from '@/lib/card-layout'
import { cn } from '@/lib/utils'

export type GameCardModel = {
  id: string
  symbolIds: readonly string[]
}

const SYMBOL_COLORS = [
  'oklch(0.51 0.19 28)',
  'oklch(0.48 0.16 145)',
  'oklch(0.48 0.17 260)',
  'oklch(0.55 0.18 320)',
] as const

/** Renders one server-derived card as a circular set of symbol controls. */
export function GameCard({
  card,
  cardNumber,
  layoutPlan,
  selectedSymbolId,
  showIncorrectFeedback,
  disabled,
  onSelectSymbol,
}: {
  card: GameCardModel
  cardNumber: number
  layoutPlan: CardLayoutPlan
  selectedSymbolId: string | null
  showIncorrectFeedback: boolean
  disabled: boolean
  onSelectSymbol: (symbolId: string) => void
}) {
  const symbolLayouts = new Map(
    layoutPlan.symbols.map((layout) => [layout.symbolId, layout]),
  )

  return (
    <article
      className="bg-card [container-type:inline-size] relative aspect-square w-full overflow-hidden rounded-full border-4 border-white shadow-[0_18px_55px_rgba(73,52,31,0.16),inset_0_0_0_1px_var(--border)]"
      aria-label={`Card ${cardNumber}`}
      data-card-id={card.id}
      data-layout-template={layoutPlan.templateId}
      data-template-rotation={layoutPlan.templateRotation}
    >
      <p className="sr-only">
        Card {cardNumber} contains {card.symbolIds.length} symbols.
      </p>
      {card.symbolIds.map((symbolId) => {
        const symbol = getSpotItSymbolPresentation(symbolId)
        const layout = symbolLayouts.get(symbolId)
        const isSelected = selectedSymbolId === symbolId
        const isIncorrect = isSelected && showIncorrectFeedback

        if (!layout) {
          throw new Error(`Missing layout for symbol ${symbolId}.`)
        }

        const color =
          SYMBOL_COLORS[
            hashText(`${card.id}:${symbolId}:color`) % SYMBOL_COLORS.length
          ]

        return (
          <button
            key={symbolId}
            type="button"
            aria-label={`${symbol.label} on card ${cardNumber}`}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onSelectSymbol(symbolId)}
            className={cn(
              'focus-visible:ring-ring/70 absolute inline-flex [height:max(3rem,var(--symbol-target-size))] min-h-12 [width:max(3rem,var(--symbol-target-size))] min-w-12 items-center justify-center overflow-visible rounded-full border-0 p-0 [font-size:clamp(2rem,var(--symbol-font-size),5rem)] leading-none focus-visible:z-10 focus-visible:ring-4 focus-visible:outline-none disabled:cursor-wait',
              isIncorrect
                ? 'z-[1] border-2 border-red-700/70 bg-red-100/80 ring-4 ring-red-500/50'
                : isSelected
                  ? 'border-accent/70 bg-accent/15 ring-accent/40 z-[1] border-2 ring-4'
                  : 'hover:brightness-110',
            )}
            data-symbol-id={symbolId}
            data-selected={isSelected}
            data-incorrect={isIncorrect}
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
              className="inline-block drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]"
              style={{ transform: `rotate(${layout.rotation}deg)` }}
            >
              {symbol.glyph}
            </span>
            {isIncorrect ? (
              <span
                aria-hidden="true"
                className="spot-it-incorrect-mark pointer-events-none absolute inset-0 z-10 inline-flex items-center justify-center text-5xl font-black text-red-700 drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]"
              >
                ×
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
