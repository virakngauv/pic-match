import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SOLO_LAST_RUN_KEY,
  SOLO_STORAGE_KEY,
  formatSoloShareText,
  rememberSoloRunScore,
} from '@/lib/solo-mode'

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  // A stable router object: the mount effect depends on the router identity,
  // and Next's real useRouter returns a stable value across renders.
  return { replace, router: { replace } }
})

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}))

import { SoloResults } from './solo-results'

function seedRun(score: number) {
  sessionStorage.setItem(
    SOLO_LAST_RUN_KEY,
    JSON.stringify({ version: 1, score }),
  )
}

describe('SoloResults', () => {
  beforeEach(() => {
    mocks.replace.mockReset()
    localStorage.clear()
    sessionStorage.clear()
    rememberSoloRunScore(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
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
    seedRun(7)
    render(<SoloResults />)
    await act(async () => {})

    expect(screen.getByText('You scored 7 pairs.')).toBeVisible()
    expect(screen.getByText('Personal best: 7 — new best!')).toBeVisible()
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
    seedRun(3)
    render(<SoloResults />)
    await act(async () => {})

    expect(screen.getByText('Personal best: 12')).toBeVisible()
    expect(screen.getByText('You scored 3 pairs.')).toBeVisible()
    expect(screen.queryByText(/new best/)).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      bestScore: 12,
      lastScore: 3,
    })
  })

  it('returns to the rules page without a finished run', async () => {
    render(<SoloResults />)
    await act(async () => {})

    expect(mocks.replace).toHaveBeenCalledWith('/solo/rules')
    expect(screen.queryByText(/You scored/)).not.toBeInTheDocument()
  })

  it('still shows the finished run when session storage access throws', async () => {
    rememberSoloRunScore(7)
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<SoloResults />)
    await act(async () => {})

    expect(screen.getByText('You scored 7 pairs.')).toBeVisible()
    expect(screen.getByText('Personal best: 7 — new best!')).toBeVisible()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('keeps the new-best flag when Strict Mode replays the mount effect', async () => {
    localStorage.setItem(
      SOLO_STORAGE_KEY,
      JSON.stringify({ version: 1, bestScore: 5, lastScore: 2 }),
    )
    seedRun(7)
    render(
      <StrictMode>
        <SoloResults />
      </StrictMode>,
    )
    await act(async () => {})

    expect(screen.getByText('Personal best: 7 — new best!')).toBeVisible()
    expect(JSON.parse(localStorage.getItem(SOLO_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      bestScore: 7,
      lastScore: 7,
    })
  })

  it('mirrors the multiplayer result actions', async () => {
    seedRun(7)
    render(<SoloResults />)
    await act(async () => {})

    expect(screen.getByText('You scored 7 pairs.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Play again' })).toHaveAttribute(
      'href',
      '/solo/play',
    )
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    ).toBeVisible()
  })

  it('copies the invite text, confirms on the button, then reverts', async () => {
    vi.useFakeTimers()
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          written.push(text)
        },
      },
      configurable: true,
    })

    seedRun(9)
    render(<SoloResults />)
    await act(async () => {})
    expect(screen.getByText('Personal best: 9 — new best!')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Challenge a friend' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeVisible()
    expect(written[0]).toBe(
      formatSoloShareText(9, 'http://localhost:3000/solo/rules'),
    )
    // Success is announced by the button text alone; no extra status line.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    // The confirmation is momentary; the action label comes back.
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    ).toBeVisible()
  })

  it('confirms a native share on the button, then reverts', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'share', {
      value: vi.fn(async () => {}),
      configurable: true,
    })

    seedRun(5)
    render(<SoloResults />)
    await act(async () => {})
    expect(screen.getByText('Personal best: 5 — new best!')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Challenge a friend' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Shared ✓' })).toBeVisible()
    expect(navigator.share).toHaveBeenCalledWith({
      title: 'Pic Match Solo',
      text: formatSoloShareText(5, 'http://localhost:3000/solo/rules'),
      url: 'http://localhost:3000/solo/rules',
    })

    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    ).toBeVisible()
  })

  it('restarts the confirmation when sharing again while it shows', async () => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => text,
      },
      configurable: true,
    })

    seedRun(3)
    render(<SoloResults />)
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: 'Challenge a friend' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeVisible()

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    // A re-share while the confirmation shows restarts the revert timer.
    fireEvent.click(screen.getByRole('button', { name: 'Link copied' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeVisible()

    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeVisible()

    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    ).toBeVisible()
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

    seedRun(9)
    render(<SoloResults />)
    await waitFor(() =>
      expect(screen.getByText('Personal best: 9 — new best!')).toBeVisible(),
    )

    await user.click(screen.getByRole('button', { name: 'Challenge a friend' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copy failed. Share this link instead: http://localhost:3000/solo/rules',
      ),
    )
    expect(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    ).toBeVisible()
  })
})
