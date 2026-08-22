import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SELECTED_SYMBOL_SCALE } from '@/lib/card-selection'

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

const nextCards = [
  {
    id: 'card-77',
    symbolIds: [
      'sun',
      'moon',
      'star',
      'heart',
      'dog',
      'rocket',
      'book',
      'anchor',
    ],
  },
  {
    id: 'card-88',
    symbolIds: [
      'dog',
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

const acceptedClaim = {
  scorerId: 'member-1',
  scorerName: 'Firefox host',
  symbolId: 'cat',
  pairRevision: 0,
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
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={cards}
        scoreboard={scoreboard}
        lastAcceptedClaim={null}
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
    expect(symbolFilter(moon).style.filter).toBe('none')
    expect(symbolFilter(moon)).not.toBe(moonGlyph)
    expect(symbolFilter(moon).style.transform).toBe('')
    expect(moonGlyph.style.filter).toBe('')
    expect(sun).toHaveClass(
      'border-accent/70!',
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
    expect(symbolFilter(sun).style.filter).toBe('none')
    expect(sun).not.toHaveClass('border-accent/70!')
    expect(moonGlyph.style.transform).not.toBe(moonBaseTransform)
    expect(moonGlyph.style.transform).toContain(
      `scale(${SELECTED_SYMBOL_SCALE})`,
    )
    expect(symbolFilter(moon).style.filter).toBe('none')
    expect(moon).toHaveClass(
      'border-accent/70!',
      'bg-accent/15',
      'ring-accent/40',
      'border-2',
      'ring-4',
    )
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
    expect(cat).not.toHaveClass('border-accent/70!', 'bg-accent/15', 'ring-4')
    expect(catGlyph.style.transform).toBe(baseTransform)
    expect(symbolFilter(cat).style.filter).toBe('none')
    expect(
      within(screen.getByRole('article', { name: 'Card 1' }))
        .getAllByRole('button')
        .map((button) => symbolFilter(button).style.filter),
    ).toEqual(Array(8).fill('none'))
    expect(onSubmitClaim).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Match claim feedback')).toBeEmptyDOMElement()
    expect(screen.queryByText(/first to/i)).not.toBeInTheDocument()
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

    expect(cardGlyphFilters(firstCard)).toEqual(Array(8).fill('none'))
    expect(cardGlyphFilters(secondCard)).toEqual(Array(8).fill('none'))

    await user.click(secondCat)

    expect(firstCat).toHaveAttribute('aria-pressed', 'true')
    expect(secondCat).toHaveAttribute('aria-pressed', 'true')
    expect(symbolFilter(firstCat).style.filter).toBe('none')
    expect(symbolFilter(secondCat).style.filter).toBe('none')
    expect(cardGlyphFilters(firstCard)).toEqual(Array(8).fill('none'))
    expect(cardGlyphFilters(secondCard)).toEqual(Array(8).fill('none'))
    expect(firstCat).toHaveClass('border-accent/70!', 'ring-accent/40')
    expect(secondCat).toHaveClass('border-accent/70!', 'ring-accent/40')
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
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={cards}
        scoreboard={scoreboard}
        lastAcceptedClaim={null}
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
    ).toBeEmptyDOMElement()
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
    expect(firstSelection).toHaveClass(
      'border-red-700/70',
      'bg-red-100/80',
      'ring-red-500/50',
    )
    expect(firstSelection).not.toHaveClass('border-accent/70!')
    expect(symbolFilter(firstSelection).style.filter).toBe('none')
    expect(firstGlyph.style.transform).toContain(
      `scale(${SELECTED_SYMBOL_SCALE})`,
    )
    expect(
      symbolFilter(screen.getByRole('button', { name: 'Sun on card 1' })).style
        .filter,
    ).toBe('none')
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
    expect(screen.getByLabelText('Match claim feedback')).toBeEmptyDOMElement()

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
    expect(screen.getByLabelText('Match claim feedback')).toBeEmptyDOMElement()

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
    expect(
      screen.getByRole('alert', { name: 'Match claim feedback' }),
    ).toHaveClass('game-feedback-overlay')
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
    const scoreboardBeforeAdvance = screen.getByRole('complementary', {
      name: 'Scoreboard',
    })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={cards}
        scoreboard={scoreboard.map((entry) =>
          entry.playerId === player.playerId ? { ...entry, score: 1 } : entry,
        )}
        lastAcceptedClaim={null}
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
    expect(screen.getByRole('complementary', { name: 'Scoreboard' })).toBe(
      scoreboardBeforeAdvance,
    )
    expect(
      screen.getByRole('button', { name: 'Cat on card 1' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('button', { name: 'Cat on card 2' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not expose room navigation during active play', () => {
    renderGame()

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Home' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Leave room' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Room menu' }),
    ).not.toBeInTheDocument()
  })

  it('shows a recoverable unavailable state instead of a partial board', () => {
    render(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={[cards[0]]}
        scoreboard={scoreboard}
        lastAcceptedClaim={null}
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

describe('GameScreen score reveal', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('overlays the server-confirmed scorer on the matched pair before advancing', () => {
    vi.useFakeTimers()
    const { rerender } = renderGame()

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={nextCards}
        scoreboard={scoreboard.map((entry) =>
          entry.playerId === 'member-1' ? { ...entry, score: 3 } : entry,
        )}
        lastAcceptedClaim={acceptedClaim}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveAttribute(
      'data-card-id',
      'card-13',
    )
    expect(screen.getByRole('article', { name: 'Card 2' })).toHaveAttribute(
      'data-card-id',
      'card-52',
    )

    const firstCat = screen.getByRole('button', { name: 'Cat on card 1' })
    const secondCat = screen.getByRole('button', { name: 'Cat on card 2' })
    const firstBadge = firstCat.querySelector('[data-score-reveal]')
    const secondBadge = secondCat.querySelector('[data-score-reveal]')

    expect(firstCat).toHaveAttribute('data-revealed', 'true')
    expect(secondCat).toHaveAttribute('data-revealed', 'true')
    expect(symbolFilter(firstCat)).toHaveAttribute(
      'data-score-reveal-muted',
      'false',
    )
    expect(symbolFilter(firstCat).style.filter).toBe('none')
    const firstSun = screen.getByRole('button', { name: 'Sun on card 1' })
    expect(symbolFilter(firstSun)).toHaveAttribute(
      'data-score-reveal-muted',
      'true',
    )
    expect(symbolFilter(firstSun).style.filter).toBe('saturate(0)')
    expect(firstBadge).toHaveTextContent('Firefox host')
    expect(firstBadge).toHaveClass('spot-it-score-reveal')
    expect(firstBadge?.firstElementChild).toHaveClass(
      'line-clamp-2',
      'break-words',
    )
    expect(secondBadge).toHaveTextContent('Firefox host')
    const board = screen.getByLabelText('Shared game board')

    within(board)
      .getAllByRole('button')
      .forEach((button) => expect(button).toBeDisabled())
    expect(screen.getByLabelText('Score reveal')).toHaveTextContent(
      'Firefox host matched Cat for a point.',
    )
    expect(
      screen
        .getAllByRole('listitem')
        .find((entry) => entry.textContent?.includes('Firefox host')),
    ).toHaveAttribute('data-scored', 'true')
    expect(
      screen.getByText('Room frvg7, round 1', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1_510))

    expect(
      screen.getByText('Room frvg7, round 2', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveAttribute(
      'data-card-id',
      'card-77',
    )
    expect(screen.getByRole('article', { name: 'Card 2' })).toHaveAttribute(
      'data-card-id',
      'card-88',
    )
    expect(
      within(screen.getByLabelText('Shared game board')).queryAllByText(
        'Firefox host',
      ),
    ).toHaveLength(0)
    expect(screen.getByLabelText('Score reveal')).toHaveTextContent('')
    expect(screen.getByRole('button', { name: 'Dog on card 1' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'Dog on card 1' }),
    ).toHaveAttribute('data-revealed', 'false')
  })

  it('announces the reveal as the local player for their own accepted claim', () => {
    vi.useFakeTimers()
    const { rerender } = renderGame()

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={nextCards}
        scoreboard={scoreboard}
        lastAcceptedClaim={{
          ...acceptedClaim,
          scorerId: 'member-2',
          scorerName: 'Chrome player',
        }}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Score reveal')).toHaveTextContent(
      'You matched Cat for a point.',
    )
    expect(
      screen
        .getByRole('button', { name: 'Cat on card 1' })
        .querySelector('[data-score-reveal]'),
    ).toHaveTextContent('Chrome player')
  })

  it('advances immediately without a reveal when no claim is published', () => {
    vi.useFakeTimers()
    const { rerender } = renderGame()

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={nextCards}
        scoreboard={scoreboard}
        lastAcceptedClaim={null}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Room frvg7, round 2', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveAttribute(
      'data-card-id',
      'card-77',
    )
    expect(screen.getByLabelText('Score reveal')).toHaveTextContent('')
  })

  it('skips the reveal when mounting directly onto an already-resolved pair', () => {
    vi.useFakeTimers()
    render(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={nextCards}
        scoreboard={scoreboard}
        lastAcceptedClaim={acceptedClaim}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Room frvg7, round 2', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveAttribute(
      'data-card-id',
      'card-77',
    )
    expect(screen.getByLabelText('Score reveal')).toHaveTextContent('')
    expect(
      screen.getByRole('button', { name: 'Sun on card 1' }),
    ).toHaveAttribute('data-revealed', 'false')
  })

  it('skips the reveal when the displayed revision was never the resolved one', () => {
    vi.useFakeTimers()
    const { rerender } = renderGame()

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={2}
        cards={nextCards}
        scoreboard={scoreboard}
        lastAcceptedClaim={acceptedClaim}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Room frvg7, round 3', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveAttribute(
      'data-card-id',
      'card-77',
    )
    expect(screen.getByLabelText('Score reveal')).toHaveTextContent('')
  })

  it('cuts an active reveal short when a further revision arrives', () => {
    vi.useFakeTimers()
    const { rerender } = renderGame()

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={nextCards}
        scoreboard={scoreboard}
        lastAcceptedClaim={acceptedClaim}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Score reveal')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(500))
    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={2}
        cards={nextCards.map((card) => ({ ...card }))}
        scoreboard={scoreboard}
        lastAcceptedClaim={{ ...acceptedClaim, pairRevision: 1 }}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Score reveal')).toHaveTextContent('')
    expect(
      screen.getByText('Room frvg7, round 3', { selector: 'span.sr-only' }),
    ).toBeInTheDocument()
  })

  it('keeps the reveal bounded when the same round rerenders with new data', () => {
    vi.useFakeTimers()
    const { rerender } = renderGame()

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={nextCards}
        scoreboard={scoreboard}
        lastAcceptedClaim={acceptedClaim}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Score reveal')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1_000))
    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={nextCards.map((card) => ({ ...card }))}
        scoreboard={scoreboard.map((entry) => ({ ...entry }))}
        lastAcceptedClaim={acceptedClaim}
        cooldownUntil={null}
        onSubmitClaim={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Score reveal')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(510))

    expect(screen.getByLabelText('Score reveal')).toHaveTextContent('')
    expect(screen.getByRole('article', { name: 'Card 1' })).toHaveAttribute(
      'data-card-id',
      'card-77',
    )
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
      roomCode="frvg7"
      player={player}
      pairRevision={0}
      cards={cards}
      scoreboard={scoreboard}
      lastAcceptedClaim={null}
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
