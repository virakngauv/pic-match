import { expect, test } from '@playwright/test'

test('plays the three-page solo loop and opens the same seeded challenge', async ({
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

  // Page 1: the start screen invites the player to begin.
  await page.goto('/solo?seed=e2e-solo&target=2')
  await expect(page.getByText('Beat 2', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Play now' }).click()

  // Page 2: the clock is already running on the play screen.
  await expect(page).toHaveURL(/\/solo\/play\?seed=e2e-solo&target=2/)
  await expect(page.getByTestId('solo-time-left')).toHaveText('30s')
  const cards = page.locator('article[data-card-id]')
  await expect(cards).toHaveCount(2)
  await expectNoPageOverflow(page, 320, 568)

  const initialPair = await readPair(page)
  const [firstSymbols, rightSymbols] = await readPairSymbols(page)
  const match = firstSymbols.find((symbol) => rightSymbols.includes(symbol))
  expect(match).toBeTruthy()
  await cards.nth(1).locator(`button[data-symbol-id="${match}"]`).click()
  await expect(page.getByTestId('solo-score')).toHaveText('1')
  await expect(page.getByTestId('solo-time-left')).toHaveText('30s')

  // Expiry lands on page 3, the results screen.
  await page.clock.fastForward('00:31')
  await expect(page).toHaveURL(
    /\/solo\/results\?seed=e2e-solo&score=1&target=2/,
  )
  await expect(page.getByText('You scored 1 pair.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Play again' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible()
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

  // The shared link replays the identical deterministic pair sequence.
  await page.goto(sharedUrl!)
  await expect(page.getByText('Beat 1', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Play now' }).click()
  await expect(cards).toHaveCount(2)
  expect(await readPair(page)).toEqual(initialPair)
})

test('solo never attempts a multiplayer socket connection', async ({
  page,
}) => {
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
  await page.getByRole('link', { name: 'Play now' }).click()
  await expect(page.locator('article[data-card-id]')).toHaveCount(2)

  // The results screen redirects to the start page without a run.
  await page.goto('/solo/results')
  await expect(page).toHaveURL(/\/solo$/)

  // Allow any eager or retried connection attempt to surface before asserting.
  await page.waitForTimeout(2_000)

  expect(socketAttempts).toEqual([])
})

async function readPair(page: import('@playwright/test').Page) {
  return page.locator('article[data-card-id]').evaluateAll((elements) =>
    elements.map((card) => ({
      id: card.getAttribute('data-card-id'),
      symbols: [...card.querySelectorAll('button[data-symbol-id]')].map(
        (symbol) => symbol.getAttribute('data-symbol-id'),
      ),
    })),
  )
}

async function readPairSymbols(page: import('@playwright/test').Page) {
  const pair = await readPair(page)
  return pair.map((card) => card.symbols)
}

async function expectNoPageOverflow(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const surface = document.querySelector('.game-surface')
        return {
          horizontal:
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
          vertical:
            document.documentElement.scrollHeight <=
            document.documentElement.clientHeight,
          surfaceFits:
            surface === null ||
            (surface.scrollHeight <= surface.clientHeight &&
              surface.scrollWidth <= surface.clientWidth),
        }
      }),
    )
    .toEqual({ horizontal: true, vertical: true, surfaceFits: true })
}
