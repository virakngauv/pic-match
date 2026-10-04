import { expect, test } from '@playwright/test'

test('declares and serves browser and Apple touch icons', async ({
  page,
  request,
}) => {
  await page.goto('/home')

  const favicon = page.locator('head link[rel="icon"][href^="/favicon.ico"]')
  const icon = page.locator('head link[rel="icon"][href^="/icon.png"]')
  const appleIcon = page.locator(
    'head link[rel="apple-touch-icon"][href^="/apple-icon.png"]',
  )
  await expect(favicon).toHaveCount(1)
  await expect(icon).toHaveAttribute('sizes', '192x192')
  await expect(appleIcon).toHaveAttribute('sizes', '180x180')

  // Check the conventional fallback directly: an HTML response can return 200
  // while still leaving browsers with a blank tab icon.
  const fallback = await request.get('/favicon.ico')
  expect(fallback.status()).toBe(200)
  expect(fallback.headers()['content-type']).toMatch(
    /^image\/(x-icon|vnd\.microsoft\.icon)/,
  )
  expect((await fallback.body()).subarray(0, 4)).toEqual(
    Buffer.from([0, 0, 1, 0]),
  )

  for (const link of [icon, appleIcon]) {
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()
    const response = await request.get(href!)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/^image\/png/)
    expect((await response.body()).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  }
})
