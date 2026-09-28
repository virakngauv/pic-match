import { expect, test } from '@playwright/test'

test('finishes a solo run and opens the same seeded challenge', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined })
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) =>
          sessionStorage.setItem('solo-copied', text),
      },
    })
  })
  await page.clock.install()
  await page.goto('/solo?seed=e2e-solo&target=2')
  await expect(page.getByText('Beat 2')).toBeVisible()
  await expect(page.getByTestId('solo-time')).toHaveText('30s')

  const cards = page.locator('article[data-card-id]')
  const firstSymbols = await cards
    .nth(0)
    .locator('button[data-symbol-id]')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('data-symbol-id')),
    )
  const secondSymbols = await cards
    .nth(1)
    .locator('button[data-symbol-id]')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('data-symbol-id')),
    )
  const match = firstSymbols.find((symbol) => secondSymbols.includes(symbol))
  expect(match).toBeTruthy()
  await cards.nth(1).locator(`button[data-symbol-id="${match}"]`).click()
  await expect(page.getByTestId('solo-score')).toHaveText('1')
  await page.clock.fastForward('00:31')
  await expect(page.getByTestId('solo-result')).toContainText('1 pairs matched')
  await expect(cards.locator('button:not([disabled])')).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('pic-match:solo:v1') ?? '{}')
            .bestScore,
      ),
    )
    .toBe(1)

  await page.getByRole('button', { name: 'Share challenge' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'Challenge copied to clipboard.',
  )
  const copied = await page.evaluate(() =>
    sessionStorage.getItem('solo-copied'),
  )
  const sharedUrl = copied?.match(/https?:\/\/\S+/)?.[0]
  expect(sharedUrl).toBeTruthy()
  await page.goto(sharedUrl!)
  await expect(page.getByText('Beat 1')).toBeVisible()
  expect(await cards.nth(0).getAttribute('data-card-id')).toBeTruthy()
})
