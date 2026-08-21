import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IntegrationLab } from './integration-lab'

const mocks = vi.hoisted(() => ({ connectionStatus: 'connected' }))

vi.mock('@/components/game-socket-provider', () => ({
  useGameSocket: () => ({ connectionStatus: mocks.connectionStatus }),
}))

describe('IntegrationLab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the React hello interaction', async () => {
    const user = userEvent.setup()
    render(<IntegrationLab />)

    await user.click(screen.getByRole('button', { name: 'Say hello' }))

    expect(screen.getByText('Hello × 1')).toBeInTheDocument()
  })

  it('calls the Next.js hello route', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Hello from the Next.js API route!',
          timestamp: '2026-07-19T12:00:00.000Z',
        }),
      ),
    )
    render(<IntegrationLab />)

    await user.click(screen.getByRole('tab', { name: /Next.js/ }))
    await user.click(screen.getByRole('button', { name: 'Call API route' }))

    expect(
      await screen.findByText('Hello from the Next.js API route!'),
    ).toBeInTheDocument()
  })

  it('shows the game-server connection status on the Socket.IO tab', async () => {
    const user = userEvent.setup()
    render(<IntegrationLab />)

    await user.click(screen.getByRole('tab', { name: /Socket.IO/ }))

    expect(screen.getByText('GameSocketProvider')).toBeInTheDocument()
    expect(
      screen.getByText('Connected · game server ready'),
    ).toBeInTheDocument()
  })
})
