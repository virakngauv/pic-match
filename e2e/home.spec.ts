import { expect, test } from '@playwright/test'

test('creates a room and joins it as a second anonymous player', async ({
  browser,
  page,
}) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/home$/)
  await expect(
    page.getByRole('heading', { name: 'Ready to spot the match?' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Create a room' }).click()
  await expect(page).toHaveURL(/\/create$/)
  await page.getByLabel('Name').fill('Ada')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page).toHaveURL(/\/[bcdfghkpqrstvz]{4}[2-9y]$/)
  await expect(page.getByRole('heading', { name: 'You’re in.' })).toBeVisible()
  const roomCode = (await page.locator('output').textContent())?.trim()

  expect(roomCode).toBeTruthy()
  await expect(page.getByText('Ada')).toBeVisible()
  await expect(page.getByText('You · Host')).toBeVisible()

  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()

  try {
    await guestPage.goto('/join')
    await guestPage.getByLabel('Room code').fill('bbbb2')
    await guestPage.getByLabel('Name').fill('Grace')
    await guestPage.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestPage.locator('form [role="alert"]')).toHaveText(
      'We couldn’t find that room. Check the code and try again.',
    )

    await guestPage.goto(`/${roomCode}`)
    await expect(
      guestPage.getByRole('heading', { name: 'Join this room.' }),
    ).toBeVisible()
    await guestPage.getByRole('link', { name: 'Continue to join' }).click()
    await expect(guestPage.getByLabel('Room code')).toHaveValue(roomCode!)

    await guestPage.getByLabel('Name').fill('Grace')
    await guestPage.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(guestPage).toHaveURL(new RegExp(`/${roomCode}$`, 'i'))
    await expect(
      guestPage.getByRole('heading', { name: 'You’re in.' }),
    ).toBeVisible()
    await expect(guestPage.getByText('Ada')).toBeVisible()
    await expect(guestPage.getByText('Grace')).toBeVisible()
    await expect(guestPage.getByText('You', { exact: true })).toBeVisible()

    await expect(page.getByText('Grace')).toBeVisible()
    await expect(page.getByText('You · Host')).toBeVisible()
  } finally {
    await guestContext.close()
  }
})
