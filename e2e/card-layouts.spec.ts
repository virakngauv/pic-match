import { expect, test } from '@playwright/test'

import {
  expectStableSymbolHover,
  expectValidCardGeometry,
} from './card-layout-assertions'

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

  await expectValidCardGeometry(cards)

  for (let index = 0; index < 12; index += 1) {
    await expectStableSymbolHover(
      cards.nth(index).locator('button[data-symbol-id]').first(),
    )
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expectValidCardGeometry(cards)
})
