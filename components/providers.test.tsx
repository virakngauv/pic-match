import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Providers } from './providers'

vi.mock('@/components/player-session-provider', () => ({
  PlayerSessionProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="player-session">{children}</div>
  ),
}))

vi.mock('@/components/game-socket-provider', () => ({
  GameSocketProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="game-socket">{children}</div>
  ),
}))

describe('Providers', () => {
  it('renders the game socket provider within the player session provider', () => {
    render(
      <Providers>
        <span>Game content</span>
      </Providers>,
    )

    expect(screen.getByTestId('player-session')).toContainElement(
      screen.getByTestId('game-socket'),
    )
    expect(screen.getByTestId('game-socket')).toContainElement(
      screen.getByText('Game content'),
    )
  })
})
