import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SOLO_STORAGE_KEY, formatSoloShareText } from '@/lib/solo-mode'

import { SoloResults } from './solo-results'

describe('SoloResults', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('records a new personal best for a challenge run', async () => {
    localStorage.setItem(
      SOLO_STORAGE_KEY,
      JSON.stringify({ version: 1, bestScore: 5, lastScore: 2 }),
    )
    render(<SoloResults seed="abc-123" score={7} target={5} />)

    expect(await screen.findByText('You scored 7 pairs.')).toBeVisible()
    expect(
      await screen.findByText('Personal best: 7 — new best!'),
    ).toBeVisible()
    expect(screen.getByText('Challenge beaten — you passed 5!')).toBeVisible()
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
    render(<SoloResults seed="abc-123" score={3} target={23} />)

    expect(await screen.findByText('Personal best: 12')).toBeVisible()
    expect(screen.getByText('You scored 3 pairs.')).toBeVisible()
    expect(screen.queryByText(/new best/)).not.toBeInTheDocument()
    expect(screen.getByText('Challenge target: 23')).toBeVisible()
    expect(JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      bestScore: 12,
      lastScore: 3,
    })
  })

  it('mirrors the multiplayer result actions', async () => {
    render(<SoloResults seed="abc-123" score={7} target={23} />)
    await screen.findByText('You scored 7 pairs.')

    expect(screen.getByRole('link', { name: 'Play again' })).toHaveAttribute(
      'href',
      '/solo?seed=abc-123&target=23',
    )
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(
      screen.getByRole('button', { name: 'Share challenge' }),
    ).toBeVisible()
  })

  it('returns to a plain start page when the run had no challenge seed', async () => {
    render(<SoloResults seed={null} score={4} target={null} />)
    await screen.findByText('You scored 4 pairs.')

    expect(screen.getByRole('link', { name: 'Play again' })).toHaveAttribute(
      'href',
      '/solo',
    )
  })

  it('copies the challenge text when native share is unavailable', async () => {
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

    render(<SoloResults seed="abc-123" score={9} target={null} />)
    await screen.findByText('Personal best: 9 — new best!')

    await user.click(screen.getByRole('button', { name: 'Share challenge' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Challenge copied to clipboard.',
      ),
    )
    expect(written[0]).toBe(
      formatSoloShareText(
        9,
        'http://localhost:3000/solo?seed=abc-123&target=9',
      ),
    )
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

    render(<SoloResults seed="abc-123" score={9} target={null} />)
    await screen.findByText('Personal best: 9 — new best!')

    await user.click(screen.getByRole('button', { name: 'Share challenge' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copy this challenge link: http://localhost:3000/solo?seed=abc-123&target=9',
      ),
    )
  })
})
