import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSoloPair } from '@/lib/solo-mode'

vi.mock('@/lib/solo-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/solo-mode')>()),
  // Pin the per-run random seed so the dealt pairs are deterministic.
  createSoloSeed: () => 'fixed-challenge',
}))

import { SoloPlay } from './solo-play'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}))

const seed = 'fixed-challenge'

function sharedSymbolOf(pairIndex: number) {
  const [left, right] = getSoloPair(seed, pairIndex, pairIndex).cards
  return left.symbolIds.find((symbol) => right.symbolIds.includes(symbol))!
}

function unsharedSymbolOf(pairIndex: number) {
  const [left, right] = getSoloPair(seed, pairIndex, pairIndex).cards
  return left.symbolIds.find((symbol) => !right.symbolIds.includes(symbol))!
}

function tapSymbol(symbolId: string, instance = 0) {
  const buttons = document.querySelectorAll(
    `button[data-symbol-id="${symbolId}"]`,
  )
  const button = buttons[instance]
  if (!button) throw new Error(`Symbol button not found: ${symbolId}`)
  fireEvent.click(button)
}

describe('SoloPlay', () => {
  beforeEach(() => {
    mocks.replace.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the stats strip and starts the clock without a first tap', async () => {
    vi.useFakeTimers()
    render(<SoloPlay />)

    await act(async () => {})

    expect(screen.getByText('Score')).toBeVisible()
    expect(screen.getByText('Time left')).toBeVisible()
    expect(screen.getByText('Symbols')).toBeVisible()
    expect(screen.getByTestId('solo-time-left')).toHaveTextContent('30s')

    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })

    expect(screen.getByTestId('solo-time-left')).toHaveTextContent('29s')
    expect(screen.getByTestId('solo-score')).toHaveTextContent('0')
  })

  it('scores a shared-symbol tap on either card and rewards time', async () => {
    vi.useFakeTimers()
    render(<SoloPlay />)
    await act(async () => {})
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })

    await act(async () => {
      tapSymbol(sharedSymbolOf(0), 1)
    })

    expect(screen.getByTestId('solo-score')).toHaveTextContent('1')
    expect(screen.getByTestId('solo-time-left')).toHaveTextContent('30s')

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // The pair advanced to the next deterministic pair in the sequence.
    expect(
      document.querySelector(`button[data-symbol-id="${sharedSymbolOf(1)}"]`),
    ).not.toBeNull()
  })

  it('penalizes an incorrect tap and keeps the current pair', async () => {
    vi.useFakeTimers()
    render(<SoloPlay />)
    await act(async () => {})
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })

    await act(async () => {
      tapSymbol(unsharedSymbolOf(0))
    })

    expect(screen.getByTestId('solo-score')).toHaveTextContent('0')
    expect(screen.getByTestId('solo-time-left')).toHaveTextContent('26s')

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(
      document.querySelector(`button[data-symbol-id="${sharedSymbolOf(0)}"]`),
    ).not.toBeNull()
  })

  it('routes to the results page with only the score when time expires', async () => {
    vi.useFakeTimers()
    render(<SoloPlay />)
    await act(async () => {})

    await act(async () => {
      vi.advanceTimersByTime(30_100)
    })

    expect(mocks.replace).toHaveBeenCalledWith('/solo/results?score=0')
  })
})
