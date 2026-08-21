import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoomSnapshot } from '@/lib/game-protocol'

import { RoomLobby } from './room-lobby'

const host = {
  playerId: 'player-1',
  name: 'Ada',
  role: 'host' as const,
}
const guest = {
  playerId: 'player-2',
  name: 'Grace',
  role: 'player' as const,
}

const mocks = vi.hoisted(() => ({
  snapshot: undefined as RoomSnapshot | undefined,
  endedReason: null as 'expired' | 'server_restart' | null,
  connectionStatus: 'connected' as 'connecting' | 'connected' | 'disconnected',
  leaveRoom: vi.fn(),
  startGame: vi.fn(),
  claimMatch: vi.fn(),
  prepareRematch: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/components/game-socket-provider', () => ({
  useRoomSnapshot: () => ({
    snapshot: mocks.snapshot,
    endedReason: mocks.endedReason,
    connectionStatus: mocks.connectionStatus,
  }),
  useGameSocket: () => ({
    leaveRoom: mocks.leaveRoom,
    startGame: mocks.startGame,
    claimMatch: mocks.claimMatch,
    prepareRematch: mocks.prepareRematch,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

function lobby(): RoomSnapshot {
  return {
    status: 'lobby',
    roomCode: 'frvg7',
    revision: 2,
    members: [host, guest],
    player: { ...host, position: null },
  }
}

function playing(): RoomSnapshot {
  return {
    status: 'playing',
    roomCode: 'frvg7',
    revision: 3,
    player: { ...host, position: 0 },
    pairRevision: 0,
    cards: [
      {
        id: 'card-1',
        symbolIds: [
          'sun',
          'moon',
          'star',
          'heart',
          'cat',
          'book',
          'key',
          'bee',
        ],
      },
      {
        id: 'card-2',
        symbolIds: [
          'sun',
          'fish',
          'dog',
          'leaf',
          'gift',
          'dice',
          'car',
          'bell',
        ],
      },
    ],
    scoreboard: [
      { ...host, position: 0, score: 0 },
      { ...guest, position: 1, score: 0 },
    ],
    lastAcceptedClaim: null,
    cooldownUntil: null,
  }
}

describe('RoomLobby', () => {
  beforeEach(() => {
    mocks.snapshot = lobby()
    mocks.endedReason = null
    mocks.connectionStatus = 'connected'
    mocks.leaveRoom.mockReset().mockResolvedValue({ status: 'success' })
    mocks.startGame.mockReset().mockResolvedValue({ status: 'success' })
    mocks.claimMatch.mockReset().mockResolvedValue({ status: 'success' })
    mocks.prepareRematch.mockReset().mockResolvedValue({ status: 'success' })
    mocks.routerPush.mockReset()
  })

  it('renders a neutral skeleton until the first snapshot arrives', () => {
    mocks.snapshot = undefined
    render(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('main', { name: 'Checking room access' }),
    ).toHaveAttribute('aria-busy', 'true')
  })

  it('offers join UI to a token without room membership', () => {
    mocks.snapshot = { status: 'joinable', roomCode: 'frvg7' }
    render(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('heading', { name: 'Join your friends.' }),
    ).toBeInTheDocument()
  })

  it('renders a lobby snapshot and starts through the socket command', async () => {
    const user = userEvent.setup()
    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('Grace')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(mocks.startGame).toHaveBeenCalledWith('frvg7')
  })

  it('explicitly leaves before navigating home', async () => {
    const user = userEvent.setup()
    render(<RoomLobby roomCode="frvg7" />)
    await user.click(screen.getByRole('button', { name: 'Leave room' }))

    await waitFor(() => expect(mocks.leaveRoom).toHaveBeenCalledWith('frvg7'))
    expect(mocks.routerPush).toHaveBeenCalledWith('/home')
  })

  it('renders the authoritative playing snapshot', () => {
    mocks.snapshot = playing()
    render(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('main', { name: 'Game for Ada' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Ada's score")).toHaveTextContent('0')
  })

  it('shows reconnecting without removing the current member', () => {
    mocks.snapshot = playing()
    mocks.connectionStatus = 'disconnected'
    render(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('heading', { name: 'Reconnecting to your game…' }),
    ).toBeInTheDocument()
  })

  it('explains intentional room loss after a server restart', () => {
    mocks.snapshot = { status: 'not_found', roomCode: 'frvg7' }
    mocks.endedReason = 'server_restart'
    render(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('heading', { name: 'This room has ended.' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/temporary rooms were cleared/i),
    ).toBeInTheDocument()
  })

  it('explains an ended room even before a snapshot arrives', () => {
    mocks.snapshot = undefined
    mocks.endedReason = 'server_restart'
    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('heading', { name: 'This room has ended.' }),
    ).toBeInTheDocument()
  })

  it('lets only the finished-game host prepare a rematch', async () => {
    const user = userEvent.setup()
    mocks.snapshot = {
      status: 'finished',
      roomCode: 'frvg7',
      revision: 20,
      player: { ...host, position: 0 },
      winner: { ...host, position: 0, score: 12 },
      scoreboard: [
        { ...host, position: 0, score: 12 },
        { ...guest, position: 1, score: 8 },
      ],
    }
    render(<RoomLobby roomCode="frvg7" />)
    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(mocks.prepareRematch).toHaveBeenCalledWith('frvg7')
  })
})
