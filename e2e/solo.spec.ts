import { expect, test } from '@playwright/test'

import { expectValidCardGeometry } from './card-layout-assertions'

// Mirrors SOLO_CHALLENGE.successFeedbackMs; e2e specs do not import lib code.
const SOLO_SUCCESS_FEEDBACK_MS = 220

test('plays the three-page solo loop and shares a challenge link', async ({
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

  // Page 1: the rules screen invites the player to begin.
  await page.goto('/solo/rules')
  await expect(
    page.getByRole('heading', { name: 'play solo game.' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Play solo game' }).click()

  // Page 2: the clock is already running on the play screen.
  await expect(page).toHaveURL(/\/solo\/play$/)
  await expect(page.getByTestId('solo-time-left')).toHaveText('30s')
  const cards = page.locator('article[data-card-id]')
  await expect(cards).toHaveCount(2)
  await expectValidCardGeometry(cards, { minimumSymbolSizeRange: 26 })

  const shared = await readSharedSymbol(page)
  await cards.nth(1).locator(`button[data-symbol-id="${shared}"]`).click()
  await expect(page.getByTestId('solo-score')).toHaveText('1')

  // Three more correct answers climb into the four-symbol stage, whose
  // layout follows the same geometry rules on the rendered board.
  for (let score = 2; score <= 4; score += 1) {
    await page.clock.fastForward(SOLO_SUCCESS_FEEDBACK_MS)
    const nextShared = await readSharedSymbol(page)
    await cards
      .first()
      .locator(`button[data-symbol-id="${nextShared}"]`)
      .click()
    await expect(page.getByTestId('solo-score')).toHaveText(String(score))
  }
  await page.clock.fastForward(SOLO_SUCCESS_FEEDBACK_MS)
  await expect(page.getByTestId('solo-symbols')).toHaveText('4')
  await expectValidCardGeometry(cards, { minimumSymbolSizeRange: 30 })

  // The page still never scrolls, even on the smallest supported phone.
  await expectNoPageOverflow(page, 320, 568)

  // Expiry lands on page 3, the results screen.
  await page.clock.fastForward('00:35')
  await expect(page).toHaveURL(/\/solo\/results$/)
  await expect(page.getByText('You scored 4 pairs.')).toBeVisible()
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
    .toBe(4)

  // Sharing flips the button itself instead of surfacing a status line, and
  // the confirmation reverts to the action label.
  await page.getByRole('button', { name: 'Challenge a friend' }).click()
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible()
  const copied = await page.evaluate(() =>
    sessionStorage.getItem('solo-copied'),
  )
  expect(copied).toMatch(
    /^I matched 4 pairs in Pic Match Solo\. Can you beat me\? https?:\/\/\S+\/solo\/rules$/,
  )
  await page.clock.fastForward('00:01')
  await expect(
    page.getByRole('button', { name: 'Challenge a friend' }),
  ).toBeVisible()

  // The plain solo link lands a friend on the fresh rules screen.
  const sharedUrl = copied?.match(/https?:\/\/\S+/)?.[0]
  expect(sharedUrl).toBeTruthy()
  await page.goto(sharedUrl!)
  await expect(page).toHaveURL(/\/solo\/rules$/)
  await expect(
    page.getByRole('heading', { name: 'play solo game.' }),
  ).toBeVisible()
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

  await page.goto('/solo/rules')
  await page.getByRole('link', { name: 'Play solo game' }).click()
  await expect(page.locator('article[data-card-id]')).toHaveCount(2)

  // The results screen redirects to the rules page without a run.
  await page.goto('/solo/results')
  await expect(page).toHaveURL(/\/solo\/rules$/)

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

async function readSharedSymbol(page: import('@playwright/test').Page) {
  const [leftSymbols, rightSymbols] = await readPairSymbols(page)
  const shared = leftSymbols.find((symbol) => rightSymbols.includes(symbol))

  if (!shared) {
    throw new Error('The rendered solo pair has no shared symbol.')
  }

  return shared
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
