import { expect, test, type Page } from '@playwright/test'

const roomCodePattern = /^[bcdfghkpqrstvz]{4}[2-9y]$/
const playerNames = {
  host: 'Ada',
  guest: 'Grace',
  replacement: 'Linus',
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
  baseURL,
}) => {
  test.setTimeout(180_000)

  const hostContext = await browser.newContext({ baseURL })
  let guestContext = await browser.newContext({ baseURL })
  const outsiderContext = await browser.newContext({ baseURL })
  const lateJoinerContext = await browser.newContext({ baseURL })
  const hostPage = await hostContext.newPage()
  let guestPage = await guestContext.newPage()
  const outsiderPage = await outsiderContext.newPage()
  const lateJoinerPage = await lateJoinerContext.newPage()

  try {
    const roomCode = await createRoom(hostPage, playerNames.host)
    await joinRoom(guestPage, roomCode, playerNames.guest)

    await expect(hostPage.getByText(playerNames.guest)).toBeVisible()
    await hostPage.getByRole('button', { name: 'Start game' }).click()

    await expectPlaying(hostPage, playerNames.host)
    await expectPlaying(guestPage, playerNames.guest)

    const initialState = await playingSnapshot(hostPage)
    expect(initialState.scores).toEqual({ Ada: 0, Grace: 0 })
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(initialState)

    await outsiderPage.goto(`/${roomCode}`)
    await expect(
      outsiderPage.getByRole('heading', {
        name: 'This game has already started.',
      }),
    ).toBeVisible()

    await lateJoinerPage.goto('/join')
    await lateJoinerPage.getByLabel('Room code').fill(roomCode)
    await lateJoinerPage.getByLabel('Name').fill(playerNames.replacement)
    await lateJoinerPage
      .getByRole('button', { name: 'Join', exact: true })
      .click()
    await expect(lateJoinerPage.locator('form [role="alert"]')).toHaveText(
      'This game has already started.',
    )

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
    await expect(firstIncorrectSymbol).toHaveAttribute('data-shaking', 'true')
    await expect(secondIncorrectSymbol).toHaveAttribute('data-shaking', 'true')
    expect(await playingSnapshot(hostPage)).toEqual(beforeIncorrectClaim)
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(beforeIncorrectClaim)
    await expect(
      hostPage.getByRole('button', { name: 'Submit match' }),
    ).toBeDisabled()
    await expect(
      guestPage.getByRole('button', { name: 'Submit match' }),
    ).toBeEnabled()
    await expect(
      hostPage.getByRole('button', { name: 'Submit match' }),
    ).toBeEnabled({ timeout: 2_000 })
    await expect(firstIncorrectSymbol).toHaveAttribute('aria-pressed', 'false')
    await expect(secondIncorrectSymbol).toHaveAttribute('aria-pressed', 'false')
    await expect(firstIncorrectSymbol).toHaveAttribute('data-shaking', 'false')
    await expect(secondIncorrectSymbol).toHaveAttribute('data-shaking', 'false')

    await submitSharedMatch(hostPage)
    await expectScore(hostPage, playerNames.host, 1)
    await expectScore(guestPage, playerNames.host, 1)
    const afterAcceptedClaim = await playingSnapshot(hostPage)
    expect(afterAcceptedClaim.cards).not.toEqual(beforeIncorrectClaim.cards)
    await expect
      .poll(async () => await playingSnapshot(guestPage))
      .toEqual(afterAcceptedClaim)

    const beforeCompetingClaims = afterAcceptedClaim
    await selectSharedMatch(hostPage, beforeCompetingClaims.cards)
    await selectSharedMatch(guestPage, beforeCompetingClaims.cards)
    await Promise.all([
      hostPage.getByRole('button', { name: 'Submit match' }).click(),
      guestPage.getByRole('button', { name: 'Submit match' }).click(),
    ])

    await expect
      .poll(async () => totalScore(await playingSnapshot(hostPage)))
      .toBe(totalScore(beforeCompetingClaims) + 1)
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
    await submitSharedMatch(hostPage)

    await expectFinished(hostPage, playerNames.host)
    await expectFinished(guestPage, playerNames.guest)
    await expect(hostPage.getByText('You won!')).toBeVisible()
    await expect(guestPage.getByText(`${playerNames.host} wins!`)).toBeVisible()
    await expectFinalScore(hostPage, playerNames.host, 12)
    await expectFinalScore(guestPage, playerNames.host, 12)
    await expectFinalScore(hostPage, playerNames.guest, guestFinalScore)
    await expectFinalScore(guestPage, playerNames.guest, guestFinalScore)

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
    await expect(guestPage.getByText(playerNames.guest)).toBeVisible()
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

    await joinRoom(lateJoinerPage, roomCode, playerNames.replacement)
    await expect(
      hostPage
        .getByRole('listitem')
        .filter({ hasText: playerNames.replacement }),
    ).toBeVisible()

    await hostPage.getByRole('button', { name: 'Start game' }).click()
    await expectPlaying(hostPage, playerNames.host)
    await expectPlaying(lateJoinerPage, playerNames.replacement)
    await expect(
      hostPage.getByText(`Room ${roomCode} · Round 1`, { exact: true }),
    ).toBeVisible()

    const secondGameInitialState = await playingSnapshot(hostPage)
    expect(secondGameInitialState.scores).toEqual({ Ada: 0, Linus: 0 })
    await expect
      .poll(async () => await playingSnapshot(lateJoinerPage))
      .toEqual(secondGameInitialState)
    await expect(hostPage.getByText(playerNames.guest)).toHaveCount(0)
    await expect(
      hostPage.locator('button[data-symbol-id][aria-pressed="true"]'),
    ).toHaveCount(0)

    await submitIncorrectClaim(hostPage, secondGameInitialState.cards)
    await expect(hostPage.getByLabel('Match claim feedback')).toContainText(
      'Incorrect match. Try again in a moment.',
    )
    expect(await playingSnapshot(hostPage)).toEqual(secondGameInitialState)
    await expect(
      hostPage.getByRole('button', { name: 'Submit match' }),
    ).toBeEnabled({ timeout: 2_000 })

    await submitSharedMatch(hostPage)
    await expectScore(hostPage, playerNames.host, 1)
    await expectScore(lateJoinerPage, playerNames.host, 1)
    const secondGameAfterScore = await playingSnapshot(hostPage)
    expect(secondGameAfterScore.cards).not.toEqual(secondGameInitialState.cards)
    await expect
      .poll(async () => await playingSnapshot(lateJoinerPage))
      .toEqual(secondGameAfterScore)

    await outsiderPage.reload()
    await expect(
      outsiderPage.getByRole('heading', {
        name: 'This game has already started.',
      }),
    ).toBeVisible()
  } finally {
    await Promise.all([
      lateJoinerContext.close(),
      outsiderContext.close(),
      guestContext.close(),
      hostContext.close(),
    ])
  }
})

async function createRoom(page: Page, name: string) {
  await page.goto('/create')
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
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0)
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
            entry.querySelector('span span')?.textContent?.trim() ?? ''
          const score = Number(
            entry.querySelector('output')?.textContent ?? NaN,
          )
          return [name, score] as const
        }),
      ),
  )

  return { cards, scores }
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
  await page.getByRole('button', { name: 'Submit match' }).click()

  return { firstSymbolId, secondSymbolId }
}

async function submitSharedMatch(page: Page) {
  await selectSharedMatch(page, (await playingSnapshot(page)).cards)
  await page.getByRole('button', { name: 'Submit match' }).click()
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
  await page
    .getByLabel('Card 1')
    .locator(`button[data-symbol-id="${firstSymbolId}"]`)
    .click()
  await page
    .getByLabel('Card 2')
    .locator(`button[data-symbol-id="${secondSymbolId}"]`)
    .click()
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
