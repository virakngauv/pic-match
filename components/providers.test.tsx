import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Providers } from './providers'

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({
    children,
    publishableKey,
  }: {
    children: ReactNode
    publishableKey: string
  }) => (
    <div data-testid="clerk" data-publishable-key={publishableKey}>
      {children}
    </div>
  ),
}))

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

afterEach(() => vi.unstubAllEnvs())

describe('Providers', () => {
  it('renders the game providers without Clerk configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    render(
      <Providers>
        <span>Game content</span>
      </Providers>,
    )

    expect(screen.queryByTestId('clerk')).not.toBeInTheDocument()
    expect(screen.getByTestId('player-session')).toContainElement(
      screen.getByTestId('game-socket'),
    )
    expect(screen.getByTestId('game-socket')).toContainElement(
      screen.getByText('Game content'),
    )
  })

  it('wraps the game providers in Clerk when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'test-publishable-key')
    render(
      <Providers>
        <span>Game content</span>
      </Providers>,
    )

    expect(screen.getByTestId('clerk')).toHaveAttribute(
      'data-publishable-key',
      'test-publishable-key',
    )
    expect(screen.getByTestId('clerk')).toContainElement(
      screen.getByTestId('player-session'),
    )
    expect(screen.getByTestId('player-session')).toContainElement(
      screen.getByTestId('game-socket'),
    )
    expect(screen.getByTestId('game-socket')).toContainElement(
      screen.getByText('Game content'),
    )
  })
})
