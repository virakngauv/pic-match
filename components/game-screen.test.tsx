import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  SELECTED_SYMBOL_SCALE,
  UNSELECTED_SYMBOL_FILTER,
} from '@/lib/card-selection'

import { GameScreen } from './game-screen'

const player = {
  playerId: 'member-2',
  name: 'Chrome player',
  role: 'player' as const,
  position: 1,
}

const cards = [
  {
    id: 'card-13',
    symbolIds: [
      'sun',
      'moon',
      'star',
      'heart',
      'cat',
      'rocket',
      'book',
      'anchor',
    ],
  },
  {
    id: 'card-52',
    symbolIds: [
      'cat',
      'flower',
      'apple',
      'bee',
      'turtle',
      'camera',
      'gift',
      'dice',
    ],
  },
] as const

const scoreboard = [
  {
    playerId: 'member-2',
    name: 'Chrome player',
    role: 'player' as const,
    position: 1,
    score: 0,
  },
  {
    playerId: 'member-1',
    name: 'Firefox host',
    role: 'host' as const,
    position: 0,
    score: 2,
  },
]

const navigationProps = {
  isLeaving: false,
  leaveError: null,
  onGoHome: vi.fn(),
  onLeaveRoom: vi.fn(),
}

describe('GameScreen', () => {
  it('renders both server-provided cards and every symbol as a named control', () => {
    renderGame()

    const board = screen.getByLabelText('Shared game board')
    const firstCard = within(board).getByRole('article', { name: 'Card 1' })
    const secondCard = within(board).getByRole('article', { name: 'Card 2' })

    expect(firstCard).toHaveAttribute('data-card-id', 'card-13')
    expect(secondCard).toHaveAttribute('data-card-id', 'card-52')
    expect(firstCard.parentElement).toHaveClass('game-card-slot')
    expect(secondCard.parentElement).toHaveClass('game-card-slot')
    expect(board).toHaveClass('game-board')
    expect(
      screen.getByRole('main', { name: 'Game for Chrome player' }),
    ).toHaveClass('game-surface')
    expect(firstCard.dataset.layoutTemplate).toBeTruthy()
    expect(secondCard.dataset.layoutTemplate).toBeTruthy()
    expect(firstCard.dataset.layoutTemplate).not.toBe(
      secondCard.dataset.layoutTemplate,
    )
    expect(within(firstCard).getAllByRole('button')).toHaveLength(8)
    expect(within(secondCard).getAllByRole('button')).toHaveLength(8)
    const firstCat = within(firstCard).getByRole('button', {
      name: 'Cat on card 1',
    })

    expect(firstCat).toBeEnabled()
    expectNeutralSymbolCursor(firstCat)
    expect(
      within(secondCard).getByRole('button', { name: 'Cat on card 2' }),
    ).toBeEnabled()
  })

  it('gives symbol controls deterministic visual metadata and focus treatment', () => {
    const { rerender } = renderGame()
    const sun = screen.getByRole('button', { name: 'Sun on card 1' })
    const originalMetadata = symbolMetadata(sun)

    expect(sun).toHaveClass(
      '[height:max(var(--symbol-min-target-size,3rem),var(--symbol-target-size))]',
      '[width:max(var(--symbol-min-target-size,3rem),var(--symbol-target-size))]',
    )
    expect(sun).toHaveClass('focus-visible:ring-4')
    expect(sun).not.toHaveClass('bg-white/75', 'shadow-sm')
    expect(sun.style.top).toMatch(/%$/)
    expect(sun.style.left).toMatch(/%$/)
    expect(sun.style.getPropertyValue('--symbol-font-size')).toMatch(/cqi$/)
    expect(sun.style.getPropertyValue('--symbol-target-size')).toMatch(/cqi$/)
    expect(sun.style.transform).toBe('translate(-50%, -50%)')
    expect(symbolGlyph(sun).style.transform).toMatch(
      /rotate\(-?\d+(\.\d+)?deg\)/,
    )

    rerender(
      <GameScreen
        {...navigationProps}
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={cards}
        scoreboard={scoreboard}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(
      symbolMetadata(screen.getByRole('button', { name: 'Sun on card 1' })),
    ).toEqual(originalMetadata)
    expect(
      symbolMetadata(screen.getByRole('button', { name: 'Moon on card 1' })),
    ).not.toEqual(originalMetadata)
  })

  it('orders the scoreboard, highlights the local player, and exposes scores', () => {
    renderGame()

    const entries = screen.getAllByRole('listitem')

    expect(entries).toHaveLength(2)
    expect(entries[0]).toHaveTextContent('Firefox host')
    expect(entries[0]).toHaveAttribute('data-player-position', '0')
    expect(entries[1]).toHaveTextContent('Chrome player')
    expect(entries[1]).toHaveAttribute('aria-current', 'true')
    expect(screen.getByLabelText("Firefox host's score")).toHaveTextContent('2')
    expect(screen.getByLabelText("Chrome player's score")).toHaveTextContent(
      '0',
    )
  })

  it('selects and replaces one local symbol without submitting', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn()
    renderGame({ onSubmitClaim })
    const sun = screen.getByRole('button', { name: 'Sun on card 1' })
    const moon = screen.getByRole('button', { name: 'Moon on card 1' })
    const secondCard = screen.getByRole('article', { name: 'Card 2' })
    const sunGlyph = symbolGlyph(sun)
    const moonGlyph = symbolGlyph(moon)
    const sunBaseTransform = sunGlyph.style.transform
    const moonBaseTransform = moonGlyph.style.transform

    await user.click(sun)

    expect(sunGlyph.style.transform).toContain(
      `scale(${SELECTED_SYMBOL_SCALE})`,
    )
    expect(sunGlyph.style.transform).toMatch(/rotate\(-?6deg\)/)
    expect(symbolFilter(sun).style.filter).toBe('none')
    expect(symbolFilter(moon).style.filter).toBe(UNSELECTED_SYMBOL_FILTER)
    expect(symbolFilter(moon)).not.toBe(moonGlyph)
    expect(symbolFilter(moon).style.transform).toBe('')
    expect(moonGlyph.style.filter).toBe('')
    expect(sun).not.toHaveClass(
      'border-accent/70',
      'bg-accent/15',
      'ring-accent/40',
      'border-2',
      'ring-4',
    )
    expect(sun).toHaveClass('focus-visible:ring-4')
    expect(
      within(secondCard)
        .getAllByRole('button')
        .map((button) => symbolFilter(button).style.filter),
    ).toEqual(Array(8).fill('none'))

    await user.click(moon)

    expect(sun).toHaveAttribute('aria-pressed', 'false')
    expect(moon).toHaveAttribute('aria-pressed', 'true')
    expect(sunGlyph.style.transform).toBe(sunBaseTransform)
    expect(symbolFilter(sun).style.filter).toBe(UNSELECTED_SYMBOL_FILTER)
    expect(moonGlyph.style.transform).not.toBe(moonBaseTransform)
    expect(moonGlyph.style.transform).toContain(
      `scale(${SELECTED_SYMBOL_SCALE})`,
    )
    expect(symbolFilter(moon).style.filter).toBe('none')
    expect(onSubmitClaim).not.toHaveBeenCalled()
  })

  it('toggles an editable selection off without submitting or moving focus', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn()
    renderGame({ onSubmitClaim })
    const cat = screen.getByRole('button', { name: 'Cat on card 1' })
    const catGlyph = symbolGlyph(cat)
    const baseTransform = catGlyph.style.transform

    await user.click(cat)

    expect(cat).toHaveAttribute('aria-pressed', 'true')
    expect(cat).toHaveAttribute('data-selected', 'true')
    expect(catGlyph.style.transform).not.toBe(baseTransform)

    await user.click(cat)

    expect(cat).toHaveFocus()
    expect(cat).toHaveAttribute('aria-pressed', 'false')
    expect(cat).toHaveAttribute('data-selected', 'false')
    expect(cat).not.toHaveClass('border-accent/70', 'bg-accent/15', 'ring-4')
    expect(catGlyph.style.transform).toBe(baseTransform)
    expect(symbolFilter(cat).style.filter).toBe('none')
    expect(
      within(screen.getByRole('article', { name: 'Card 1' }))
        .getAllByRole('button')
        .map((button) => symbolFilter(button).style.filter),
    ).toEqual(Array(8).fill('none'))
    expect(onSubmitClaim).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Select the match on both cards.',
    )
    expect(
      screen.getByText('Room frvg7, round 1', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
  })

  it('toggles an editable selection with Enter and Space', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn()
    renderGame({ onSubmitClaim })
    const cat = screen.getByRole('button', { name: 'Cat on card 1' })

    cat.focus()
    await user.keyboard('{Enter}')
    expect(cat).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard('{Enter}')
    expect(cat).toHaveAttribute('aria-pressed', 'false')

    await user.keyboard(' ')
    expect(cat).toHaveAttribute('aria-pressed', 'true')

    await user.keyboard(' ')
    expect(cat).toHaveFocus()
    expect(cat).toHaveAttribute('aria-pressed', 'false')
    expect(onSubmitClaim).not.toHaveBeenCalled()
  })

  it('leaves an editable selection off after rapid double activation', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn()
    renderGame({ onSubmitClaim })
    const cat = screen.getByRole('button', { name: 'Cat on card 1' })

    await user.dblClick(cat)

    expect(cat).toHaveAttribute('aria-pressed', 'false')
    expect(onSubmitClaim).not.toHaveBeenCalled()
  })

  it('provides the same symbol selection behavior from the keyboard', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn().mockResolvedValue({ status: 'accepted' })
    renderGame({ onSubmitClaim })
    const firstCat = screen.getByRole('button', { name: 'Cat on card 1' })
    const secondCat = screen.getByRole('button', { name: 'Cat on card 2' })

    firstCat.focus()
    await user.keyboard('{Enter}')
    secondCat.focus()
    await user.keyboard(' ')

    expect(firstCat).toHaveAttribute('aria-pressed', 'true')
    expect(secondCat).toHaveAttribute('aria-pressed', 'true')
    expect(onSubmitClaim).toHaveBeenCalledTimes(1)
  })

  it('styles selections independently on both cards while a claim is pending', async () => {
    const user = userEvent.setup()
    let resolveClaim: ((value: { status: 'accepted' }) => void) | undefined
    const onSubmitClaim = vi.fn(
      () =>
        new Promise<{ status: 'accepted' }>((resolve) => {
          resolveClaim = resolve
        }),
    )
    renderGame({ onSubmitClaim })
    const firstCard = screen.getByRole('article', { name: 'Card 1' })
    const secondCard = screen.getByRole('article', { name: 'Card 2' })
    const firstCat = within(firstCard).getByRole('button', {
      name: 'Cat on card 1',
    })
    const secondCat = within(secondCard).getByRole('button', {
      name: 'Cat on card 2',
    })

    await user.click(firstCat)

    expect(cardGlyphFilters(firstCard)).toEqual([
      ...Array(4).fill(UNSELECTED_SYMBOL_FILTER),
      'none',
      ...Array(3).fill(UNSELECTED_SYMBOL_FILTER),
    ])
    expect(cardGlyphFilters(secondCard)).toEqual(Array(8).fill('none'))

    await user.click(secondCat)

    expect(firstCat).toHaveAttribute('aria-pressed', 'true')
    expect(secondCat).toHaveAttribute('aria-pressed', 'true')
    expect(symbolFilter(firstCat).style.filter).toBe('none')
    expect(symbolFilter(secondCat).style.filter).toBe('none')
    expect(
      cardGlyphFilters(firstCard).filter((filter) => filter === 'none'),
    ).toHaveLength(1)
    expect(
      cardGlyphFilters(secondCard).filter((filter) => filter === 'none'),
    ).toHaveLength(1)
    expect(onSubmitClaim).toHaveBeenCalledTimes(1)

    await act(async () => resolveClaim?.({ status: 'accepted' }))
  })

  it('derives selection transforms from the base layout across rerenders', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn()
    const { rerender } = renderGame({ onSubmitClaim })
    const sun = screen.getByRole('button', { name: 'Sun on card 1' })
    const baseTransform = symbolGlyph(sun).style.transform

    await user.click(sun)
    const selectedTransform = symbolGlyph(sun).style.transform

    rerender(
      <GameScreen
        {...navigationProps}
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={cards}
        scoreboard={scoreboard}
        cooldownUntil={null}
        onSubmitClaim={onSubmitClaim}
      />,
    )

    expect(symbolGlyph(sun).style.transform).toBe(selectedTransform)
    expect(symbolGlyph(sun).style.transform).toContain(
      `scale(${SELECTED_SYMBOL_SCALE})`,
    )

    await user.click(sun)
    expect(symbolGlyph(sun).style.transform).toBe(baseTransform)
  })

  it('automatically submits both selected symbols with the viewed pair revision', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn().mockResolvedValue({ status: 'accepted' })
    renderGame({ onSubmitClaim })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    expect(onSubmitClaim).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))

    await waitFor(() => {
      expect(onSubmitClaim).toHaveBeenCalledWith({
        pairRevision: 0,
        firstSymbolId: 'cat',
        secondSymbolId: 'cat',
      })
    })
    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Match accepted.')
    const firstCat = screen.getByRole('button', { name: 'Cat on card 1' })

    expect(firstCat).toBeDisabled()
    expectNeutralSymbolCursor(firstCat)
    fireEvent.click(firstCat)
    expect(firstCat).toHaveAttribute('aria-pressed', 'true')
    expect(onSubmitClaim).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('button', { name: 'Submit match' }),
    ).not.toBeInTheDocument()
  })

  it('does not submit until both cards have a selection', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn()
    renderGame({ onSubmitClaim })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))

    expect(onSubmitClaim).not.toHaveBeenCalled()
    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Select the match on both cards.')
  })

  it('marks the selected symbols, then clears them after an incorrect claim', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const cooldownUntil = 11_000
    renderGame({
      onSubmitClaim: vi
        .fn()
        .mockResolvedValue({ status: 'incorrect', cooldownUntil }),
    })
    const firstSelection = screen.getByRole('button', {
      name: 'Cat on card 1',
    })
    const secondSelection = screen.getByRole('button', {
      name: 'Cat on card 2',
    })
    const firstGlyph = symbolGlyph(firstSelection)
    const firstBaseTransform = firstGlyph.style.transform

    fireEvent.click(firstSelection)
    fireEvent.click(secondSelection)

    await act(async () => Promise.resolve())

    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Incorrect match. Try again in a moment.')

    expect(firstSelection).toBeDisabled()
    expect(secondSelection).toBeDisabled()
    expectNeutralSymbolCursor(firstSelection)
    expectNeutralSymbolCursor(secondSelection)
    expect(firstSelection).toHaveAttribute('aria-pressed', 'true')
    expect(secondSelection).toHaveAttribute('aria-pressed', 'true')
    expect(firstSelection).toHaveAttribute('data-incorrect', 'true')
    expect(secondSelection).toHaveAttribute('data-incorrect', 'true')
    const incorrectMark = within(firstSelection).getByText('×')

    expect(incorrectMark).toHaveClass('spot-it-incorrect-mark')
    expect(incorrectMark).not.toHaveStyle({
      filter: UNSELECTED_SYMBOL_FILTER,
      transform: firstGlyph.style.transform,
    })
    expect(symbolFilter(firstSelection).style.filter).toBe('none')
    expect(firstGlyph.style.transform).toContain(
      `scale(${SELECTED_SYMBOL_SCALE})`,
    )
    expect(
      symbolFilter(screen.getByRole('button', { name: 'Sun on card 1' })).style
        .filter,
    ).toBe(UNSELECTED_SYMBOL_FILTER)
    expect(within(secondSelection).getByText('×')).toHaveClass(
      'spot-it-incorrect-mark',
    )
    fireEvent.click(firstSelection)
    expect(firstSelection).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Sun on card 1' }),
    ).toHaveAttribute('data-incorrect', 'false')
    expect(screen.queryByText(/\d seconds?/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Selection locked' }),
    ).not.toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(1_010))

    expect(firstSelection).toHaveAttribute('aria-pressed', 'false')
    expect(secondSelection).toHaveAttribute('aria-pressed', 'false')
    expect(firstSelection).toHaveAttribute('data-incorrect', 'false')
    expect(secondSelection).toHaveAttribute('data-incorrect', 'false')
    expect(within(firstSelection).queryByText('×')).not.toBeInTheDocument()
    expect(within(secondSelection).queryByText('×')).not.toBeInTheDocument()
    expect(firstGlyph.style.transform).toBe(firstBaseTransform)
    expect(symbolFilter(firstSelection).style.filter).toBe('none')
    expect(
      symbolFilter(screen.getByRole('button', { name: 'Sun on card 1' })).style
        .filter,
    ).toBe('none')
    expect(firstSelection).toBeEnabled()
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Select the match on both cards.',
    )

    vi.useRealTimers()
  })

  it('shows stale claim feedback and clears the old selection', async () => {
    const user = userEvent.setup()
    renderGame({
      onSubmitClaim: vi.fn().mockResolvedValue({ status: 'stale' }),
    })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))

    expect(
      await screen.findByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent(
      'That round already moved on. Select from the current cards.',
    )

    expect(
      screen.getByRole('button', { name: 'Cat on card 1' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', { name: 'Cat on card 2' }),
    ).toHaveAttribute('aria-pressed', 'false')
    const firstCat = screen.getByRole('button', { name: 'Cat on card 1' })

    expect(firstCat).toBeDisabled()
    expectNeutralSymbolCursor(firstCat)
    fireEvent.click(firstCat)
    expect(firstCat).toHaveAttribute('aria-pressed', 'false')
  })

  it('restores a persisted cooldown and enables controls at its deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)

    renderGame({ cooldownUntil: 11_000 })

    const firstCat = screen.getByRole('button', { name: 'Cat on card 1' })

    expect(firstCat).toBeDisabled()
    expectNeutralSymbolCursor(firstCat)
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Please wait a moment before selecting again.',
    )

    act(() => vi.advanceTimersByTime(1_010))

    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeEnabled()
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Select the match on both cards.',
    )

    vi.useRealTimers()
  })

  it('honors a cooldown result without marking or clearing the submitted pair', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    renderGame({
      onSubmitClaim: vi.fn().mockResolvedValue({
        status: 'cooldown',
        cooldownUntil: 10_500,
      }),
    })

    const firstSelection = screen.getByRole('button', {
      name: 'Cat on card 1',
    })
    const secondSelection = screen.getByRole('button', {
      name: 'Cat on card 2',
    })

    fireEvent.click(firstSelection)
    fireEvent.click(secondSelection)

    await act(async () => Promise.resolve())

    expect(firstSelection).toHaveAttribute('data-incorrect', 'false')
    expect(secondSelection).toHaveAttribute('data-incorrect', 'false')
    expect(firstSelection).toHaveAttribute('aria-pressed', 'true')
    expect(secondSelection).toHaveAttribute('aria-pressed', 'true')
    expect(firstSelection).toBeDisabled()
    expectNeutralSymbolCursor(firstSelection)
    fireEvent.click(firstSelection)
    expect(firstSelection).toHaveAttribute('aria-pressed', 'true')

    await act(async () => vi.advanceTimersByTime(510))

    expect(firstSelection).toBeEnabled()
    expect(firstSelection).toHaveAttribute('aria-pressed', 'true')
    expect(secondSelection).toHaveAttribute('aria-pressed', 'true')

    vi.useRealTimers()
  })

  it('reports a rejected submission as an error', async () => {
    const user = userEvent.setup()
    const error = new Error('offline')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onSubmitClaim = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ status: 'accepted' })
    renderGame({ onSubmitClaim })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))

    expect(
      await screen.findByRole('alert', { name: 'Match claim feedback' }),
    ).toHaveTextContent(
      'Unable to submit your match. Change or reselect either symbol to retry.',
    )
    const firstCat = screen.getByRole('button', { name: 'Cat on card 1' })
    const secondCat = screen.getByRole('button', { name: 'Cat on card 2' })

    expect(firstCat).toBeEnabled()
    expectNeutralSymbolCursor(firstCat)
    expect(consoleError).toHaveBeenCalledWith(
      'Match claim submission failed.',
      error,
    )

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))

    expect(firstCat).toHaveAttribute('aria-pressed', 'false')
    expect(secondCat).toHaveAttribute('aria-pressed', 'true')
    expect(onSubmitClaim).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('alert', { name: 'Match claim feedback' }),
    ).toHaveTextContent(
      'Unable to submit your match. Change or reselect either symbol to retry.',
    )

    await user.click(firstCat)

    expect(onSubmitClaim).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Match accepted.')

    consoleError.mockRestore()
  })

  it('prevents duplicate input while the same claim is pending', async () => {
    let resolveClaim: ((value: { status: 'accepted' }) => void) | undefined
    const onSubmitClaim = vi.fn(
      () =>
        new Promise<{ status: 'accepted' }>((resolve) => {
          resolveClaim = resolve
        }),
    )
    renderGame({ onSubmitClaim })

    fireEvent.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cat on card 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flower on card 2' }))

    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Submitting match…')
    const firstCat = screen.getByRole('button', { name: 'Cat on card 1' })
    const secondCat = screen.getByRole('button', { name: 'Cat on card 2' })

    expect(firstCat).toBeDisabled()
    expect(secondCat).toBeDisabled()
    expectNeutralSymbolCursor(firstCat)
    expectNeutralSymbolCursor(secondCat)
    expect(onSubmitClaim).toHaveBeenCalledTimes(1)
    fireEvent.click(firstCat)
    expect(firstCat).toHaveAttribute('aria-pressed', 'true')
    expect(onSubmitClaim).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveClaim?.({ status: 'accepted' })
    })

    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeDisabled()
  })

  it('resets selections when the server advances to the next revision', async () => {
    const user = userEvent.setup()
    const { rerender } = renderGame()

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))

    rerender(
      <GameScreen
        {...navigationProps}
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={cards}
        scoreboard={scoreboard.map((entry) =>
          entry.playerId === player.playerId ? { ...entry, score: 1 } : entry,
        )}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Room frvg7, round 2', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Chrome player's score")).toHaveTextContent(
      '1',
    )
    expect(
      screen.getByRole('button', { name: 'Cat on card 1' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', { name: 'Cat on card 2' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps a leave confirmation open while the shared pair advances', async () => {
    const user = userEvent.setup()
    const onLeaveRoom = vi.fn()
    const { rerender } = render(
      <GameScreen
        {...navigationProps}
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={cards}
        scoreboard={scoreboard}
        cooldownUntil={null}
        onLeaveRoom={onLeaveRoom}
        onSubmitClaim={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Leave room' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    rerender(
      <GameScreen
        {...navigationProps}
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={cards}
        scoreboard={scoreboard}
        cooldownUntil={null}
        onLeaveRoom={onLeaveRoom}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Room frvg7, round 2', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Leave this room?' })
    await user.click(within(dialog).getByRole('button', { name: 'Leave room' }))
    expect(onLeaveRoom).toHaveBeenCalledOnce()
  })

  it('shows a recoverable unavailable state instead of a partial board', () => {
    render(
      <GameScreen
        {...navigationProps}
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={[cards[0]]}
        scoreboard={scoreboard}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('status', {
        name: 'Shared game board unavailable',
      }),
    ).toHaveTextContent('The cards are temporarily unavailable.')
    expect(screen.queryByLabelText('Shared game board')).not.toBeInTheDocument()
  })
})

