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

describe('GameScreen', () => {
  it('renders both server-provided cards and every symbol as a named control', () => {
    renderGame()

    const board = screen.getByLabelText('Shared game board')
    const firstCard = within(board).getByRole('article', { name: 'Card 1' })
    const secondCard = within(board).getByRole('article', { name: 'Card 2' })

    expect(firstCard).toHaveAttribute('data-card-id', 'card-13')
    expect(secondCard).toHaveAttribute('data-card-id', 'card-52')
    expect(firstCard).toHaveClass('min-w-72')
    expect(secondCard).toHaveClass('min-w-72')
    expect(firstCard.dataset.layoutTemplate).toBeTruthy()
    expect(secondCard.dataset.layoutTemplate).toBeTruthy()
    expect(firstCard.dataset.layoutTemplate).not.toBe(
      secondCard.dataset.layoutTemplate,
    )
    expect(within(firstCard).getAllByRole('button')).toHaveLength(8)
    expect(within(secondCard).getAllByRole('button')).toHaveLength(8)
    expect(
      within(firstCard).getByRole('button', { name: 'Cat on card 1' }),
    ).toBeEnabled()
    expect(
      within(secondCard).getByRole('button', { name: 'Cat on card 2' }),
    ).toBeEnabled()
  })

  it('gives symbol controls deterministic visual metadata and focus treatment', () => {
    const { rerender } = renderGame()
    const sun = screen.getByRole('button', { name: 'Sun on card 1' })
    const originalMetadata = symbolMetadata(sun)

    expect(sun).toHaveClass(
      '[height:max(3rem,var(--symbol-target-size))]',
      '[width:max(3rem,var(--symbol-target-size))]',
    )
    expect(sun).toHaveClass('focus-visible:ring-4')
    expect(sun).not.toHaveClass('bg-white/75', 'shadow-sm')
    expect(sun.style.top).toMatch(/%$/)
    expect(sun.style.left).toMatch(/%$/)
    expect(sun.style.getPropertyValue('--symbol-font-size')).toMatch(/cqi$/)
    expect(sun.style.getPropertyValue('--symbol-target-size')).toMatch(/cqi$/)
    expect(sun.style.transform).toBe('translate(-50%, -50%)')
    expect((sun.firstElementChild as HTMLElement).style.transform).toMatch(
      /rotate\(-?\d+(\.\d+)?deg\)/,
    )

    rerender(
      <GameScreen
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

    await user.click(sun)
    await user.click(moon)

    expect(sun).toHaveAttribute('aria-pressed', 'false')
    expect(moon).toHaveAttribute('aria-pressed', 'true')
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
    ).toHaveTextContent(
      'Select one symbol on each card. Your match submits automatically.',
    )
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

    fireEvent.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cat on card 2' }))

    await act(async () => Promise.resolve())

    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Incorrect match. Try again in a moment.')

    const firstSelection = screen.getByRole('button', {
      name: 'Cat on card 1',
    })
    const secondSelection = screen.getByRole('button', {
      name: 'Cat on card 2',
    })

    expect(firstSelection).toBeDisabled()
    expect(secondSelection).toBeDisabled()
    expect(firstSelection).toHaveAttribute('aria-pressed', 'true')
    expect(secondSelection).toHaveAttribute('aria-pressed', 'true')
    expect(firstSelection).toHaveAttribute('data-incorrect', 'true')
    expect(secondSelection).toHaveAttribute('data-incorrect', 'true')
    expect(within(firstSelection).getByText('×')).toHaveClass(
      'spot-it-incorrect-mark',
    )
    expect(within(secondSelection).getByText('×')).toHaveClass(
      'spot-it-incorrect-mark',
    )
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
    expect(firstSelection).toBeEnabled()
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Select one symbol on each card. Your match submits automatically.',
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
    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeDisabled()
  })

  it('restores a persisted cooldown and enables controls at its deadline', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)

    renderGame({ cooldownUntil: 11_000 })

    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeDisabled()
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Please wait a moment before selecting again.',
    )

    act(() => vi.advanceTimersByTime(1_010))

    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeEnabled()
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Select one symbol on each card. Your match submits automatically.',
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
      'Unable to submit your match. Select either symbol again to retry.',
    )
    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeEnabled()
    expect(consoleError).toHaveBeenCalledWith(
      'Match claim submission failed.',
      error,
    )

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))

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
    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cat on card 2' })).toBeDisabled()
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

    expect(screen.getByText('Room frvg7 · Round 2')).toBeInTheDocument()
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

  it('shows a recoverable unavailable state instead of a partial board', () => {
    render(
      <GameScreen
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
