import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomLobby } from './room-lobby'

const mocks = vi.hoisted(() => ({
  clientToken: 'a'.repeat(32) as string | null | undefined,
  currentMember: null as
    { playerId: string; role: 'host' | 'player' } | null | undefined,
  heartbeatEnabled: false,
  leaveRoom: vi.fn(),
  presenceStatus: 'connected' as
    'inactive' | 'connecting' | 'connected' | 'room-full',
  routerPush: vi.fn(),
  lobby: {
    roomCode: 'frvg7',
    members: [
      {
        playerId: 'member-1',
        name: 'Firefox host',
        role: 'host' as const,
      },
    ],
  } as
    | {
        roomCode: string
        members: Array<{
          playerId: string
          name: string
          role: 'host' | 'player'
        }>
      }
    | null
    | undefined,
}))

vi.mock('@/convex/_generated/api', () => ({
  api: {
    presence: { heartbeat: 'heartbeat' },
    rooms: {
      getCurrentMember: 'getCurrentMember',
      getLobby: 'getLobby',
      join: 'join',
      leave: 'leave',
    },
  },
}))

vi.mock('convex/react', () => ({
  useMutation: () => mocks.leaveRoom,
  useQuery: (query: string) =>
    query === 'getLobby' ? mocks.lobby : mocks.currentMember,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('@/components/player-session-provider', () => ({
  usePlayerSession: () => ({
    clientToken: mocks.clientToken,
    ensureClientToken: vi.fn(),
  }),
}))

vi.mock('@/lib/use-room-presence', () => ({
  useRoomPresence: (
    _roomCode: string,
    _clientToken: string | null | undefined,
    enabled: boolean,
  ) => {
    mocks.heartbeatEnabled = enabled
    return enabled ? mocks.presenceStatus : 'inactive'
  },
}))

describe('RoomLobby', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud')
    mocks.clientToken = 'a'.repeat(32)
    mocks.currentMember = null
    mocks.heartbeatEnabled = false
    mocks.leaveRoom.mockReset()
    mocks.leaveRoom.mockResolvedValue(undefined)
    mocks.presenceStatus = 'connected'
    mocks.routerPush.mockReset()
    mocks.lobby = {
      roomCode: 'frvg7',
      members: [
        {
          playerId: 'member-1',
          name: 'Firefox host',
          role: 'host',
        },
      ],
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows an inline locked join form for a non-member', () => {
    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByRole('main')).toHaveTextContent('Join your friends.')
    expect(screen.getByLabelText('Room code')).toHaveValue('frvg7')
    expect(screen.getByLabelText('Room code')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it('shows a neutral state while the player session hydrates', () => {
    mocks.clientToken = undefined
    mocks.currentMember = undefined

    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('main', { name: 'Checking room access' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.queryByText('Checking your player session…'),
    ).not.toBeInTheDocument()
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it('renders a neutral skeleton while room access is unresolved', () => {
    mocks.lobby = undefined
    mocks.currentMember = undefined

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.queryByText('Loading room…')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Ready to play.')).not.toBeInTheDocument()
    expect(screen.queryByText('Join your friends.')).not.toBeInTheDocument()
  })

  it('starts presence only for a confirmed room member', () => {
    mocks.currentMember = { playerId: 'member-1', role: 'host' }

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('You · Host')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeEnabled()
    expect(mocks.heartbeatEnabled).toBe(true)
  })

  it('keeps the join screen hidden while leaving and navigating home', async () => {
    mocks.currentMember = { playerId: 'member-1', role: 'host' }
    const { rerender } = render(<RoomLobby roomCode="frvg7" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Ready to play.')).toBeInTheDocument()
    expect(screen.getByText('Firefox host')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leaving…' })).toBeDisabled()

    mocks.currentMember = null
    rerender(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('Ready to play.')).toBeInTheDocument()
    expect(screen.getByText('Firefox host')).toBeInTheDocument()
    expect(screen.queryByText('Join your friends.')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith('/home')
    })
  })

  it('restores the lobby when leaving fails', async () => {
    mocks.currentMember = { playerId: 'member-1', role: 'host' }
    mocks.leaveRoom.mockRejectedValue(new Error('Network unavailable'))
    render(<RoomLobby roomCode="frvg7" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))

    expect(
      await screen.findByText('Unable to leave the room. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeEnabled()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('shows a full-room recovery screen when a seat cannot be reclaimed', () => {
    mocks.currentMember = { playerId: 'member-1', role: 'host' }
    mocks.presenceStatus = 'room-full'

    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('heading', { name: 'Sorry, this room is full.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/home',
    )
  })

  it('shows recovery actions when the room does not exist', () => {
    mocks.lobby = null

    render(<RoomLobby roomCode="zzzzz" />)

    expect(
      screen.getByRole('heading', {
        name: 'Sorry, room zzzzz doesn’t exist.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(
      screen.getByRole('link', { name: 'Create a new room' }),
    ).toHaveAttribute('href', '/create')
  })
})
