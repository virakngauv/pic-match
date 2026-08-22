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
  endedReason: null as 'expired' | 'removed' | 'server_restart' | null,
  connectionStatus: 'connected' as 'connecting' | 'connected' | 'disconnected',
  leaveRoom: vi.fn(),
  removePlayer: vi.fn(),
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
    removePlayer: mocks.removePlayer,
    startGame: mocks.startGame,
    claimMatch: mocks.claimMatch,
    prepareRematch: mocks.prepareRematch,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}))

function lobby(): Extract<RoomSnapshot, { status: 'lobby' }> {
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

function finished(): Extract<RoomSnapshot, { status: 'finished' }> {
  return {
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
}

describe('RoomLobby', () => {
  beforeEach(() => {
    mocks.snapshot = lobby()
    mocks.endedReason = null
    mocks.connectionStatus = 'connected'
    mocks.leaveRoom.mockReset().mockResolvedValue({ status: 'success' })
    mocks.removePlayer.mockReset().mockResolvedValue({ status: 'success' })
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

  it('offers host-only removal with an accessible cancelable confirmation', async () => {
    const user = userEvent.setup()
    render(<RoomLobby roomCode="frvg7" />)
    const trigger = screen.getByRole('button', {
      name: 'Remove Grace from room',
    })

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Remove Grace?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('need to join the room again')
    const cancel = screen.getByRole('button', { name: 'Keep player' })
    const confirm = screen.getByRole('button', { name: 'Remove Grace' })
    expect(cancel).toHaveFocus()

    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not render removal controls for a guest', () => {
    mocks.snapshot = {
      ...lobby(),
      player: { ...guest, position: null },
    }
    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.queryByRole('button', { name: /remove .* from room/i }),
    ).not.toBeInTheDocument()
  })

  it('does not render removal controls for another host-role member', () => {
    mocks.snapshot = {
      ...lobby(),
      members: [
        host,
        { playerId: 'player-3', name: 'Lin', role: 'host' },
        guest,
      ],
    }
    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.queryByRole('button', { name: 'Remove Lin from room' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove Grace from room' }),
    ).toBeInTheDocument()
  })

  it('locks duplicate removals and announces success', async () => {
    const user = userEvent.setup()
    let resolveRemoval!: (result: { status: 'success' }) => void
    mocks.removePlayer.mockReturnValue(
      new Promise((resolve) => {
        resolveRemoval = resolve
      }),
    )
    render(<RoomLobby roomCode="frvg7" />)
    await user.click(
      screen.getByRole('button', { name: 'Remove Grace from room' }),
    )
    const confirm = screen.getByRole('button', { name: 'Remove Grace' })

    await user.dblClick(confirm)

    expect(mocks.removePlayer).toHaveBeenCalledOnce()
    expect(mocks.removePlayer).toHaveBeenCalledWith('frvg7', 'player-2')
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeDisabled()

    resolveRemoval({ status: 'success' })

    expect(
      await screen.findByText('Grace was removed from the room.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the confirmation recoverable when removal fails', async () => {
    const user = userEvent.setup()
    mocks.removePlayer.mockResolvedValue({
      status: 'server_unavailable',
      message: 'The game server is unavailable. Please try again.',
    })
    render(<RoomLobby roomCode="frvg7" />)
    await user.click(
      screen.getByRole('button', { name: 'Remove Grace from room' }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove Grace' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The game server is unavailable. Please try again.',
    )
    expect(screen.getByRole('button', { name: 'Remove Grace' })).toBeEnabled()
  })

  it('explicitly leaves before navigating home', async () => {
    const user = userEvent.setup()
    render(<RoomLobby roomCode="frvg7" />)
    await user.click(screen.getByRole('button', { name: 'Leave room' }))

    await waitFor(() => expect(mocks.leaveRoom).toHaveBeenCalledWith('frvg7'))
    expect(mocks.routerPush).toHaveBeenCalledWith('/home')
  })

  it('shows an error when leaving is rejected by the server', async () => {
    const user = userEvent.setup()
    mocks.leaveRoom.mockResolvedValue({
      status: 'server_unavailable',
      message: 'The game server is unavailable.',
    })
    render(<RoomLobby roomCode="frvg7" />)

    await user.click(screen.getByRole('button', { name: 'Leave room' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to leave the room. Please try again.',
    )
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('renders the authoritative playing snapshot', () => {
    mocks.snapshot = playing()
    render(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('main', { name: 'Game for Ada' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Ada's score")).toHaveTextContent('0')
  })

  it('adds room credentials to a claim and maps a stale result', async () => {
    const user = userEvent.setup()
    mocks.snapshot = playing()
    mocks.claimMatch.mockResolvedValue({
      status: 'stale',
      message: 'That round already moved on.',
    })
    render(<RoomLobby roomCode="frvg7" />)

    await user.click(screen.getByRole('button', { name: 'Sun on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Sun on card 2' }))

    await waitFor(() =>
      expect(mocks.claimMatch).toHaveBeenCalledWith({
        roomCode: 'frvg7',
        commandId: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
        pairRevision: 0,
        firstSymbolId: 'sun',
        secondSymbolId: 'sun',
      }),
    )
    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('That round already moved on.')
  })

  it('applies a server cooldown returned from a claim', async () => {
    const user = userEvent.setup()
    const cooldownUntil = Date.now() + 60_000
    mocks.snapshot = playing()
    mocks.claimMatch.mockResolvedValue({
      status: 'cooldown',
      message: 'Please wait before trying again.',
      cooldownUntil,
    })
    render(<RoomLobby roomCode="frvg7" />)

    await user.click(screen.getByRole('button', { name: 'Sun on card 1' }))
    await user.click(screen.getByRole('button', { name: 'Sun on card 2' }))

    await waitFor(() => expect(mocks.claimMatch).toHaveBeenCalled())
    expect(
      screen.getByRole('status', { name: 'Match claim feedback' }),
    ).toHaveTextContent('Please wait a moment before selecting again.')
    expect(
      screen.getByRole('button', { name: 'Moon on card 1' }),
    ).toBeDisabled()
  })

  it('shows reconnecting without removing the current member', () => {
    mocks.snapshot = playing()
    mocks.connectionStatus = 'disconnected'
    render(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('heading', { name: 'Reconnecting to your game…' }),
    ).toBeInTheDocument()
  })

  it('describes a finished-room reconnect as reconnecting to the room', () => {
    mocks.snapshot = finished()
    mocks.connectionStatus = 'disconnected'
    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('heading', { name: 'Reconnecting to the room…' }),
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

  it('explains when the host removes the local player', () => {
    mocks.snapshot = { status: 'joinable', roomCode: 'frvg7' }
    mocks.endedReason = 'removed'
    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('heading', {
        name: 'You were removed from this room.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/host removed you from the lobby/i)).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Join another room' }),
    ).toBeVisible()
  })

  it('orders the finished scoreboard by score with a seat-position tie-break', () => {
    const third = {
      playerId: 'player-3',
      name: 'Linus',
      role: 'player' as const,
    }
    mocks.snapshot = {
      ...finished(),
      scoreboard: [
        { ...host, position: 0, score: 5 },
        { ...guest, position: 1, score: 9 },
        { ...third, position: 2, score: 5 },
      ],
    }
    render(<RoomLobby roomCode="frvg7" />)

    const entries = screen.getAllByRole('listitem')
    expect(
      entries.map((entry) => entry.querySelector('span span')?.textContent),
    ).toEqual(['Grace', 'Ada', 'Linus'])
    expect(entries.map((entry) => entry.dataset.playerPosition)).toEqual([
      '1',
      '0',
      '2',
    ])
  })

  it('lets only the finished-game host prepare a rematch', async () => {
    const user = userEvent.setup()
    mocks.snapshot = finished()
    render(<RoomLobby roomCode="frvg7" />)
    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(mocks.prepareRematch).toHaveBeenCalledWith('frvg7')
  })

  it('reports a failed rematch and blocks duplicate requests while pending', async () => {
    const user = userEvent.setup()
    let resolvePrepare!: (result: {
      status: 'server_unavailable'
      message: string
    }) => void
    mocks.snapshot = finished()
    mocks.prepareRematch.mockReturnValue(
      new Promise((resolve) => {
        resolvePrepare = resolve
      }),
    )
    render(<RoomLobby roomCode="frvg7" />)

    const button = screen.getByRole('button', { name: 'Play again' })
    await user.click(button)
    expect(button).toBeDisabled()
    await user.click(button)
    expect(mocks.prepareRematch).toHaveBeenCalledOnce()

    resolvePrepare({
      status: 'server_unavailable',
      message: 'The game server is unavailable.',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to return to the lobby. Please try again.',
    )
    expect(button).toBeEnabled()
  })
})
