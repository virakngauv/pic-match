import { getSpotItSymbolPresentation } from '@/lib/spot-it-symbols'
import { cn } from '@/lib/utils'

export type GameCardModel = {
  id: string
  symbolIds: readonly string[]
}

const SYMBOL_SLOTS = [
  { x: 27, y: 23 },
  { x: 55, y: 19 },
  { x: 77, y: 36 },
  { x: 77, y: 65 },
  { x: 55, y: 81 },
  { x: 27, y: 77 },
  { x: 19, y: 53 },
  { x: 49, y: 50 },
] as const

const SYMBOL_COLORS = [
  'oklch(0.51 0.19 28)',
  'oklch(0.48 0.16 145)',
  'oklch(0.48 0.17 260)',
  'oklch(0.55 0.18 320)',
] as const

/** Derives stable, slot-based presentation metadata for one card symbol. */
export function getSymbolLayout(
  cardId: string,
  symbolId: string,
  symbolIndex: number,
) {
  const slot = SYMBOL_SLOTS[symbolIndex % SYMBOL_SLOTS.length]
  const hash = hashText(`${cardId}:${symbolId}:${symbolIndex}`)

  if (!slot) {
    throw new Error('Unable to place a symbol without a layout slot.')
  }

  return {
    x: slot.x + ((hash >>> 3) % 7) - 3,
    y: slot.y + ((hash >>> 7) % 7) - 3,
    size: 1.8 + ((hash >>> 11) % 9) / 10,
    rotation: ((hash >>> 15) % 45) - 22,
    color: SYMBOL_COLORS[(hash >>> 21) % SYMBOL_COLORS.length],
  }
}

/** Renders one server-derived card as a circular set of symbol controls. */
export function GameCard({
  card,
  cardNumber,
  selectedSymbolId,
  disabled,
  onSelectSymbol,
}: {
  card: GameCardModel
  cardNumber: number
  selectedSymbolId: string | null
  disabled: boolean
  onSelectSymbol: (symbolId: string) => void
}) {
  return (
    <article
      className="bg-card relative aspect-square w-full overflow-hidden rounded-full border-4 border-white shadow-[0_18px_55px_rgba(73,52,31,0.16),inset_0_0_0_1px_var(--border)]"
      aria-label={`Card ${cardNumber}`}
      data-card-id={card.id}
    >
      <p className="sr-only">
        Card {cardNumber} contains {card.symbolIds.length} symbols.
      </p>
      {card.symbolIds.map((symbolId, symbolIndex) => {
        const symbol = getSpotItSymbolPresentation(symbolId)
        const layout = getSymbolLayout(card.id, symbolId, symbolIndex)
        const isSelected = selectedSymbolId === symbolId

        return (
          <button
            key={symbolId}
            type="button"
            aria-label={`${symbol.label} on card ${cardNumber}`}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onSelectSymbol(symbolId)}
            className={cn(
              'focus-visible:ring-ring/70 absolute inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border-2 p-1 leading-none transition-[filter,box-shadow,background-color,border-color] focus-visible:z-10 focus-visible:ring-4 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70',
              isSelected
                ? 'border-accent bg-accent/15 ring-accent/40 z-[1] shadow-md ring-4'
                : 'border-transparent bg-white/75 shadow-sm hover:brightness-105',
            )}
            data-symbol-id={symbolId}
            data-selected={isSelected}
            data-symbol-size={layout.size.toFixed(1)}
            data-symbol-rotation={layout.rotation}
            data-symbol-x={layout.x}
            data-symbol-y={layout.y}
            style={{
              color: layout.color,
              fontSize: `${layout.size}rem`,
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              transform: `translate(-50%, -50%) rotate(${layout.rotation}deg)`,
            }}
          >
            <span aria-hidden="true">{symbol.glyph}</span>
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
