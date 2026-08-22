import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GameScoreboard,
  orderGameScoreboard,
  type GameScoreboardEntry,
} from './game-scoreboard'

const originalAnimateDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'animate',
)

const entries: readonly GameScoreboardEntry[] = [
  {
    playerId: 'ada',
    name: 'Ada',
    role: 'host',
    position: 0,
    score: 2,
  },
  {
    playerId: 'grace',
    name: 'Grace Hopper Twenty',
    role: 'player',
    position: 1,
    score: 4,
  },
  {
    playerId: 'linus',
    name: 'Linus',
    role: 'player',
    position: 2,
    score: 4,
  },
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalAnimateDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'animate',
      originalAnimateDescriptor,
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  }
})

describe('GameScoreboard', () => {
  it('orders score descending with a seat tie-break and exposes readable cards', () => {
    render(
      <GameScoreboard
        localPlayerId="linus"
        pairRevision={4}
        scoreboard={[entries[2]!, entries[0]!, entries[1]!]}
        revealScorerId="grace"
      />,
    )

    const list = screen.getByRole('list', {
      name: 'Live leaderboard, highest score first',
    })
    const viewport = screen.getByRole('region', {
      name: 'Scrollable leaderboard',
    })
    const items = screen.getAllByRole('listitem')

    expect(list.tagName).toBe('OL')
    expect(viewport).toHaveAttribute('tabindex', '0')
    expect(items.map((item) => item.dataset.playerId)).toEqual([
      'grace',
      'linus',
      'ada',
    ])
    expect(items.map((item) => item.dataset.scoreRank)).toEqual(['1', '2', '3'])
    expect(items[0]).toHaveAttribute('data-scored', 'true')
    expect(items[1]).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Grace Hopper Twenty')).toHaveClass(
      'game-score-name',
    )
    expect(screen.getByText('Grace Hopper Twenty')).toHaveAttribute(
      'title',
      'Grace Hopper Twenty',
    )
    expect(screen.getByText('First to 12')).toBeInTheDocument()
    expect(
      screen.getByLabelText("Grace Hopper Twenty's score"),
    ).toHaveAttribute('aria-live', 'off')
  })

  it('returns a new deterministically ordered array without mutating input', () => {
    const original = [entries[2]!, entries[0]!, entries[1]!]

    expect(
      orderGameScoreboard(original).map(({ playerId }) => playerId),
    ).toEqual(['grace', 'linus', 'ada'])
    expect(original.map(({ playerId }) => playerId)).toEqual([
      'linus',
      'ada',
      'grace',
    ])
  })

  it('animates rank swaps while preserving the horizontal scroll offset', () => {
    mockReducedMotion(false)
    const positions = new Map([
      ['ada', 0],
      ['grace', 160],
    ])
    mockEntryPositions(positions)
    const { animate, cancel } = mockAnimations()
    const initial = entries.slice(0, 2).map((entry, index) => ({
      ...entry,
      score: index === 0 ? 1 : 0,
    }))
    const { rerender } = render(
      <GameScoreboard
        localPlayerId="ada"
        pairRevision={0}
        scoreboard={initial}
        revealScorerId={null}
      />,
    )
    const viewport = screen.getByRole('region', {
      name: 'Scrollable leaderboard',
    })
    viewport.scrollLeft = 48
    fireEvent.scroll(viewport)

    positions.set('grace', 0)
    positions.set('ada', 160)
    rerender(
      <GameScoreboard
        localPlayerId="ada"
        pairRevision={0}
        scoreboard={initial.map((entry) =>
          entry.playerId === 'grace' ? { ...entry, score: 2 } : entry,
        )}
        revealScorerId="grace"
      />,
    )

    expect(
      screen.getAllByRole('listitem').map((item) => item.dataset.playerId),
    ).toEqual(['grace', 'ada'])
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute(
      'data-reordering',
      'true',
    )
    expect(viewport.scrollLeft).toBe(48)
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animate.mock.calls.map(([keyframes]) => keyframes)).toEqual(
      expect.arrayContaining([
        [{ translate: '160px 0px' }, { translate: '0 0' }],
        [{ translate: '-160px 0px' }, { translate: '0 0' }],
      ]),
    )
    expect(cancel).not.toHaveBeenCalled()
  })

  it('prefers a newer live leftward scroll position over a stale event value', () => {
    mockReducedMotion(false)
    mockEntryPositions(new Map())
    const { rerender } = render(
      <GameScoreboard
        localPlayerId="ada"
        pairRevision={0}
        scoreboard={entries}
        revealScorerId={null}
      />,
    )
    const viewport = screen.getByRole('region', {
      name: 'Scrollable leaderboard',
    })
    viewport.scrollLeft = 64
    fireEvent.scroll(viewport)
    viewport.scrollLeft = 24

    rerender(
      <GameScoreboard
        localPlayerId="ada"
        pairRevision={1}
        scoreboard={[...entries]}
        revealScorerId={null}
      />,
    )

    expect(viewport.scrollLeft).toBe(24)
  })

  it('reorders immediately without animation when reduced motion is requested', () => {
    mockReducedMotion(true)
    const positions = new Map([
      ['ada', 0],
      ['grace', 160],
    ])
    mockEntryPositions(positions)
    const { animate } = mockAnimations()
    const initial = entries.slice(0, 2).map((entry, index) => ({
      ...entry,
      score: index === 0 ? 1 : 0,
    }))
    const { rerender } = render(
      <GameScoreboard
        localPlayerId="ada"
        pairRevision={0}
        scoreboard={initial}
        revealScorerId={null}
      />,
    )

    positions.set('grace', 0)
    positions.set('ada', 160)
    rerender(
      <GameScoreboard
        localPlayerId="ada"
        pairRevision={0}
        scoreboard={initial.map((entry) =>
          entry.playerId === 'grace' ? { ...entry, score: 2 } : entry,
        )}
        revealScorerId="grace"
      />,
    )

    expect(
      screen.getAllByRole('listitem').map((item) => item.dataset.playerId),
    ).toEqual(['grace', 'ada'])
    expect(animate).not.toHaveBeenCalled()
  })
})

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }))
}

function mockEntryPositions(positions: Map<string, number>) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      const contentLeft = this.dataset.playerId
        ? (positions.get(this.dataset.playerId) ?? 0)
        : 0
      const left = this.dataset.playerId
        ? contentLeft -
          (this.closest<HTMLElement>('.game-score-viewport')?.scrollLeft ?? 0)
        : contentLeft

      return {
        bottom: 48,
        height: 48,
        left,
        right: left + 144,
        top: 0,
        width: 144,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }
    },
  )
}

function mockAnimations() {
  const cancel = vi.fn()
  const animate = vi.fn(
    (
      _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      _options?: number | KeyframeAnimationOptions,
    ) => {
      void _keyframes
      void _options
      return {
        cancel,
        oncancel: null,
        onfinish: null,
      } as unknown as Animation
    },
  )

  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: animate,
  })

  return { animate, cancel }
}
