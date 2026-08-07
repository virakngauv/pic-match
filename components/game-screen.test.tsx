import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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

  it('renders score and pair updates from the next server view', () => {
    const { rerender } = renderGame()

    rerender(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={1}
        cards={cards}
        scoreboard={scoreboard.map((entry) =>
          entry.playerId === player.playerId ? { ...entry, score: 1 } : entry,
        )}
      />,
    )

    expect(screen.getByText('Room frvg7 · Round 2')).toBeInTheDocument()
    expect(screen.getByLabelText("Chrome player's score")).toHaveTextContent(
      '1',
    )
  })

  it('shows a recoverable unavailable state instead of a partial board', () => {
    render(
      <GameScreen
        roomCode="frvg7"
        player={player}
        pairRevision={0}
        cards={[cards[0]]}
        scoreboard={scoreboard}
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

function renderGame() {
  return render(
    <GameScreen
      roomCode="frvg7"
      player={player}
      pairRevision={0}
      cards={cards}
      scoreboard={scoreboard}
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
