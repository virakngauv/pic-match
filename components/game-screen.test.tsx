import { act, render, screen, waitFor, within } from '@testing-library/react'
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

    expect(sun).toHaveClass('min-h-12', 'min-w-12')
    expect(sun).toHaveClass('focus-visible:ring-4')
    expect(sun.style.top).toMatch(/%$/)
    expect(sun.style.left).toMatch(/%$/)
    expect(sun.style.fontSize).toMatch(/rem$/)
    expect(sun.style.transform).toMatch(/rotate\(-?\d+deg\)/)

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={cards}
        scoreboard={scoreboard}
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

  it('selects and replaces one local symbol per card', async () => {
    const user = userEvent.setup()
    renderGame()
    const sun = screen.getByRole('button', { name: 'Sun on card 1' })
    const moon = screen.getByRole('button', { name: 'Moon on card 1' })
    const cat = screen.getByRole('button', { name: 'Cat on card 2' })

    await user.click(sun)
    await user.click(cat)

    expect(sun).toHaveAttribute('aria-pressed', 'true')
    expect(cat).toHaveAttribute('aria-pressed', 'true')

    await user.click(moon)

    expect(sun).toHaveAttribute('aria-pressed', 'false')
    expect(moon).toHaveAttribute('aria-pressed', 'true')
  })

  it('provides the same symbol selection behavior from the keyboard', async () => {
    const user = userEvent.setup()
    renderGame()
    const cat = screen.getByRole('button', { name: 'Cat on card 1' })

    cat.focus()
    await user.keyboard('{Enter}')

    expect(cat).toHaveAttribute('aria-pressed', 'true')
  })

  it('submits both selected symbols with the viewed pair revision', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn().mockResolvedValue({ status: 'accepted' })
    renderGame({ onSubmitClaim })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))
    await user.click(screen.getByRole('button', { name: 'Submit match' }))

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
  })

  it('reports an incomplete selection without submitting it', async () => {
    const user = userEvent.setup()
    const onSubmitClaim = vi.fn()
    renderGame({ onSubmitClaim })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Submit match' }))

    expect(onSubmitClaim).not.toHaveBeenCalled()
    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Select one symbol on each card before submitting.')
  })

  it.each([
    ['incorrect', 'Those symbols do not match. Try again.'],
    ['stale', 'That round already moved on. Select from the current cards.'],
  ] as const)('shows distinct %s claim feedback', async (status, message) => {
    const user = userEvent.setup()
    renderGame({
      onSubmitClaim: vi.fn().mockResolvedValue({ status }),
    })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))
    await user.click(screen.getByRole('button', { name: 'Submit match' }))

    expect(
      await screen.findByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent(message)

    if (status === 'stale') {
      expect(
        screen.getByRole('button', { name: 'Cat on card 1' }),
      ).toHaveAttribute('aria-pressed', 'false')
      expect(
        screen.getByRole('button', { name: 'Cat on card 2' }),
      ).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('prevents duplicate input while the same claim is pending', async () => {
    const user = userEvent.setup()
    let resolveClaim: ((value: { status: 'incorrect' }) => void) | undefined
    const onSubmitClaim = vi.fn(
      () =>
        new Promise<{ status: 'incorrect' }>((resolve) => {
          resolveClaim = resolve
        }),
    )
    renderGame({ onSubmitClaim })

    await user.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Cat on card 2' }))
    await user.click(screen.getByRole('button', { name: 'Submit match' }))

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Submitting…' }))
    expect(onSubmitClaim).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveClaim?.({ status: 'incorrect' })
    })

    expect(screen.getByRole('button', { name: 'Submit match' })).toBeEnabled()
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
}: {
  onSubmitClaim?: React.ComponentProps<typeof GameScreen>['onSubmitClaim']
} = {}) {
  return render(
    <GameScreen
      roomCode="frvg7"
      player={player}
      pairRevision={0}
      cards={cards}
      scoreboard={scoreboard}
      onSubmitClaim={onSubmitClaim}
    />,
  )
}

function symbolMetadata(element: HTMLElement) {
  return {
    size: element.dataset.symbolSize,
    rotation: element.dataset.symbolRotation,
    x: element.dataset.symbolX,
    y: element.dataset.symbolY,
  }
}
