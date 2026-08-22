import { expect, test, type Page } from '@playwright/test'

import { expectValidCardGeometry } from './card-layout-assertions'

const roomCodePattern = /^[bcdfghkpqrstvz]{4}[2-9y]$/
const compactGameplayViewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
] as const

test('moves a room from creation into a reconnectable game', async ({
  browser,
}) => {
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const lateJoinerContext = await browser.newContext()
  const hostPage = await hostContext.newPage()
  const guestPage = await guestContext.newPage()
  const lateJoinerPage = await lateJoinerContext.newPage()

  try {
    await hostPage.goto('/')

    await expect(hostPage).toHaveURL(/\/home$/)
    await expect(
      hostPage.getByRole('heading', { name: 'Ready to spot the match?' }),
    ).toBeVisible()

    await hostPage.getByRole('link', { name: 'Create a room' }).click()
    await expect(hostPage).toHaveURL(/\/create$/)
    await expect(
      hostPage.getByRole('button', { name: 'Create', exact: true }),
    ).toBeEnabled()
    await hostPage.getByLabel('Name').fill('Ada')
    await hostPage.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(hostPage).toHaveURL(/\/[bcdfghkpqrstvz]{4}[2-9y]$/)
    await expect(
      hostPage.getByRole('heading', { name: 'Ready to play.' }),
    ).toBeVisible()

    const roomCode = new URL(hostPage.url()).pathname.slice(1)
    expect(roomCode).toMatch(roomCodePattern)
    await expect(hostPage.locator('output')).toHaveText(roomCode, {
      ignoreCase: true,
    })
    await expect(hostPage.getByText('Ada')).toBeVisible()
    await expect(hostPage.getByText('You · Host')).toBeVisible()

    await guestPage.goto(`/${roomCode}`)
    await expect(
      guestPage.getByRole('heading', { name: 'Join your friends.' }),
    ).toBeVisible()
    await expect(guestPage.getByLabel('Room code')).toHaveValue(roomCode)
    await expect(guestPage.getByLabel('Name')).toBeFocused()

    await expect(
      guestPage.getByRole('button', { name: 'Join', exact: true }),
    ).toBeEnabled()
    await guestPage.getByLabel('Name').fill('Grace')
    await guestPage.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestPage).toHaveURL(new RegExp(`/${roomCode}$`, 'i'))
    await expect(
      guestPage.getByRole('heading', { name: 'Ready to play.' }),
    ).toBeVisible()
    await expect(guestPage.getByText('Ada')).toBeVisible()
    await expect(guestPage.getByText('Grace')).toBeVisible()
    await expect(guestPage.getByText('You', { exact: true })).toBeVisible()
    await expect(
      guestPage.getByText('Waiting for the host to start the game.'),
    ).toBeVisible()
    await expect(
      guestPage.getByRole('button', { name: 'Start game' }),
    ).toHaveCount(0)

    await expect(hostPage.getByText('Grace')).toBeVisible()
    await expect(hostPage.getByText('You · Host')).toBeVisible()

    await hostPage.getByRole('button', { name: 'Start game' }).click()

    await expect(
      hostPage.getByRole('main', { name: 'Game for Ada' }),
    ).toHaveAttribute('data-player-position', '0')
    await expect(
      guestPage.getByRole('main', { name: 'Game for Grace' }),
    ).toHaveAttribute('data-player-position', '1')

    for (const viewport of compactGameplayViewports) {
      await expectGameplayFitsViewport(hostPage, viewport)
    }

    await expectGameplayAtDoubleTextSize(hostPage)
    await hostPage.setViewportSize({ width: 1_280, height: 720 })

    await guestPage.reload()
    await expect(
      guestPage.getByRole('main', { name: 'Game for Grace' }),
    ).toHaveAttribute('data-player-position', '1')

    await lateJoinerPage.goto('/join')
    await expect(
      lateJoinerPage.getByRole('button', { name: 'Join', exact: true }),
    ).toBeEnabled()
    await expect(lateJoinerPage.getByLabel('Room code')).toBeFocused()
    await expect(lateJoinerPage.getByLabel('Room code')).not.toHaveAttribute(
      'placeholder',
    )
    await lateJoinerPage.getByLabel('Room code').fill(roomCode)
    await lateJoinerPage.getByLabel('Name').fill('Linus')
    await lateJoinerPage
      .getByRole('button', { name: 'Join', exact: true })
      .click()
    await expect(lateJoinerPage.locator('form [role="alert"]')).toHaveText(
      'This game has already started.',
    )
    await expect(lateJoinerPage).toHaveURL(/\/join$/)
  } finally {
    await Promise.all([
      lateJoinerContext.close(),
      guestContext.close(),
      hostContext.close(),
    ])
  }
})

