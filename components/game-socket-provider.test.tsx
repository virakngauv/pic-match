import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GameSocketProvider,
  useGameSocket,
  useRoomSnapshot,
} from './game-socket-provider'
import type { RoomSnapshot } from '../lib/game-protocol'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => void>(),
  resumeSnapshots: new Map<string, RoomSnapshot>(),
  emitWithAck: vi.fn(),
  io: vi.fn(),
  socket: {
    connected: true,
    on: vi.fn((event: string, handler: (...args: never[]) => void) => {
      mocks.handlers.set(event, handler)
    }),
    emit: vi.fn(
      (
        event: string,
        payload: { roomCode?: string },
        acknowledge?: (result: unknown) => void,
      ) => {
        if (event !== 'session:resume' || !acknowledge) return
        const snapshot = payload.roomCode
          ? mocks.resumeSnapshots.get(payload.roomCode)
          : undefined
        acknowledge({ status: 'success', snapshot })
      },
    ),
    emitWithAck: (...args: unknown[]) => mocks.emitWithAck(...args),
    disconnect: vi.fn(),
  },
}))

vi.mock('socket.io-client', () => ({
  io: mocks.io,
}))

vi.mock('@/components/player-session-provider', () => ({
  usePlayerSession: () => ({
    clientToken: 'a'.repeat(32),
    ensureClientToken: vi.fn(),
  }),
}))

function RoomProbe({ roomCode }: { roomCode: string }) {
  const { snapshot, endedReason } = useRoomSnapshot(roomCode)
  const { leaveRoom } = useGameSocket()
  return (
    <>
      <div data-testid="status">{snapshot?.status ?? 'missing'}</div>
      <div data-testid="ended">{endedReason ?? 'active'}</div>
      <button type="button" onClick={() => void leaveRoom(roomCode)}>
        Leave
      </button>
    </>
  )
}

function MembershipProbe({
  command,
  roomCode,
}: {
  command: 'create' | 'join'
  roomCode: string
}) {
  const { createRoom, joinRoom } = useGameSocket()
  const { endedReason } = useRoomSnapshot(roomCode)
  const [completed, setCompleted] = useState(false)

  async function runCommand() {
    await (command === 'create' ? createRoom('Ada') : joinRoom(roomCode, 'Ada'))
    setCompleted(true)
  }

  return (
    <>
      <div data-testid="membership-ended">{endedReason ?? 'active'}</div>
      <div data-testid="command-completed">{completed ? 'yes' : 'no'}</div>
      <button type="button" onClick={() => void runCommand()}>
        {command}
      </button>
    </>
  )
}

describe('GameSocketProvider', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.resumeSnapshots.clear()
    mocks.emitWithAck.mockReset().mockResolvedValue({ status: 'success' })
    mocks.io.mockReset().mockReturnValue(mocks.socket)
    mocks.socket.connected = true
    mocks.socket.on.mockClear()
    mocks.socket.emit.mockClear()
    mocks.socket.disconnect.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses the local game server when the public URL is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_GAME_SERVER_URL', '')
    render(
      <GameSocketProvider>
        <RoomProbe roomCode="bcdf2" />
      </GameSocketProvider>,
    )

    await waitFor(() =>
      expect(mocks.io).toHaveBeenCalledWith(
        'http://localhost:3200',
        expect.any(Object),
      ),
    )
  })

  it('classifies a missing room after watch resume as a server restart', async () => {
    const firstRoom = 'bcdf2'
    const resumedRoom = 'cdfg3'
    mocks.resumeSnapshots.set(resumedRoom, lobbySnapshot(resumedRoom))

    const view = render(
      <GameSocketProvider>
        <RoomProbe roomCode={firstRoom} />
      </GameSocketProvider>,
    )
    await waitFor(() => expect(mocks.io).toHaveBeenCalled())

    view.rerender(
      <GameSocketProvider>
        <RoomProbe roomCode={resumedRoom} />
      </GameSocketProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('lobby'),
    )

    act(() => {
      mocks.handlers.get('room:snapshot')?.({
        status: 'not_found',
        roomCode: resumedRoom,
      } as never)
    })

    expect(screen.getByTestId('ended')).toHaveTextContent('server_restart')
  })

  it('keeps an expired room classified as expired after shutdown', async () => {
    const roomCode = 'bcdf2'
    mocks.resumeSnapshots.set(roomCode, lobbySnapshot(roomCode))
    render(
      <GameSocketProvider>
        <RoomProbe roomCode={roomCode} />
      </GameSocketProvider>,
    )
    await waitFor(() => expect(mocks.io).toHaveBeenCalled())
    act(() => mocks.handlers.get('connect')?.())
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('lobby'),
    )

    act(() => {
      mocks.handlers.get('room:expired')?.({
        roomCode,
        reason: 'idle',
      } as never)
    })

    expect(screen.getByTestId('status')).toHaveTextContent('not_found')
    expect(screen.getByTestId('ended')).toHaveTextContent('expired')

    act(() => mocks.handlers.get('server:shutdown')?.())
    expect(screen.getByTestId('ended')).toHaveTextContent('expired')
  })

  it.each(['create', 'join'] as const)(
    'records membership after a successful %s acknowledgement',
    async (command) => {
      const user = userEvent.setup()
      const roomCode = 'bcdf2'
      mocks.emitWithAck.mockResolvedValue({ status: 'success', roomCode })
      render(
        <GameSocketProvider>
          <MembershipProbe command={command} roomCode={roomCode} />
        </GameSocketProvider>,
      )
      await waitFor(() => expect(mocks.io).toHaveBeenCalled())

      await user.click(screen.getByRole('button', { name: command }))
      await waitFor(() =>
        expect(screen.getByTestId('command-completed')).toHaveTextContent(
          'yes',
        ),
      )
      act(() => mocks.handlers.get('server:shutdown')?.())

      expect(screen.getByTestId('membership-ended')).toHaveTextContent(
        'server_restart',
      )
    },
  )

  it('does not mark an explicitly left room as ended on shutdown', async () => {
    const user = userEvent.setup()
    const roomCode = 'bcdf2'
    mocks.resumeSnapshots.set(roomCode, lobbySnapshot(roomCode))
    render(
      <GameSocketProvider>
        <RoomProbe roomCode={roomCode} />
      </GameSocketProvider>,
    )
    await waitFor(() => expect(mocks.io).toHaveBeenCalled())
    act(() => mocks.handlers.get('connect')?.())
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('lobby'),
    )

    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(mocks.emitWithAck).toHaveBeenCalled())
    act(() => mocks.handlers.get('server:shutdown')?.())

    expect(screen.getByTestId('ended')).toHaveTextContent('active')
  })
})

function lobbySnapshot(roomCode: string): RoomSnapshot {
  return {
    status: 'lobby',
    roomCode,
    revision: 1,
    members: [{ playerId: 'player-1', name: 'Ada', role: 'host' }],
    player: {
      playerId: 'player-1',
      name: 'Ada',
      role: 'host',
      position: null,
    },
  }
}
