import { expect, test } from '@playwright/test'

import {
  expectStableSymbolHover,
  expectValidCardGeometry,
} from './card-layout-assertions'

const shippedRotationProfiles: Record<string, readonly number[]> = {
  compass: [0, -8, 12, -15, 42, -68, 105, -142],
  drift: [3, -12, 18, -5, 8, -55, 96, 160],
  tideline: [-3, 9, -17, 1, 38, -95, 128, -160],
  meander: [0, 14, -9, 6, -19, -78, 34, 148],
  quarry: [-6, 16, 2, -13, -38, 71, -112, 167],
  signal: [4, -16, 10, -1, 19, 88, -130, 52],
}

test('renders every fixed card template without collisions or movement', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1_000 })
  await page.goto('/wiring-lab/card-layouts')

  await expect(
    page.getByRole('heading', { name: 'Card layout gallery' }),
  ).toBeVisible()

  const cards = page.locator('article[data-card-id]')
  await expect(cards).toHaveCount(12)

  const templateIds = await cards.evaluateAll((elements) =>
    elements.map((card) => card.getAttribute('data-layout-template')),
  )
  expect(new Set(templateIds).size).toBe(12)

  const profileIds = await cards.evaluateAll((elements) =>
    elements.map((card) => card.getAttribute('data-rotation-profile')),
  )
  expect(profileIds).toEqual([
    'compass',
    'drift',
    'tideline',
    'meander',
    'quarry',
    'signal',
    'compass',
    'drift',
    'tideline',
    'meander',
    'quarry',
    'signal',
  ])

  for (const [index, profileId] of profileIds.entries()) {
    const expectedAngles = shippedRotationProfiles[profileId ?? '']
    expect(expectedAngles, `card ${index} uses a shipped profile`).toBeDefined()

    const symbolRotations = await cards
      .nth(index)
      .locator('button[data-symbol-id]')
      .evaluateAll((symbols) =>
        symbols.map((symbol) => Number(symbol.dataset.symbolRotation)),
      )
    expect([...symbolRotations].sort((a, b) => a - b)).toEqual(
      [...(expectedAngles ?? [])].sort((a, b) => a - b),
    )
  }

  await expectValidCardGeometry(cards)

  for (let index = 0; index < 12; index += 1) {
    await expectStableSymbolHover(
      cards.nth(index).locator('button[data-symbol-id]').first(),
    )
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expectValidCardGeometry(cards)

  await cards.evaluateAll((elements) => {
    elements.forEach((card) => {
      if (card instanceof HTMLElement) {
        card.style.width = '240px'
        card.style.minWidth = '0'
        card.style.setProperty('--symbol-min-target-size', '2.75rem')
      }
    })
  })
  await expectValidCardGeometry(cards, {
    minimumLargestSymbol: 36,
    minimumSymbolSizeRange: 12,
    minimumTargetSize: 43.5,
  })
})
