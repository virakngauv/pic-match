import { expect, test, type Locator, type Page } from '@playwright/test'
import { PNG } from 'pngjs'

import {
  expectStableSymbolHover,
  expectValidCardGeometry,
} from './card-layout-assertions'

const roomCodePattern = /^[bcdfghkpqrstvz]{4}[2-9y]$/
const playerNames = {
  host: 'Ada',
  guest: 'Grace',
  third: 'Margaret Hamilton',
  replacement: 'Linus',
  removed: 'Kay',
} as const

type CardSnapshot = {
  id: string
  symbolIds: string[]
}

type PlayingSnapshot = {
  cards: CardSnapshot[]
  scores: Record<string, number>
}

test('replays a complete shared race across browser sessions', async ({
  browser,
  browserName,
  baseURL,
}) => {
  test.setTimeout(180_000)

  const hostContext = await browser.newContext({ baseURL })
  let guestContext = await browser.newContext({ baseURL })
  const thirdContext = await browser.newContext({ baseURL })
  const outsiderContext = await browser.newContext({ baseURL })
  const lateJoinerContext = await browser.newContext({ baseURL })
  const removedContext = await browser.newContext({ baseURL })
  const hostPage = await hostContext.newPage()
  let guestPage = await guestContext.newPage()
  const thirdPage = await thirdContext.newPage()
  const outsiderPage = await outsiderContext.newPage()
  const lateJoinerPage = await lateJoinerContext.newPage()
  const removedPage = await removedContext.newPage()

  try {
    const roomCode = await createRoom(hostPage, playerNames.host)
    await joinRoom(removedPage, roomCode, playerNames.removed)

    await expect(
      hostPage.getByText(playerNames.removed, { exact: true }),
    ).toBeVisible()
    await hostPage
      .getByRole('button', {
        name: `Remove ${playerNames.removed} from room`,
      })
      .click()
    const removeDialog = hostPage.getByRole('dialog', {
      name: `Remove ${playerNames.removed}?`,
    })
    await expect(removeDialog).toContainText(
      'won’t be able to rejoin this room',
    )
    await removeDialog
      .getByRole('button', { name: `Remove ${playerNames.removed}` })
      .click()
    await expect(
      hostPage.getByRole('listitem').filter({ hasText: playerNames.removed }),
    ).toHaveCount(0)
    await expect(
      removedPage.getByRole('heading', {
        name: 'You were removed from this room.',
      }),
    ).toBeVisible()

    await removedPage.reload()
    await expect(
      removedPage.getByRole('heading', {
        name: 'You were removed from this room.',
      }),
    ).toBeVisible()
    await expect(removedPage.getByText(/can’t rejoin this room/i)).toBeVisible()
    await expect(
      removedPage.getByRole('link', { name: 'Create a new room' }),
    ).toBeVisible()
    await expect(
      removedPage.getByRole('link', { name: 'Join another room' }),
    ).toBeVisible()
    await expect(
      removedPage.getByRole('link', { name: 'Go home' }),
    ).toBeVisible()

    await removedPage.goto('/join')
    await removedPage.getByLabel('Room code').fill(roomCode)
    await removedPage.getByLabel('Name').fill(`${playerNames.removed} II`)
    await removedPage.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(
      removedPage.getByText('The host removed you from this room.'),
    ).toBeVisible()
    await expect(
      removedPage.getByRole('button', { name: 'Join', exact: true }),
    ).toBeEnabled()

    await joinRoom(guestPage, roomCode, playerNames.guest)
    await expect(
      hostPage.getByText(playerNames.guest, { exact: true }),
    ).toBeVisible()
    await joinRoom(thirdPage, roomCode, playerNames.third)
    await expect(
      hostPage.getByText(playerNames.third, { exact: true }),
    ).toBeVisible()

    await hostPage.getByRole('button', { name: 'Start game' }).click()

    await expectPlaying(hostPage, playerNames.host)
    await expectPlaying(guestPage, playerNames.guest)
    await expectPlaying(thirdPage, playerNames.third)

    const initialState = await playingSnapshot(hostPage)
    expect(initialState.scores).toEqual({
      Ada: 0,
      Grace: 0,
      'Margaret Hamilton': 0,
    })
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(initialState)
    const initialLayout = await cardLayoutSnapshot(hostPage)
    expect(initialLayout[0]?.templateId).not.toBe(initialLayout[1]?.templateId)
    await expect
      .poll(async () => await cardLayoutSnapshot(guestPage))
      .toEqual(initialLayout)
    await expectValidCardGeometry(
      hostPage.getByLabel('Shared game board').locator('article[data-card-id]'),
    )
    await expectStableSymbolHover(firstSymbolControl(hostPage))
    await expectComputedCursor(firstSymbolControl(hostPage), 'pointer')

    const initialViewport = hostPage.viewportSize()
    await hostPage.setViewportSize({ width: 390, height: 844 })
    const toggledSymbol = firstSymbolControl(hostPage)
    const toggledSymbolId = await toggledSymbol.getAttribute('data-symbol-id')
    const selectionStylesBefore = await cardSelectionStyleSnapshot(hostPage)
    const leaderboard = hostPage.getByRole('list', {
      name: 'Live leaderboard, highest score first',
    })
    const leaderboardViewport = hostPage.getByRole('region', {
      name: 'Scrollable leaderboard',
    })
    expect(await leaderboardOrder(hostPage)).toEqual([
      playerNames.host,
      playerNames.guest,
      playerNames.third,
    ])
    await expectHorizontalLeaderboard(hostPage, true)
    const paintCoverageBefore = await cardGlyphPaintCoverage(
      hostPage.getByLabel('Card 1'),
    )
    await toggledSymbol.click()
    await expect(toggledSymbol).toHaveAttribute('aria-pressed', 'true')
    const selectionStylesAfter = await cardSelectionStyleSnapshot(hostPage)
    const selectedCardStyles = selectionStylesAfter[0]
    const selectedStyleBefore = selectionStylesBefore[0]?.find(
      ({ id }) => id === toggledSymbolId,
    )
    const selectedStyleAfter = selectedCardStyles?.find(
      ({ id }) => id === toggledSymbolId,
    )

    expect(selectedStyleAfter?.filter).toBe('none')
    expect(selectedStyleAfter?.borderWidth).toBe('2px')
    expect(selectedStyleAfter?.borderColor).not.toBe(
      selectedStyleBefore?.borderColor,
    )
    expect(selectedStyleAfter?.backgroundColor).not.toBe(
      selectedStyleBefore?.backgroundColor,
    )
    expect(selectedStyleAfter?.boxShadow).not.toBe(
      selectedStyleBefore?.boxShadow,
    )
    expect(
      selectedCardStyles
        ?.filter(({ id }) => id !== toggledSymbolId)
        .every(({ filter }) => filter === 'none'),
    ).toBe(true)
    expect(selectionStylesAfter[1]).toEqual(selectionStylesBefore[1])
    await expectUnclippedSiblingGlyphs(
      hostPage.getByLabel('Card 1'),
      paintCoverageBefore,
      toggledSymbolId,
    )
    await expectValidCardGeometry(
      hostPage.getByLabel('Shared game board').locator('article[data-card-id]'),
    )
    await toggledSymbol.click()
    if (browserName !== 'webkit') {
      await expect(toggledSymbol).toBeFocused()
    }
    await expect(toggledSymbol).toHaveAttribute('aria-pressed', 'false')
    expect(await cardSelectionStyleSnapshot(hostPage)).toEqual(
      selectionStylesBefore,
    )
    expect(await playingSnapshot(hostPage)).toEqual(initialState)

    const leaderboardScrollLeft = await leaderboardViewport.evaluate(
      (element) => {
        element.scrollLeft = element.scrollWidth
        element.dispatchEvent(new Event('scroll'))
        return element.scrollLeft
      },
    )
    expect(leaderboardScrollLeft).toBeGreaterThan(0)
    await expect
      .poll(
        async () =>
          await leaderboardViewport.evaluate((element) => element.scrollLeft),
      )
      .toBe(leaderboardScrollLeft)
    const boardTopBeforeReorder = await boardTop(hostPage)

    await expectNoScoreReveal(guestPage)
    await selectSharedMatch(guestPage, (await playingSnapshot(guestPage)).cards)
    const guestScoreEntry = leaderboard
      .getByRole('listitem')
      .filter({ hasText: playerNames.guest })
    await Promise.all([
      expectScore(hostPage, playerNames.guest, 1),
      expect(guestScoreEntry).toHaveAttribute('data-score-rank', '1'),
    ])
    expect(await leaderboardOrder(hostPage)).toEqual([
      playerNames.guest,
      playerNames.host,
      playerNames.third,
    ])
    await expect
      .poll(
        async () =>
          await leaderboardViewport.evaluate((element) => element.scrollLeft),
      )
      .toBe(leaderboardScrollLeft)
    expect(await boardTop(hostPage)).toBeCloseTo(boardTopBeforeReorder, 0)
    await waitForRoundToSettle(guestPage)
    await expectNoScoreReveal(hostPage)
    await expectNoScoreReveal(guestPage)

    if (initialViewport) {
      await hostPage.setViewportSize(initialViewport)
      await expectHorizontalLeaderboard(hostPage, false)
    }

    for (const page of [hostPage, guestPage, thirdPage]) {
      await expect(page.getByRole('navigation')).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Leave room' }),
      ).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Room menu' })).toHaveCount(
        0,
      )
    }
    await expect(leaderboard.getByRole('listitem')).toHaveCount(3)
    await expect
      .poll(async () => await leaderboardOrder(hostPage))
      .toEqual([playerNames.guest, playerNames.host, playerNames.third])

    await outsiderPage.goto(`/${roomCode}`)
    await expect(
      outsiderPage.getByRole('heading', { name: 'Join your friends.' }),
    ).toBeVisible()
    await expect(outsiderPage.getByLabel('Room code')).toHaveValue(roomCode)

    await lateJoinerPage.goto('/join')
    await expect(
      lateJoinerPage.getByRole('button', { name: 'Join', exact: true }),
    ).toBeEnabled()
    await lateJoinerPage.getByLabel('Room code').fill(roomCode)
    await lateJoinerPage.getByLabel('Name').fill(playerNames.replacement)
    await lateJoinerPage
      .getByRole('button', { name: 'Join', exact: true })
      .click()
    await expect(lateJoinerPage).toHaveURL(new RegExp(`/${roomCode}$`, 'i'))
    await expectPlaying(lateJoinerPage, playerNames.replacement)
    await expectScore(lateJoinerPage, playerNames.guest, 1)
    await expectScore(hostPage, playerNames.replacement, 0)
    await expect
      .poll(async () => await playingSnapshot(lateJoinerPage))
      .toEqual(await playingSnapshot(hostPage))

    const beforeIncorrectClaim = await playingSnapshot(hostPage)
    const incorrectSelection = await submitIncorrectClaim(
      hostPage,
      beforeIncorrectClaim.cards,
    )
    await expect(hostPage.getByLabel('Match claim feedback')).toContainText(
      'Incorrect match. Try again in a moment.',
    )
    const firstIncorrectSymbol = hostPage
      .getByLabel('Card 1')
      .locator(`button[data-symbol-id="${incorrectSelection.firstSymbolId}"]`)
    const secondIncorrectSymbol = hostPage
      .getByLabel('Card 2')
      .locator(`button[data-symbol-id="${incorrectSelection.secondSymbolId}"]`)
    await expect(firstIncorrectSymbol).toHaveAttribute('data-incorrect', 'true')
    await expect(secondIncorrectSymbol).toHaveAttribute(
      'data-incorrect',
      'true',
    )
    await expectComputedCursor(firstIncorrectSymbol, 'default')
    await expectComputedCursor(secondIncorrectSymbol, 'default')
    await expect(
      firstIncorrectSymbol.locator('.spot-it-incorrect-mark'),
    ).toBeVisible()
    await expect(
      secondIncorrectSymbol.locator('.spot-it-incorrect-mark'),
    ).toBeVisible()
    expect(await playingSnapshot(hostPage)).toEqual(beforeIncorrectClaim)
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(beforeIncorrectClaim)
    await expect(firstSymbolControl(hostPage)).toBeDisabled()
    await expect(firstSymbolControl(guestPage)).toBeEnabled()
    await expect(firstSymbolControl(hostPage)).toBeEnabled({ timeout: 2_000 })
    await expect(firstIncorrectSymbol).toHaveAttribute('aria-pressed', 'false')
    await expect(secondIncorrectSymbol).toHaveAttribute('aria-pressed', 'false')
    await expect(firstIncorrectSymbol).toHaveAttribute(
      'data-incorrect',
      'false',
    )
    await expect(secondIncorrectSymbol).toHaveAttribute(
      'data-incorrect',
      'false',
    )
    await expect(
      firstIncorrectSymbol.locator('.spot-it-incorrect-mark'),
    ).toHaveCount(0)
    await expect(
      secondIncorrectSymbol.locator('.spot-it-incorrect-mark'),
    ).toHaveCount(0)

    await beginDisabledCursorObservation(hostPage)
    const firstAcceptedSymbolId = findSharedSymbol(beforeIncorrectClaim.cards)
    await selectSharedMatch(hostPage, beforeIncorrectClaim.cards)
    await expectScore(hostPage, playerNames.host, 1)
    await expectScore(guestPage, playerNames.host, 1)
    expect(await endDisabledCursorObservation(hostPage)).toEqual(['default'])
    await expect(
      hostPage.getByRole('article', { name: 'Card 1' }),
    ).toHaveAttribute('data-card-id', beforeIncorrectClaim.cards[0]?.id ?? '')

    const hostReveal = scoreRevealLocator(hostPage, firstAcceptedSymbolId)
    const guestReveal = scoreRevealLocator(guestPage, firstAcceptedSymbolId)

    await Promise.all([
      expect(hostReveal).toHaveCount(2),
      expect(guestReveal).toHaveCount(2),
    ])
    await expect(hostReveal.first()).toHaveText(playerNames.host)
    await expect(guestReveal.first()).toHaveText(playerNames.host)
    await expect(hostPage.getByLabel('Score reveal')).toContainText(`matched`)
    await expect(guestPage.getByLabel('Score reveal')).toContainText(
      `${playerNames.host} matched`,
    )
    await expectNoScoreReveal(hostPage)
    await expectNoScoreReveal(guestPage)
    const afterAcceptedClaim = await playingSnapshot(hostPage)
    expect(afterAcceptedClaim.cards).not.toEqual(beforeIncorrectClaim.cards)
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(afterAcceptedClaim)

    const beforeCompetingClaims = afterAcceptedClaim
    const competingSymbolId = findSharedSymbol(beforeCompetingClaims.cards)
    await selectCardSymbol(hostPage, 1, competingSymbolId)
    await selectCardSymbol(guestPage, 1, competingSymbolId)
    await Promise.all([
      expect(cardSymbolControl(hostPage, 2, competingSymbolId)).toBeEnabled(),
      expect(cardSymbolControl(guestPage, 2, competingSymbolId)).toBeEnabled(),
    ])
    // Dispatch the final selections without Playwright's actionability retry:
    // the winning snapshot may disable the losing browser before its click is
    // observed. Socket integration tests separately guarantee that two commands
    // sent for one revision are serialized and award exactly one point.
    await Promise.all([
      dispatchCardSymbolClick(hostPage, 2, competingSymbolId),
      dispatchCardSymbolClick(guestPage, 2, competingSymbolId),
    ])

    await expect
      .poll(async () => totalScore(await playingSnapshot(hostPage)))
      .toBe(totalScore(beforeCompetingClaims) + 1)
    await expectNoScoreReveal(hostPage)
    await expectNoScoreReveal(guestPage)
    const afterCompetingClaims = await playingSnapshot(hostPage)
    expect(afterCompetingClaims.cards).not.toEqual(beforeCompetingClaims.cards)
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(afterCompetingClaims)

    const guestStorage = await guestContext.storageState()
    await guestContext.close()
    guestContext = await browser.newContext({
      baseURL,
      storageState: guestStorage,
    })
    guestPage = await guestContext.newPage()
    await guestPage.goto(`/${roomCode}`)

    await expectPlaying(guestPage, playerNames.guest)
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(afterCompetingClaims)

    let hostScore = afterCompetingClaims.scores[playerNames.host] ?? 0

    while (hostScore < 11) {
      await submitSharedMatch(hostPage)
      hostScore += 1
      await expectScore(hostPage, playerNames.host, hostScore)
      await expectScore(guestPage, playerNames.host, hostScore)
      await expectSamePlayingState(hostPage, guestPage)
    }

    const guestFinalScore = await scoreFor(guestPage, playerNames.guest, false)
    const thirdFinalScore = await scoreFor(guestPage, playerNames.third, false)
    await submitSharedMatch(hostPage)

    await expectFinished(hostPage, playerNames.host)
    await expectFinished(guestPage, playerNames.guest)
    await expect(hostPage.getByText('You won!')).toBeVisible()
    await expect(guestPage.getByText(`${playerNames.host} wins!`)).toBeVisible()
    await expectFinalScore(hostPage, playerNames.host, 12)
    await expectFinalScore(guestPage, playerNames.host, 12)
    await expectFinalScore(hostPage, playerNames.guest, guestFinalScore)
    await expectFinalScore(guestPage, playerNames.guest, guestFinalScore)

    const expectedFinalOrder = [
      { name: playerNames.host, score: 12, position: 0 },
      { name: playerNames.guest, score: guestFinalScore, position: 1 },
      { name: playerNames.third, score: thirdFinalScore, position: 2 },
      { name: playerNames.replacement, score: 0, position: 3 },
    ]
    await expectFinalScoreboardOrder(hostPage, expectedFinalOrder)
    await expectFinalScoreboardOrder(guestPage, expectedFinalOrder)

    await hostPage.setViewportSize({ width: 390, height: 844 })
    await expect(
      hostPage.getByRole('button', { name: 'Play again' }),
    ).toBeVisible()
    await expect(hostPage.getByRole('link', { name: 'Go home' })).toBeVisible()
    await expectNoHorizontalOverflow(hostPage)

    await hostPage.getByRole('button', { name: 'Play again' }).click()
    await guestPage.reload()

    await expectLobby(hostPage, roomCode)
    await expectLobby(guestPage, roomCode)
    await expect(
      guestPage.getByText(playerNames.guest, { exact: true }),
    ).toBeVisible()
    await expect(
      guestPage.getByRole('listitem').filter({ hasText: playerNames.guest }),
    ).toContainText('You')
    await expect(hostPage).toHaveURL(new RegExp(`/${roomCode}$`, 'i'))
    await expect(guestPage).toHaveURL(new RegExp(`/${roomCode}$`, 'i'))

    await guestPage.getByRole('button', { name: 'Leave room' }).click()
    await expect(guestPage).toHaveURL(/\/home$/)
    await expect(
      hostPage.getByRole('listitem').filter({ hasText: playerNames.guest }),
    ).toHaveCount(0)

    await lateJoinerPage.goto(`/${roomCode}`)
    await expectLobby(lateJoinerPage, roomCode)
    await expect(
      hostPage
        .getByRole('listitem')
        .filter({ hasText: playerNames.replacement }),
    ).toBeVisible()

    await hostPage.getByRole('button', { name: 'Start game' }).click()
    await expectPlaying(hostPage, playerNames.host)
    await expectPlaying(lateJoinerPage, playerNames.replacement)
    await expect(
      hostPage.getByText(`Room ${roomCode}, round 1`, { exact: true }),
    ).toBeAttached()

    const secondGameInitialState = await playingSnapshot(hostPage)
    expect(secondGameInitialState.scores).toEqual({
      Ada: 0,
      'Margaret Hamilton': 0,
      Linus: 0,
    })
    await expect
      .poll(async () => await playingSnapshot(lateJoinerPage))
      .toEqual(secondGameInitialState)
    await expect(
      hostPage.getByText(playerNames.guest, { exact: true }),
    ).toHaveCount(0)
    await expect(
      hostPage.locator('button[data-symbol-id][aria-pressed="true"]'),
    ).toHaveCount(0)
    await expectNoHorizontalOverflow(hostPage)

    await expect(hostPage.getByRole('navigation')).toHaveCount(0)
    await hostPage.reload()
    await expectPlaying(hostPage, playerNames.host)
    await expect
      .poll(async () => await playingSnapshot(hostPage))
      .toEqual(secondGameInitialState)

    await submitIncorrectClaim(hostPage, secondGameInitialState.cards)
    await expect(hostPage.getByLabel('Match claim feedback')).toContainText(
      'Incorrect match. Try again in a moment.',
    )
    const staticErrorMark = hostPage
      .locator('button[data-incorrect="true"] .spot-it-incorrect-mark')
      .first()
    await expect(staticErrorMark).toBeVisible()
    expect(await playingSnapshot(hostPage)).toEqual(secondGameInitialState)
    await expect(firstSymbolControl(hostPage)).toBeEnabled({ timeout: 2_000 })

    await submitSharedMatch(hostPage)
    await expectScore(hostPage, playerNames.host, 1)
    await expectScore(lateJoinerPage, playerNames.host, 1)
    const secondGameAfterScore = await playingSnapshot(hostPage)
    expect(secondGameAfterScore.cards).not.toEqual(secondGameInitialState.cards)
    await expect
      .poll(async () => await playingSnapshot(lateJoinerPage))
      .toEqual(secondGameAfterScore)

    await expect(lateJoinerPage.getByRole('navigation')).toHaveCount(0)
    await expect(
      lateJoinerPage.getByRole('button', { name: 'Leave room' }),
    ).toHaveCount(0)
    await expectPlaying(hostPage, playerNames.host)
    expect(await playingSnapshot(hostPage)).toEqual(secondGameAfterScore)
    await expect(
      hostPage.getByText(playerNames.replacement, { exact: true }),
    ).toBeVisible()

    await submitSharedMatch(lateJoinerPage)
    await expectScore(lateJoinerPage, playerNames.replacement, 1)
    await expectScore(hostPage, playerNames.replacement, 1)

    await submitSharedMatch(hostPage)
    await expectScore(hostPage, playerNames.host, 2)
    await expectNoHorizontalOverflow(hostPage)

    await lateJoinerPage.goto(`/${roomCode}`)
    await expectPlaying(lateJoinerPage, playerNames.replacement)
    await expect
      .poll(async () => await playingSnapshot(lateJoinerPage))
      .toEqual(await playingSnapshot(hostPage))

    await outsiderPage.reload()
    await expect(
      outsiderPage.getByRole('heading', { name: 'Join your friends.' }),
    ).toBeVisible()
  } finally {
    await Promise.all([
      lateJoinerContext.close(),
      outsiderContext.close(),
      thirdContext.close(),
      guestContext.close(),
      hostContext.close(),
      removedContext.close(),
    ])
  }
})

