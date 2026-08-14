import { describe, expect, it } from 'vitest'

import {
  CARD_LAYOUT_TEMPLATES,
  getCardLayoutPreviewPlan,
  getPairLayoutPlans,
  rotateCardLayoutSlot,
  validateCardLayoutTemplate,
} from './card-layout'

const cards = [
  {
    id: 'card-13',
    symbolIds: [
      'sun',
      'moon',
      'star',
      'heart',
      'cat',
      'rocket',
      'book',
      'anchor',
    ],
  },
  {
    id: 'card-52',
    symbolIds: [
      'cat',
      'flower',
      'apple',
      'bee',
      'turtle',
      'camera',
      'gift',
      'dice',
    ],
  },
] as const

describe('card layout templates', () => {
  it('ships twelve distinct, collision-free eight-symbol templates', () => {
    expect(CARD_LAYOUT_TEMPLATES).toHaveLength(12)
    expect(new Set(CARD_LAYOUT_TEMPLATES.map(({ id }) => id))).toHaveLength(12)

    for (const layoutTemplate of CARD_LAYOUT_TEMPLATES) {
      expect(validateCardLayoutTemplate(layoutTemplate)).toEqual([])
    }
  })

  it('preserves every layout invariant through whole-template rotation', () => {
    for (const layoutTemplate of CARD_LAYOUT_TEMPLATES) {
      for (const rotation of [17, 73, 181, 289]) {
        expect(
          validateCardLayoutTemplate({
            id: `${layoutTemplate.id}-${rotation}`,
            slots: layoutTemplate.slots.map((slot) =>
              rotateCardLayoutSlot(slot, rotation),
            ),
          }),
        ).toEqual([])
      }
    }
  })

  it('builds stable plans with unique slots and different paired templates', () => {
    const firstPlans = getPairLayoutPlans(cards, 7)
    const secondPlans = getPairLayoutPlans(cards, 7)

    expect(secondPlans).toEqual(firstPlans)
    expect(firstPlans[0].templateId).not.toBe(firstPlans[1].templateId)

    for (const [card, plan] of cards.map(
      (card, index) => [card, firstPlans[index as 0 | 1]] as const,
    )) {
      expect(plan.symbols.map(({ symbolId }) => symbolId)).toEqual(
        card.symbolIds,
      )
      expect(new Set(plan.symbols.map(({ slotIndex }) => slotIndex)).size).toBe(
        8,
      )
      expect(new Set(plan.symbols.map(({ size }) => size)).size).toBe(8)
    }
  })

  it('uses all templates while never repeating one within a displayed pair', () => {
    const usedTemplateIds = new Set<string>()
    const rotations = new Set<number>()

    for (let revision = 0; revision < 512; revision += 1) {
      const plans = getPairLayoutPlans(cards, revision)

      expect(plans[0].templateId).not.toBe(plans[1].templateId)

      for (const plan of plans) {
        usedTemplateIds.add(plan.templateId)
        rotations.add(plan.templateRotation)
      }
    }

    expect(usedTemplateIds).toEqual(
      new Set(CARD_LAYOUT_TEMPLATES.map(({ id }) => id)),
    )
    expect(Math.min(...rotations)).toBeLessThan(10)
    expect(Math.max(...rotations)).toBeGreaterThan(349)
  })

  it('builds a review plan for every fixed template', () => {
    const previewIds = CARD_LAYOUT_TEMPLATES.map(
      (_, templateIndex) =>
        getCardLayoutPreviewPlan(cards[0], templateIndex).templateId,
    )

    expect(previewIds).toEqual(CARD_LAYOUT_TEMPLATES.map(({ id }) => id))
  })

  it('rejects malformed card input before rendering', () => {
    expect(() => getPairLayoutPlans(cards.slice(0, 1), 0)).toThrow(
      'Exactly two cards',
    )
    expect(() =>
      getPairLayoutPlans(
        [cards[0], { id: 'short-card', symbolIds: ['sun'] }],
        0,
      ),
    ).toThrow('Exactly eight symbols')
  })
})