function renderGame({
  onSubmitClaim = vi.fn().mockResolvedValue({ status: 'accepted' }),
  cooldownUntil = null,
}: {
  onSubmitClaim?: React.ComponentProps<typeof GameScreen>['onSubmitClaim']
  cooldownUntil?: number | null
} = {}) {
  return render(
    <GameScreen
      {...navigationProps}
      roomCode="frvg7"
      player={player}
      pairRevision={0}
      cards={cards}
      scoreboard={scoreboard}
      cooldownUntil={cooldownUntil}
      onSubmitClaim={onSubmitClaim}
    />,
  )
}

function symbolMetadata(element: HTMLElement) {
  return {
    collisionRadius: element.dataset.collisionRadius,
    slot: element.dataset.layoutSlot,
    size: element.dataset.symbolSize,
    rotation: element.dataset.symbolRotation,
    x: element.dataset.symbolX,
    y: element.dataset.symbolY,
  }
}

function symbolGlyph(element: HTMLElement): HTMLElement {
  const glyph = element.querySelector<HTMLElement>('[data-symbol-glyph]')

  if (!glyph) {
    throw new Error('Missing symbol glyph wrapper.')
  }

  return glyph
}

function symbolFilter(element: HTMLElement): HTMLElement {
  const filter = element.querySelector<HTMLElement>('[data-symbol-filter]')

  if (!filter) {
    throw new Error('Missing symbol filter wrapper.')
  }

  return filter
}

function cardGlyphFilters(card: HTMLElement): string[] {
  return within(card)
    .getAllByRole('button')
    .map((button) => symbolFilter(button).style.filter)
}

function expectNeutralSymbolCursor(element: HTMLElement) {
  expect(element).toHaveClass('cursor-pointer', 'disabled:cursor-default')
  expect(element).not.toHaveClass(
    'disabled:cursor-wait',
    'disabled:cursor-progress',
  )
}
