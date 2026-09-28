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
  const initialPair = await cards.evaluateAll((elements) =>
    elements.map((card) => ({
      id: card.getAttribute('data-card-id'),
      symbols: [...card.querySelectorAll('button[data-symbol-id]')].map(
        (symbol) => symbol.getAttribute('data-symbol-id'),
      ),
    })),
  )
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
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    'Timer started.',
  )
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
  await expect(cards).toHaveCount(2)
  expect(
    await cards.evaluateAll((elements) =>
      elements.map((card) => ({
        id: card.getAttribute('data-card-id'),
        symbols: [...card.querySelectorAll('button[data-symbol-id]')].map(
          (symbol) => symbol.getAttribute('data-symbol-id'),
        ),
      })),
    ),
  ).toEqual(initialPair)

  await page.setViewportSize({ width: 650, height: 700 })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true)
})

test('solo never attempts a multiplayer socket connection', async ({ page }) => {
  const socketAttempts: string[] = []
  // Socket.IO always traffics over the /socket.io path; other websockets
  // (for example Next.js dev HMR) are unrelated.
  page.on('websocket', (socket) => {
    if (socket.url().includes('/socket.io')) socketAttempts.push(socket.url())
  })
  page.on('request', (request) => {
    if (request.url().includes('/socket.io')) socketAttempts.push(request.url())
  })

  // Simulate a returning multiplayer player whose session token persists.
  await page.addInitScript(() => {
    localStorage.setItem('pic-match:client-token', 'a'.repeat(32))
  })

  await page.goto('/solo?seed=e2e-socketless')
  await expect(page.getByTestId('solo-score')).toBeVisible()

  // Allow any eager or retried connection attempt to surface before asserting.
  await page.waitForTimeout(2_000)

  expect(socketAttempts).toEqual([])
})
