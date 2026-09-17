import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CreateRoomForm } from './create-room-form'

const mocks = vi.hoisted(() => ({
  connectionStatus: 'connected' as 'connecting' | 'connected' | 'disconnected',
  connectionError: null as string | null,
  createRoom: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/components/game-socket-provider', () => ({
  useGameSocket: () => ({
    createRoom: mocks.createRoom,
    connectionStatus: mocks.connectionStatus,
    connectionError: mocks.connectionError,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

describe('CreateRoomForm', () => {
  beforeEach(() => {
    mocks.connectionStatus = 'connected'
    mocks.connectionError = null
    mocks.createRoom.mockReset().mockResolvedValue({
      status: 'success',
      roomCode: 'frvg7',
    })
    mocks.routerPush.mockReset()
  })

  it('creates a room and navigates to its short code', async () => {
    const user = userEvent.setup()
    render(<CreateRoomForm />)

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(mocks.createRoom).toHaveBeenCalledWith('Ada'))
    expect(mocks.routerPush).toHaveBeenCalledWith('/frvg7')
  })

  it('waits for the game socket before enabling creation', () => {
    mocks.connectionStatus = 'connecting'
    render(<CreateRoomForm />)

    expect(screen.getByLabelText('Name')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Connecting to the game server…',
    )
  })

  it('asks the player to reload when no protocol overlap exists', () => {
    mocks.connectionStatus = 'disconnected'
    mocks.connectionError =
      'This game version is no longer supported. Reload or update the page.'
    render(<CreateRoomForm />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'This game version is no longer supported. Reload or update the page.',
    )
  })

  it('shows a typed server failure without navigating', async () => {
    const user = userEvent.setup()
    mocks.createRoom.mockResolvedValue({
      status: 'rate_limited',
      message: 'Too many commands.',
    })
    render(<CreateRoomForm />)

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many commands.',
    )
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })
})
