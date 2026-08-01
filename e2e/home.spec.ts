import { expect, test } from '@playwright/test'

const roomCodePattern = /^[bcdfghkpqrstvz]{4}[2-9y]$/

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

    await guestPage.reload()
    await expect(
      guestPage.getByRole('main', { name: 'Game for Grace' }),
    ).toHaveAttribute('data-player-position', '1')

    await lateJoinerPage.goto('/join')
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
