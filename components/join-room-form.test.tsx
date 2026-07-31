import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JoinRoomForm } from './join-room-form'

const mocks = vi.hoisted(() => ({
  ensureClientToken: vi.fn(() => 'a'.repeat(32)),
  joinRoom: vi.fn(),
  onJoined: vi.fn(),
}))

vi.mock('@/convex/_generated/api', () => ({
  api: {
    rooms: {
      join: 'join',
    },
  },
}))

vi.mock('convex/react', () => ({
  useMutation: () => mocks.joinRoom,
}))

vi.mock('@/components/player-session-provider', () => ({
  usePlayerSession: () => ({
    ensureClientToken: mocks.ensureClientToken,
  }),
}))

describe('JoinRoomForm', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud')
    mocks.ensureClientToken.mockClear()
    mocks.joinRoom.mockReset()
    mocks.joinRoom.mockResolvedValue({ status: 'joined', roomCode: 'frvg7' })
    mocks.onJoined.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('locks a room code supplied by the room route', () => {
    render(<JoinRoomForm roomCode="frvg7" />)

    expect(screen.getByLabelText('Room code')).toHaveValue('frvg7')
    expect(screen.getByLabelText('Room code')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('keeps the room code editable in the standard join flow', () => {
    render(<JoinRoomForm />)

    expect(screen.getByLabelText('Room code')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Room code')).toHaveFocus()
  })

  it('invokes onJoined with the room after a successful join', async () => {
    const user = userEvent.setup()

    render(<JoinRoomForm roomCode="frvg7" onJoined={mocks.onJoined} />)

    await user.type(screen.getByLabelText('Name'), 'Browser player')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(mocks.joinRoom).toHaveBeenCalledWith({
        roomCode: 'frvg7',
        name: 'Browser player',
        clientToken: 'a'.repeat(32),
        clientInstanceId: expect.any(String),
      })
    })
    expect(mocks.onJoined).toHaveBeenCalledWith({ roomCode: 'frvg7' })
  })

  it('leaves the parent in charge when onJoined is omitted', async () => {
    const user = userEvent.setup()

    render(<JoinRoomForm roomCode="frvg7" />)

    await user.type(screen.getByLabelText('Name'), 'Browser player')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(mocks.joinRoom).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled()
    })
  })

  it('shows when the room has no available seats', async () => {
    const user = userEvent.setup()
    mocks.joinRoom.mockResolvedValue({ status: 'room_full' })

    render(<JoinRoomForm roomCode="frvg7" onJoined={mocks.onJoined} />)

    await user.type(screen.getByLabelText('Name'), 'Late player')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This room is full.',
    )
    expect(mocks.onJoined).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled()
  })
})
