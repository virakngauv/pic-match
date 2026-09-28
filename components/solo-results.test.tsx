import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SOLO_STORAGE_KEY, formatSoloShareText } from '@/lib/solo-mode'

import { SoloResults } from './solo-results'

describe('SoloResults', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    // Keep share/clipboard stubs from leaking between tests.
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    })
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
  })

  it('records a new personal best for the run', async () => {
    localStorage.setItem(
      SOLO_STORAGE_KEY,
      JSON.stringify({ version: 1, bestScore: 5, lastScore: 2 }),
    )
    render(<SoloResults score={7} />)

    expect(await screen.findByText('You scored 7 pairs.')).toBeVisible()
    expect(
      await screen.findByText('Personal best: 7 — new best!'),
    ).toBeVisible()
    expect(JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      bestScore: 7,
      lastScore: 7,
    })
  })

  it('keeps the previous best when the run scores lower', async () => {
    localStorage.setItem(
      SOLO_STORAGE_KEY,
      JSON.stringify({ version: 1, bestScore: 12, lastScore: 9 }),
    )
    render(<SoloResults score={3} />)

    expect(await screen.findByText('Personal best: 12')).toBeVisible()
    expect(screen.getByText('You scored 3 pairs.')).toBeVisible()
    expect(screen.queryByText(/new best/)).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      bestScore: 12,
      lastScore: 3,
    })
  })

  it('mirrors the multiplayer result actions', async () => {
    render(<SoloResults score={7} />)
    await screen.findByText('You scored 7 pairs.')

    expect(screen.getByRole('link', { name: 'Play again' })).toHaveAttribute(
      'href',
      '/solo',
    )
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    ).toBeVisible()
  })

  it('copies the invite text and flips the button when clipboard write works', async () => {
    const user = userEvent.setup()
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          written.push(text)
        },
      },
      configurable: true,
    })

    render(<SoloResults score={9} />)
    await screen.findByText('Personal best: 9 — new best!')

    await user.click(screen.getByRole('button', { name: 'Challenge a friend' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Link copied' })).toBeVisible(),
    )
    expect(written[0]).toBe(
      formatSoloShareText(9, 'http://localhost:3000/solo'),
    )
    // Success is announced by the button text alone; no extra status line.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('flips the button to Shared after a native share completes', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => {}),
      configurable: true,
    })

    render(<SoloResults score={5} />)
    await screen.findByText('Personal best: 5 — new best!')

    await user.click(screen.getByRole('button', { name: 'Challenge a friend' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Shared ✓' })).toBeVisible(),
    )
    expect(navigator.share).toHaveBeenCalledWith({
      title: 'Pic Match Solo',
      text: formatSoloShareText(5, 'http://localhost:3000/solo'),
      url: 'http://localhost:3000/solo',
    })
  })

  it('falls back to showing the link when clipboard write fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied')
        },
      },
      configurable: true,
    })

    render(<SoloResults score={9} />)
    await screen.findByText('Personal best: 9 — new best!')

    await user.click(screen.getByRole('button', { name: 'Challenge a friend' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copy failed. Share this link instead: http://localhost:3000/solo',
      ),
    )
    expect(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    ).toBeVisible()
  })
})
