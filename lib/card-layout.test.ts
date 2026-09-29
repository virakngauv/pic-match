import { describe, expect, it } from 'vitest'

import { SELECTED_SYMBOL_SCALE } from './card-selection'
import {
  CARD_LAYOUT_EDGE_PADDING,
  CARD_LAYOUT_TEMPLATES,
  CARD_ROTATION_PROFILES,
  SOLO_CARD_LAYOUT_TEMPLATES,
  type CardLayoutSlot,
  type CardRotationProfile,
  MAX_SYMBOL_SIZE,
  MIN_SYMBOL_SIZE,
  getCardLayoutPreviewPlan,
  getPairLayoutPlans,
  rotateCardLayoutSlot,
  validateCardLayoutTemplate,
  validateRotationProfile,
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

// Guard rails against regressing to centered regular polygons (triangle,
// square, hexagon) or flat size ladders on the smaller solo decks. Limits were
// calibrated against the shipped generated templates; a centered radial
// layout, corner cluster, or uniform ladder cannot satisfy all three.
const MIN_SOLO_SIZE_SPREAD: Record<number, number> = { 3: 0.09, 4: 0.1, 6: 0.1 }
const EMPTY_GAP_LIMITS: Record<number, number> = {
  3: 0.35,
  4: 0.31,
  6: 0.3,
  8: 0.27,
}
const MIN_CENTROID_DISTANCE_SPREAD = 0.04
const EMPTY_GAP_SAMPLE_COUNT = 128
const EMPTY_GAP_GOLDEN_ANGLE = 2.399963229728653

/**
 * Distance from the emptiest deterministic sample point on the usable card
 * disk to the nearest symbol collision envelope (or the card edge).
 */
function findLargestEmptyGap(slots: readonly CardLayoutSlot[]): number {
  let largestGap = 0

  for (let sample = 0; sample < EMPTY_GAP_SAMPLE_COUNT; sample += 1) {
    const distance =
      Math.sqrt((sample + 0.5) / EMPTY_GAP_SAMPLE_COUNT) *
      (1 - CARD_LAYOUT_EDGE_PADDING)
    const x = Math.cos(sample * EMPTY_GAP_GOLDEN_ANGLE) * distance
    const y = Math.sin(sample * EMPTY_GAP_GOLDEN_ANGLE) * distance
    let nearest = 1 - CARD_LAYOUT_EDGE_PADDING - Math.hypot(x, y)

    for (const slot of slots) {
      nearest = Math.min(
        nearest,
        Math.hypot(x - slot.x, y - slot.y) -
          Math.max(slot.collisionRadius, slot.size * SELECTED_SYMBOL_SCALE),
      )
    }

    largestGap = Math.max(largestGap, nearest)
  }

  return largestGap
}

describe('card layout templates', () => {
  it('ships twelve distinct, collision-free eight-symbol templates', () => {
    expect(CARD_LAYOUT_TEMPLATES).toHaveLength(12)
    expect(new Set(CARD_LAYOUT_TEMPLATES.map(({ id }) => id)).size).toBe(12)

    for (const layoutTemplate of CARD_LAYOUT_TEMPLATES) {
      expect(validateCardLayoutTemplate(layoutTemplate)).toEqual([])
    }
  })

  it.each([3, 4, 6])('plans collision-free %s-symbol solo cards', (count) => {
    const symbols = ['sun', 'moon', 'star', 'heart', 'cat', 'rocket'].slice(
      0,
      count,
    )
    for (const template of SOLO_CARD_LAYOUT_TEMPLATES[count] ?? []) {
      expect(validateCardLayoutTemplate(template)).toEqual([])
    }
    const plans = getPairLayoutPlans(
      [
        { id: 'a', symbolIds: symbols },
        { id: 'b', symbolIds: symbols },
      ],
      3,
    )
    expect(plans[0].templateId).not.toBe(plans[1].templateId)
    expect(plans[0].symbols).toHaveLength(count)
    expect(plans[1].symbols).toHaveLength(count)
  })

  it.each([3, 4, 6])(
    'uses the full rotation palette for %s-symbol cards',
    (count) => {
      const symbols = ['sun', 'moon', 'star', 'heart', 'cat', 'rocket'].slice(
        0,
        count,
      )
      const angles = new Set<number>()
      for (let revision = 0; revision < 64; revision += 1) {
        const cards = [
          { id: 'a', symbolIds: symbols },
          { id: 'b', symbolIds: symbols },
        ]
        for (const plan of getPairLayoutPlans(cards, revision)) {
          plan.symbols.forEach((symbol) => angles.add(symbol.rotation))
        }
      }
      expect([...angles].some((angle) => Math.abs(angle) > 60)).toBe(true)
      expect([...angles].some((angle) => Math.abs(angle) <= 20)).toBe(true)
    },
  )

  it('uses the full reviewed symbol-size range', () => {
    const sizes = CARD_LAYOUT_TEMPLATES.flatMap(({ slots }) =>
      slots.map(({ size }) => size),
    )

    expect(Math.min(...sizes)).toBe(MIN_SYMBOL_SIZE)
    expect(Math.max(...sizes)).toBe(MAX_SYMBOL_SIZE)
  })

  it('reserves every collision envelope for the maximum selected scale', () => {
    for (const layoutTemplate of CARD_LAYOUT_TEMPLATES) {
      for (const slot of layoutTemplate.slots) {
        expect(slot.size * SELECTED_SYMBOL_SCALE).toBeLessThanOrEqual(
          slot.collisionRadius,
        )
      }
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

  it('rotates slot positions without touching sizing or orientation data', () => {
    const slot = {
      x: 0.3,
      y: 0.1,
      size: MIN_SYMBOL_SIZE,
      collisionRadius: 0.17,
    }

    for (const rotation of [17, 90, 181, 289]) {
      const rotated = rotateCardLayoutSlot(slot, rotation)
      const radians = (rotation * Math.PI) / 180

      expect(rotated.x).toBeCloseTo(
        slot.x * Math.cos(radians) - slot.y * Math.sin(radians),
        10,
      )
      expect(rotated.y).toBeCloseTo(
        slot.x * Math.sin(radians) + slot.y * Math.cos(radians),
        10,
      )
      expect(rotated.size).toBe(slot.size)
      expect(rotated.collisionRadius).toBe(slot.collisionRadius)
    }
  })

  it('ships distinct curated rotation profiles that balance orientation', () => {
    expect(CARD_ROTATION_PROFILES.length).toBeGreaterThanOrEqual(4)

    const angleSets = new Set(
      CARD_ROTATION_PROFILES.map(({ angles }) =>
        [...angles].sort((a, b) => a - b).join(','),
      ),
    )

    expect(angleSets.size).toBe(CARD_ROTATION_PROFILES.length)

    for (const rotationProfile of CARD_ROTATION_PROFILES) {
      expect(validateRotationProfile(rotationProfile)).toEqual([])
    }
  })

  it('rejects rotation profiles that fail the documented bands', () => {
    const profile = (id: string, angles: number[]) =>
      validateRotationProfile({
        id,
        angles: angles as unknown as CardRotationProfile['angles'],
      })

    expect(profile('too-few', [0, 5])).toEqual([
      'too-few must contain exactly eight angles.',
    ])
    expect(
      profile('non-finite', [0, 0, 0, 0, 30, 90, Number.NaN, -90]),
    ).toEqual(['non-finite angle 6 is non-finite.'])
    expect(profile('out-of-range', [0, 5, -10, 8, 40, 90, 180, -90])).toEqual([
      'out-of-range angle 6 is outside (-180, 180).',
    ])
    expect(profile('too-upright', [0, 4, -6, 8, -3, 12, 90, -90])).toEqual([
      'too-upright keeps 6 angles mostly upright; expected four or five.',
      'too-upright needs at least one moderate tilt beyond ±20°.',
      'too-upright clusters 6 angles within ±20° of 0°.',
    ])
    expect(profile('no-strong', [0, 4, -6, 8, 30, -35, 55, -50])).toEqual([
      'no-strong needs at least two strong tilts beyond ±60°.',
    ])
    expect(profile('no-moderate', [0, 4, -6, 8, -95, 100, 130, -150])).toEqual([
      'no-moderate needs at least one moderate tilt beyond ±20°.',
    ])
    expect(profile('clustered', [0, 4, 8, 12, 16, 20, 100, -100])).toEqual([
      'clustered keeps 6 angles mostly upright; expected four or five.',
      'clustered needs at least one moderate tilt beyond ±20°.',
      'clustered clusters 6 angles within ±20° of 0°.',
    ])
  })

  it('builds stable plans with unique slots and different paired templates', () => {
    const profileIds = new Set(CARD_ROTATION_PROFILES.map(({ id }) => id))
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
      expect(profileIds).toContain(plan.rotationProfileId)
    }
  })

  it('permutes the selected profile angles without adding the spatial rotation', () => {
    const profilesById = new Map(
      CARD_ROTATION_PROFILES.map((rotationProfile) => [
        rotationProfile.id,
        rotationProfile,
      ]),
    )
    const usedProfileIds = new Set<string>()

    for (let revision = 0; revision < 128; revision += 1) {
      for (const plan of getPairLayoutPlans(cards, revision)) {
        const rotationProfile = profilesById.get(plan.rotationProfileId)
        expect(rotationProfile).toBeDefined()
        usedProfileIds.add(plan.rotationProfileId)

        const planAngles = plan.symbols
          .map(({ rotation }) => rotation)
          .sort((a, b) => a - b)

        expect(planAngles).toEqual(
          [...(rotationProfile?.angles ?? [])].sort((a, b) => a - b),
        )
        expect(Math.max(...planAngles.map(Math.abs))).toBeLessThanOrEqual(179)
      }
    }

    expect(usedProfileIds).toEqual(
      new Set(CARD_ROTATION_PROFILES.map(({ id }) => id)),
    )
  })

  it('varies profile selection and angle assignment with the card identity', () => {
    const profileIds = new Set<string>()
    const firstSymbolRotations = new Set<number>()
    const secondCard = cards[1]

    for (let idOffset = 0; idOffset < 32; idOffset += 1) {
      const variantCards = [
        { ...cards[0], id: `card-${13 + idOffset}` },
        secondCard,
      ]

      for (const plan of getPairLayoutPlans(variantCards, 7)) {
        if (plan.symbols[0]?.symbolId === cards[0].symbolIds[0]) {
          profileIds.add(plan.rotationProfileId)
          firstSymbolRotations.add(plan.symbols[0].rotation)
        }
      }
    }

    expect(profileIds.size).toBeGreaterThan(1)
    expect(firstSymbolRotations.size).toBeGreaterThan(1)
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

  it('previews solo-count cards with size-matched templates', () => {
    const plan = getCardLayoutPreviewPlan(
      { id: 'trio-preview', symbolIds: ['sun', 'moon', 'star'] },
      0,
    )

    expect(plan.templateId).toBe('maple')
    expect(plan.symbols).toHaveLength(3)
  })

  it('keeps a strong size hierarchy on every solo template', () => {
    for (const [count, layoutTemplates] of Object.entries(
      SOLO_CARD_LAYOUT_TEMPLATES,
    )) {
      const minimumSpread = MIN_SOLO_SIZE_SPREAD[Number(count)]

      for (const layoutTemplate of layoutTemplates) {
        const sizes = layoutTemplate.slots.map(({ size }) => size)

        expect(
          Math.max(...sizes) - Math.min(...sizes),
          `${layoutTemplate.id} collapses its size hierarchy`,
        ).toBeGreaterThanOrEqual(minimumSpread)
      }
    }
  })

  it.each([3, 4, 6, 8])(
    'bounds the largest empty region on %s-symbol templates',
    (count) => {
      const layoutTemplates =
        count === 8
          ? CARD_LAYOUT_TEMPLATES
          : (SOLO_CARD_LAYOUT_TEMPLATES[count] ?? [])

      for (const layoutTemplate of layoutTemplates) {
        expect(
          findLargestEmptyGap(layoutTemplate.slots),
          `${layoutTemplate.id} leaves too large an uncovered region`,
        ).toBeLessThanOrEqual(EMPTY_GAP_LIMITS[count])
      }
    },
  )

  it('avoids regular-polygon arrangements in every template', () => {
    const layoutTemplates = [
      ...CARD_LAYOUT_TEMPLATES,
      ...Object.values(SOLO_CARD_LAYOUT_TEMPLATES).flat(),
    ]

    for (const layoutTemplate of layoutTemplates) {
      const centroidX =
        layoutTemplate.slots.reduce((sum, { x }) => sum + x, 0) /
        layoutTemplate.slots.length
      const centroidY =
        layoutTemplate.slots.reduce((sum, { y }) => sum + y, 0) /
        layoutTemplate.slots.length
      const centroidDistances = layoutTemplate.slots.map(({ x, y }) =>
        Math.hypot(x - centroidX, y - centroidY),
      )

      expect(
        Math.max(...centroidDistances) - Math.min(...centroidDistances),
        `${layoutTemplate.id} sits on a regular polygon`,
      ).toBeGreaterThanOrEqual(MIN_CENTROID_DISTANCE_SPREAD)
    }
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
    ).toThrow('Paired cards must have the same symbol count')
  })
})
