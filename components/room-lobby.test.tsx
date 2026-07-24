import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomLobby } from './room-lobby'

const mocks = vi.hoisted(() => ({
  clientToken: 'a'.repeat(32) as string | null | undefined,
  currentMember: null as
    { playerId: string; role: 'host' | 'player' } | null | undefined,
  heartbeatEnabled: false,
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
      leave: 'leave',
    },
  },
}))

vi.mock('convex/react', () => ({
  useMutation: () => vi.fn(),
  useQuery: (query: string) =>
    query === 'getLobby' ? mocks.lobby : mocks.currentMember,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
  },
}))

describe('RoomLobby', () => {
  beforeEach(() => {
    mocks.clientToken = 'a'.repeat(32)
    mocks.currentMember = null
    mocks.heartbeatEnabled = false
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

  it('shows a public lobby and join action for a token from another room', () => {
    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.queryByText('Loading room…')).not.toBeInTheDocument()
    expect(screen.getByText('Firefox host')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Join this room' }),
    ).toHaveAttribute('href', '/join?roomCode=frvg7')
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it('renders lobby data without showing a player-session loading message', () => {
    mocks.clientToken = undefined
    mocks.currentMember = undefined

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('Firefox host')).toBeInTheDocument()
    expect(
      screen.queryByText('Checking your player session…'),
    ).not.toBeInTheDocument()
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it('renders the room shell instead of a visible loading message', () => {
    mocks.lobby = undefined
    mocks.currentMember = undefined

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.queryByText('Loading room…')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Ready to play.')).toBeInTheDocument()
    expect(screen.getByText('frvg7')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Join this room' }),
    ).not.toBeInTheDocument()
  })

  it('starts presence only for a confirmed room member', () => {
    mocks.currentMember = { playerId: 'member-1', role: 'host' }

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('You · Host')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeEnabled()
    expect(mocks.heartbeatEnabled).toBe(true)
  })
})
