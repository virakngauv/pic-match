'use client'

import { GameCard } from '@/components/game-card'
import {
  CARD_LAYOUT_TEMPLATES,
  getCardLayoutPreviewPlan,
} from '@/lib/card-layout'

const previewSymbolIds = [
  'sun',
  'moon',
  'star',
  'heart',
  'cat',
  'rocket',
  'book',
  'anchor',
] as const

export function CardLayoutGallery() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
      <header className="max-w-2xl">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Wiring lab
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Card layout gallery
        </h1>
        <p className="text-muted-foreground mt-3 leading-7">
          All fixed templates rendered with their deterministic preview rotation
          and symbol assignment.
        </p>
      </header>

      <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
        {CARD_LAYOUT_TEMPLATES.map((layoutTemplate, templateIndex) => {
          const card = {
            id: `preview-${layoutTemplate.id}`,
            symbolIds: previewSymbolIds,
          }

          return (
            <section key={layoutTemplate.id} className="min-w-0">
              <h2 className="mb-3 text-sm font-bold tracking-wider uppercase">
                {layoutTemplate.id}
              </h2>
              <GameCard
                card={card}
                cardNumber={templateIndex + 1}
                layoutPlan={getCardLayoutPreviewPlan(card, templateIndex)}
                selectedSymbolId={null}
                showIncorrectFeedback={false}
                disabled={false}
                onSelectSymbol={() => undefined}
              />
            </section>
          )
        })}
      </div>
    </main>
  )
}