async function createRoom(page: Page, name: string) {
  await page.goto('/create')
  await expect(
    page.getByRole('button', { name: 'Create', exact: true }),
  ).toBeEnabled()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/[bcdfghkpqrstvz]{4}[2-9y]$/)

  const roomCode = new URL(page.url()).pathname.slice(1)
  expect(roomCode).toMatch(roomCodePattern)
  await expect(
    page.getByRole('heading', { name: 'Ready to play.' }),
  ).toBeVisible()
  return roomCode
}

async function joinRoom(page: Page, roomCode: string, name: string) {
  await page.goto(`/${roomCode}`)
  await expect(
    page.getByRole('button', { name: 'Join', exact: true }),
  ).toBeEnabled()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/${roomCode}$`, 'i'))
  await expect(
    page.getByRole('heading', { name: 'Ready to play.' }),
  ).toBeVisible()
}

async function expectPlaying(page: Page, playerName: string) {
  await expect(
    page.getByRole('main', { name: `Game for ${playerName}` }),
  ).toBeVisible()
  await expect(page.getByLabel('Shared game board')).toBeVisible()
}

async function expectFinished(page: Page, playerName: string) {
  await expect(
    page.getByRole('main', { name: `Final results for ${playerName}` }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Game finished.' }),
  ).toBeVisible()
}

async function expectLobby(page: Page, roomCode: string) {
  await expect(page).toHaveURL(new RegExp(`/${roomCode}$`, 'i'))
  await expect(
    page.getByRole('heading', { name: 'Ready to play.' }),
  ).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
}

async function leaderboardOrder(page: Page) {
  return page
    .getByRole('list', { name: 'Live leaderboard, highest score first' })
    .getByRole('listitem')
    .evaluateAll((entries) =>
      entries.map(
        (entry) =>
          entry
            .querySelector<HTMLElement>('[data-scoreboard-name]')
            ?.textContent?.trim() ?? '',
      ),
    )
}

async function boardTop(page: Page) {
  return page
    .getByLabel('Shared game board')
    .evaluate((board) => board.getBoundingClientRect().top)
}

async function expectHorizontalLeaderboard(
  page: Page,
  shouldOverflow: boolean,
) {
  const measurements = await page.evaluate(() => {
    const scoreboard = document.querySelector<HTMLElement>('.game-scoreboard')
    const viewport = document.querySelector<HTMLElement>('.game-score-viewport')
    const list = document.querySelector<HTMLOListElement>('.game-score-list')
    const board = document.querySelector<HTMLElement>('.game-board')

    if (!scoreboard || !viewport || !list || !board) {
      throw new Error('Missing active-game leaderboard layout.')
    }

    const scoreboardBounds = scoreboard.getBoundingClientRect()
    const boardBounds = board.getBoundingClientRect()
    const listStyles = getComputedStyle(list)
    const viewportStyles = getComputedStyle(viewport)

    return {
      boardTop: boardBounds.top,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      listDisplay: listStyles.display,
      listFlexWrap: listStyles.flexWrap,
      scoreboardBottom: scoreboardBounds.bottom,
      scoreboardLeft: scoreboardBounds.left,
      scoreboardRight: scoreboardBounds.right,
      viewportClientWidth: viewport.clientWidth,
      viewportOverflowX: viewportStyles.overflowX,
      viewportScrollWidth: viewport.scrollWidth,
    }
  })

  expect(measurements.listDisplay).toBe('flex')
  expect(measurements.listFlexWrap).toBe('nowrap')
  expect(measurements.viewportOverflowX).toBe('auto')
  expect(measurements.scoreboardBottom).toBeLessThanOrEqual(
    measurements.boardTop + 1,
  )
  expect(measurements.scoreboardLeft).toBeGreaterThanOrEqual(-1)
  expect(measurements.scoreboardRight).toBeLessThanOrEqual(
    measurements.documentClientWidth + 1,
  )
  expect(measurements.documentScrollWidth).toBeLessThanOrEqual(
    measurements.documentClientWidth + 1,
  )
  if (shouldOverflow) {
    expect(measurements.viewportScrollWidth).toBeGreaterThan(
      measurements.viewportClientWidth,
    )
  } else {
    expect(measurements.viewportScrollWidth).toBeLessThanOrEqual(
      measurements.viewportClientWidth + 1,
    )
  }
}

async function playingSnapshot(page: Page): Promise<PlayingSnapshot> {
  const cards = await page
    .getByLabel('Shared game board')
    .locator('article[data-card-id]')
    .evaluateAll((cardElements) =>
      cardElements.map((card) => ({
        id: card.getAttribute('data-card-id') ?? '',
        symbolIds: Array.from(
          card.querySelectorAll<HTMLButtonElement>('button[data-symbol-id]'),
          (symbol) => symbol.dataset.symbolId ?? '',
        ),
      })),
    )
  const scores = Object.fromEntries(
    await page
      .getByRole('heading', { name: 'Scoreboard' })
      .locator('xpath=ancestor::aside[1]')
      .locator('li')
      .evaluateAll((entries) =>
        entries.map((entry) => {
          const name =
            entry
              .querySelector<HTMLElement>('[data-scoreboard-name]')
              ?.textContent?.trim() ?? ''
          const score = Number(
            entry.querySelector('output')?.textContent ?? NaN,
          )
          return [name, score] as const
        }),
      ),
  )

  return { cards, scores }
}

async function cardLayoutSnapshot(page: Page) {
  return page
    .getByLabel('Shared game board')
    .locator('article[data-card-id]')
    .evaluateAll((cardElements) =>
      cardElements.map((card) => ({
        templateId: card.getAttribute('data-layout-template'),
        rotation: card.getAttribute('data-template-rotation'),
        rotationProfile: card.getAttribute('data-rotation-profile'),
        symbols: Array.from(
          card.querySelectorAll<HTMLButtonElement>('button[data-symbol-id]'),
          (symbol) => ({
            id: symbol.dataset.symbolId,
            slot: symbol.dataset.layoutSlot,
            size: symbol.dataset.symbolSize,
            rotation: symbol.dataset.symbolRotation,
            x: symbol.dataset.symbolX,
            y: symbol.dataset.symbolY,
          }),
        ),
      })),
    )
}

async function cardSelectionStyleSnapshot(page: Page) {
  return page
    .getByLabel('Shared game board')
    .locator('article[data-card-id]')
    .evaluateAll((cardElements) =>
      cardElements.map((card) =>
        Array.from(
          card.querySelectorAll<HTMLButtonElement>('button[data-symbol-id]'),
          (symbol) => {
            const glyph = symbol.querySelector<HTMLElement>(
              '[data-symbol-glyph]',
            )

            if (!glyph) {
              throw new Error('Missing a symbol glyph wrapper.')
            }

            const filter = symbol.querySelector<HTMLElement>(
              '[data-symbol-filter]',
            )

            if (!filter) {
              throw new Error('Missing a symbol filter wrapper.')
            }

            const glyphStyles = getComputedStyle(glyph)
            const symbolStyles = getComputedStyle(symbol)

            return {
              id: symbol.dataset.symbolId ?? '',
              filter: getComputedStyle(filter).filter,
              transform: glyphStyles.transform,
              borderWidth: symbolStyles.borderWidth,
              borderColor: symbolStyles.borderColor,
              backgroundColor: symbolStyles.backgroundColor,
              boxShadow: symbolStyles.boxShadow,
            }
          },
        ),
      ),
    )
}

async function cardGlyphPaintCoverage(card: Locator) {
  const symbols = await card.locator('button[data-symbol-id]').all()
  const coverage = await Promise.all(
    symbols.map(async (symbol) => {
      const symbolId = await symbol.getAttribute('data-symbol-id')

      if (!symbolId) {
        throw new Error('Missing a symbol ID for paint coverage.')
      }

      const screenshot = await symbol
        .locator('[data-symbol-glyph]')
        .screenshot({ animations: 'disabled' })

      return [symbolId, countPaintedPixels(screenshot)] as const
    }),
  )

  return new Map(coverage)
}

async function expectUnclippedSiblingGlyphs(
  card: Locator,
  coverageBefore: Map<string, number>,
  selectedSymbolId: string | null,
) {
  const coverageAfter = await cardGlyphPaintCoverage(card)

  for (const [symbolId, before] of coverageBefore) {
    if (symbolId === selectedSymbolId) {
      continue
    }

    const after = coverageAfter.get(symbolId)

    expect(after, `${symbolId} should retain its painted area`).toBeDefined()
    expect(
      (after ?? 0) / before,
      `${symbolId} is visually clipped`,
    ).toBeGreaterThan(0.7)
  }
}

function countPaintedPixels(buffer: Buffer): number {
  const image = PNG.sync.read(buffer)
  const cornerOffsets = [
    0,
    (image.width - 1) * 4,
    image.width * (image.height - 1) * 4,
    (image.width * image.height - 1) * 4,
  ]
  const background = [0, 1, 2].map((channel) =>
    Math.round(
      cornerOffsets.reduce(
        (total, offset) => total + (image.data[offset + channel] ?? 0),
        0,
      ) / cornerOffsets.length,
    ),
  )
  let paintedPixels = 0

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const distance = [0, 1, 2].reduce(
      (total, channel) =>
        total +
        Math.abs(
          (image.data[offset + channel] ?? 0) - (background[channel] ?? 0),
        ),
      0,
    )

    if (distance > 30) {
      paintedPixels += 1
    }
  }

  return paintedPixels
}

async function submitIncorrectClaim(page: Page, cards: CardSnapshot[]) {
  const [firstCard, secondCard] = requireTwoCards(cards)
  const sharedSymbolId = findSharedSymbol(cards)
  const firstSymbolId = firstCard.symbolIds.find(
    (symbolId) => symbolId !== sharedSymbolId,
  )
  const secondSymbolId = secondCard.symbolIds.find(
    (symbolId) => symbolId !== sharedSymbolId && symbolId !== firstSymbolId,
  )

  if (!firstSymbolId || !secondSymbolId) {
    throw new Error('Unable to find a deterministic incorrect selection.')
  }

  await selectMatch(page, firstSymbolId, secondSymbolId)

  return { firstSymbolId, secondSymbolId }
}

async function submitSharedMatch(page: Page) {
  await expectNoScoreReveal(page)
  await selectSharedMatch(page, (await playingSnapshot(page)).cards)
  await waitForRoundToSettle(page)
}

function scoreRevealLocator(page: Page, symbolId: string) {
  return page.locator(
    `button[data-symbol-id="${symbolId}"] [data-score-reveal]`,
  )
}

async function expectNoScoreReveal(page: Page) {
  await expect(page.locator('[data-score-reveal]')).toHaveCount(0, {
    timeout: 5_000,
  })
}

/** Waits out the score reveal or the finished screen after a scored claim. */
async function waitForRoundToSettle(page: Page) {
  const reveal = page.locator('[data-score-reveal]')
  const finished = page.getByRole('heading', { name: 'Game finished.' })

  await expect
    .poll(
      async () => (await reveal.count()) > 0 || (await finished.count()) > 0,
    )
    .toBe(true)

  if ((await reveal.count()) > 0) {
    await expect(reveal).toHaveCount(0, { timeout: 5_000 })
  }
}

async function selectSharedMatch(page: Page, cards: CardSnapshot[]) {
  const sharedSymbolId = findSharedSymbol(cards)
  await selectMatch(page, sharedSymbolId, sharedSymbolId)
}

async function selectMatch(
  page: Page,
  firstSymbolId: string,
  secondSymbolId: string,
) {
  await selectCardSymbol(page, 1, firstSymbolId)
  await selectCardSymbol(page, 2, secondSymbolId)
}

async function selectCardSymbol(
  page: Page,
  cardNumber: 1 | 2,
  symbolId: string,
) {
  await cardSymbolControl(page, cardNumber, symbolId).click()
}

async function dispatchCardSymbolClick(
  page: Page,
  cardNumber: 1 | 2,
  symbolId: string,
) {
  await cardSymbolControl(page, cardNumber, symbolId).dispatchEvent('click')
}

function cardSymbolControl(page: Page, cardNumber: 1 | 2, symbolId: string) {
  return page
    .getByLabel(`Card ${cardNumber}`)
    .locator(`button[data-symbol-id="${symbolId}"]`)
}

function firstSymbolControl(page: Page) {
  return page.getByLabel('Card 1').locator('button[data-symbol-id]').first()
}

async function expectComputedCursor(locator: Locator, expected: string) {
  await expect
    .poll(async () =>
      locator.evaluate((element) => getComputedStyle(element).cursor),
    )
    .toBe(expected)
}

type CursorObservationWindow = Window & {
  __disabledCursorObservation?: {
    cursors: string[]
    observer: MutationObserver
  }
}

async function beginDisabledCursorObservation(page: Page) {
  await page.evaluate(() => {
    const board = document.querySelector('[aria-label="Shared game board"]')

    if (!board) {
      throw new Error('Missing the shared game board.')
    }

    const cursors: string[] = []
    const collectDisabledCursors = () => {
      for (const button of board.querySelectorAll<HTMLButtonElement>(
        'button[data-symbol-id]:disabled',
      )) {
        cursors.push(getComputedStyle(button).cursor)
      }
    }
    const observer = new MutationObserver(collectDisabledCursors)

    observer.observe(board, {
      attributeFilter: ['disabled'],
      attributes: true,
      subtree: true,
    })
    ;(window as CursorObservationWindow).__disabledCursorObservation = {
      cursors,
      observer,
    }
  })
}

async function endDisabledCursorObservation(page: Page) {
  const observedCursors = await page.evaluate(() => {
    const testWindow = window as CursorObservationWindow
    const observation = testWindow.__disabledCursorObservation

    if (!observation) {
      throw new Error('Missing the disabled cursor observation.')
    }

    observation.observer.disconnect()
    delete testWindow.__disabledCursorObservation

    return observation.cursors
  })

  expect(observedCursors.length).toBeGreaterThan(0)
  return [...new Set(observedCursors)]
}

function findSharedSymbol(cards: CardSnapshot[]) {
  const [firstCard, secondCard] = requireTwoCards(cards)
  const sharedSymbolIds = firstCard.symbolIds.filter((symbolId) =>
    secondCard.symbolIds.includes(symbolId),
  )

  expect(sharedSymbolIds).toHaveLength(1)
  return sharedSymbolIds[0] as string
}

function requireTwoCards(cards: CardSnapshot[]) {
  expect(cards).toHaveLength(2)
  return cards as [CardSnapshot, CardSnapshot]
}

function totalScore(snapshot: PlayingSnapshot) {
  return Object.values(snapshot.scores).reduce(
    (total, score) => total + score,
    0,
  )
}

async function expectSamePlayingState(firstPage: Page, secondPage: Page) {
  const state = await playingSnapshot(firstPage)
  await expect
    .poll(async () => await playingSnapshot(secondPage))
    .toEqual(state)
}

async function scoreFor(page: Page, name: string, final: boolean) {
  const score = await page
    .getByLabel(`${name}'s ${final ? 'final ' : ''}score`)
    .textContent()
  return Number(score)
}

async function expectScore(page: Page, name: string, score: number) {
  await expect(page.getByLabel(`${name}'s score`)).toHaveText(String(score))
}

async function expectFinalScore(page: Page, name: string, score: number) {
  await expect(page.getByLabel(`${name}'s final score`)).toHaveText(
    String(score),
  )
}

async function expectFinalScoreboardOrder(
  page: Page,
  expected: ReadonlyArray<{ name: string; score: number; position: number }>,
) {
  await expect
    .poll(async () =>
      page
        .getByRole('main', { name: /^Final results for / })
        .getByRole('listitem')
        .evaluateAll((entries) =>
          entries.map((entry) => ({
            name: entry.querySelector('span span')?.textContent ?? '',
            score: Number(entry.querySelector('output')?.textContent),
            position: Number(entry.dataset.playerPosition),
          })),
        ),
    )
    .toEqual(expected)
}
