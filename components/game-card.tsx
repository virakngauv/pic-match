import { getSpotItSymbolPresentation } from '@/lib/spot-it-symbols'

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

export function GameCard({
  card,
  cardNumber,
}: {
  card: GameCardModel
  cardNumber: number
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

        return (
          <button
            key={symbolId}
            type="button"
            aria-label={`${symbol.label} on card ${cardNumber}`}
            className="focus-visible:ring-ring/70 absolute inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white/75 p-1 leading-none shadow-sm transition-[filter,box-shadow] hover:brightness-105 focus-visible:z-10 focus-visible:ring-4 focus-visible:outline-none"
            data-symbol-id={symbolId}
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

function hashText(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}