async function expectGameplayFitsViewport(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport)
  const minimumTargetSize = 44

  const measurements = await page.evaluate(() => {
    const boundsFor = (element: Element) => {
      const bounds = element.getBoundingClientRect()

      return {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      }
    }
    const cards = Array.from(document.querySelectorAll('article[data-card-id]'))
    const targets = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[data-symbol-id]'),
    )
    const scoreboard = document.querySelector<HTMLElement>('.game-scoreboard')
    const scoreViewport = document.querySelector<HTMLElement>(
      '.game-score-viewport',
    )
    const scoreList =
      document.querySelector<HTMLOListElement>('.game-score-list')
    const firstScoreEntry =
      scoreList?.querySelector<HTMLElement>('.game-score-entry')
    const firstScoreName =
      firstScoreEntry?.querySelector<HTMLElement>('.game-score-name')
    const firstScoreValue =
      firstScoreEntry?.querySelector<HTMLElement>('.game-score-value')

    if (
      !scoreboard ||
      !scoreViewport ||
      !scoreList ||
      !firstScoreEntry ||
      !firstScoreName ||
      !firstScoreValue
    ) {
      throw new Error('Missing the active-game leaderboard.')
    }

    const scoreboardBounds = boundsFor(scoreboard)
    const scoreListStyles = getComputedStyle(scoreList)
    const scoreViewportStyles = getComputedStyle(scoreViewport)

    return {
      cards: cards.map(boundsFor),
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
      minTargetSize: Math.min(
        ...targets.flatMap((target) => {
          const bounds = target.getBoundingClientRect()
          return [bounds.width, bounds.height]
        }),
      ),
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scoreboard: scoreboardBounds,
      scoreEntryText: Array.from(
        scoreList.querySelectorAll<HTMLElement>('.game-score-entry'),
      ).map((entry) => ({
        name:
          entry.querySelector<HTMLElement>('.game-score-name')?.innerText ?? '',
        score:
          entry.querySelector<HTMLElement>('.game-score-value')?.innerText ??
          '',
      })),
      scoreName: boundsFor(firstScoreName),
      scoreValue: boundsFor(firstScoreValue),
      scoreListDisplay: scoreListStyles.display,
      scoreListFlexWrap: scoreListStyles.flexWrap,
      scoreViewportOverflowX: scoreViewportStyles.overflowX,
      navigationCount: document.querySelectorAll(
        'main.game-surface nav, .game-navigation',
      ).length,
      persistentFeedbackCount:
        document.querySelectorAll('.game-feedback').length,
    }
  })

  expect(measurements.cards).toHaveLength(2)
  expect(measurements.scrollHeight).toBeLessThanOrEqual(
    measurements.clientHeight + 1,
  )
  expect(measurements.scrollWidth).toBeLessThanOrEqual(
    measurements.clientWidth + 1,
  )
  expect(measurements.minTargetSize).toBeGreaterThanOrEqual(minimumTargetSize)
  expect(measurements.scoreListDisplay).toBe('flex')
  expect(measurements.scoreListFlexWrap).toBe('nowrap')
  expect(measurements.scoreViewportOverflowX).toBe('auto')
  expect(measurements.navigationCount).toBe(0)
  expect(measurements.persistentFeedbackCount).toBe(0)
  expect(measurements.scoreEntryText).toEqual([
    { name: 'Ada', score: '0' },
    { name: 'Grace', score: '0' },
  ])
  expect(measurements.scoreboard.left).toBeGreaterThanOrEqual(-1)
  expect(measurements.scoreboard.right).toBeLessThanOrEqual(
    measurements.clientWidth + 1,
  )
  expect(measurements.scoreboard.bottom).toBeLessThanOrEqual(
    Math.min(...measurements.cards.map((card) => card.top)) + 1,
  )

  if (viewport.width < 640) {
    expect(measurements.scoreValue.top).toBeGreaterThanOrEqual(
      measurements.scoreName.bottom - 1,
    )
  }

  for (const card of measurements.cards) {
    expect(card.top).toBeGreaterThanOrEqual(-1)
    expect(card.left).toBeGreaterThanOrEqual(-1)
    expect(card.right).toBeLessThanOrEqual(measurements.clientWidth + 1)
    expect(card.bottom).toBeLessThanOrEqual(measurements.clientHeight + 1)
  }

  await expectValidCardGeometry(page.locator('article[data-card-id]'), {
    minimumLargestSymbol: 36,
    minimumSymbolSizeRange: 12,
    minimumTargetSize: minimumTargetSize - 0.5,
  })
  await expect(page.getByLabel("Ada's score")).toBeVisible()
  await expect(page.getByLabel("Grace's score")).toBeVisible()
}

async function expectGameplayAtDoubleTextSize(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })

  const measurements = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.game-surface')

    if (!surface) {
      throw new Error('Missing the gameplay scroll container.')
    }

    const surfaceBounds = surface.getBoundingClientRect()
    const cards = Array.from(
      document.querySelectorAll('article[data-card-id]'),
    ).map((card) => {
      const bounds = card.getBoundingClientRect()

      return {
        bottom: bounds.bottom - surfaceBounds.top + surface.scrollTop,
        left: bounds.left - surfaceBounds.left + surface.scrollLeft,
        right: bounds.right - surfaceBounds.left + surface.scrollLeft,
        top: bounds.top - surfaceBounds.top + surface.scrollTop,
      }
    })

    return {
      cards,
      documentScrollWidth: document.documentElement.scrollWidth,
      surfaceClientHeight: surface.clientHeight,
      surfaceClientWidth: surface.clientWidth,
      surfaceScrollHeight: surface.scrollHeight,
      surfaceScrollWidth: surface.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })

  expect(measurements.documentScrollWidth).toBeLessThanOrEqual(
    measurements.viewportWidth + 1,
  )
  expect(measurements.surfaceScrollWidth).toBeLessThanOrEqual(
    measurements.surfaceClientWidth + 1,
  )
  expect(measurements.surfaceScrollHeight).toBeGreaterThanOrEqual(
    measurements.surfaceClientHeight,
  )

  for (const card of measurements.cards) {
    expect(card.left).toBeGreaterThanOrEqual(-1)
    expect(card.right).toBeLessThanOrEqual(measurements.surfaceScrollWidth + 1)
    expect(card.top).toBeGreaterThanOrEqual(-1)
    expect(card.bottom).toBeLessThanOrEqual(
      measurements.surfaceScrollHeight + 1,
    )
  }

  await page.getByLabel("Ada's score").scrollIntoViewIfNeeded()
  await expect(page.getByLabel("Ada's score")).toBeVisible()
  await expect(page.getByLabel('Match claim feedback')).toBeAttached()

  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
}
