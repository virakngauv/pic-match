import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JoinRoomForm } from './join-room-form'

const mocks = vi.hoisted(() => ({
  ensureClientToken: vi.fn(() => 'a'.repeat(32)),
  joinRoom: vi.fn(),
  push: vi.fn(),
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
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
    mocks.joinRoom.mockResolvedValue({ roomCode: 'frvg7' })
    mocks.push.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('locks a room code supplied by the room route', () => {
    render(<JoinRoomForm initialRoomCode="frvg7" roomCodeLocked={true} />)

    expect(screen.getByLabelText('Room code')).toHaveValue('frvg7')
    expect(screen.getByLabelText('Room code')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('keeps the room code editable in the standard join flow', () => {
    render(<JoinRoomForm />)

    expect(screen.getByLabelText('Room code')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Room code')).toHaveFocus()
  })

  it('stays on the room route after an inline join', async () => {
    const user = userEvent.setup()

    render(
      <JoinRoomForm
        initialRoomCode="frvg7"
        roomCodeLocked
        navigateAfterJoin={false}
      />,
    )

    await user.type(screen.getByLabelText('Name'), 'Browser player')
    await user.click(screen.getByRole('button', { name: 'Join' }))

    await waitFor(() => {
      expect(mocks.joinRoom).toHaveBeenCalledWith({
        roomCode: 'frvg7',
        name: 'Browser player',
        clientToken: 'a'.repeat(32),
      })
    })
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
