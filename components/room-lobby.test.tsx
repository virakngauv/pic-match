import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RoomLobby } from './room-lobby'

type Player = {
  playerId: string
  name: string
  role: 'host' | 'player'
  position: number | null
}

type GameCard = {
  id: string
  symbolIds: string[]
}

type ScoreboardEntry = Omit<Player, 'position'> & {
  position: number
  score: number
}

type LastAcceptedClaim = {
  scorerId: string
  scorerName: string
  symbolId: string
  pairRevision: number
}

type RoomView =
  | { status: 'not_found'; roomCode: string }
  | { status: 'joinable'; roomCode: string }
  | { status: 'game_in_progress'; roomCode: string }
  | {
      status: 'reconnecting'
      roomCode: string
      phase: 'lobby' | 'playing' | 'finished'
    }
  | {
      status: 'lobby'
      roomCode: string
      members: Array<Omit<Player, 'position'>>
      player: Player
    }
  | {
      status: 'playing'
      roomCode: string
      player: Player
      cooldownUntil: number | null
      pairRevision: number
      cards: GameCard[]
      scoreboard: ScoreboardEntry[]
      lastAcceptedClaim: LastAcceptedClaim | null
    }
  | {
      status: 'finished'
      roomCode: string
      player: Player
      winner: ScoreboardEntry
      scoreboard: ScoreboardEntry[]
    }

const host: Player = {
  playerId: 'member-1',
  name: 'Firefox host',
  role: 'host',
  position: null,
}

const player: Player = {
  playerId: 'member-2',
  name: 'Chrome player',
  role: 'player',
  position: 1,
}

const gameCards: GameCard[] = [
  {
    id: 'card-13',
    symbolIds: [
      'sun',
      'moon',
      'star',
      'heart',
      'cat',
      'rocket',
      'book',
      'anchor',
    ],
  },
  {
    id: 'card-52',
    symbolIds: [
      'cat',
      'flower',
      'apple',
      'bee',
      'turtle',
      'camera',
      'gift',
      'dice',
    ],
  },
]

const gameScoreboard: ScoreboardEntry[] = [
  { ...host, position: 0, score: 0 },
  { ...player, position: 1, score: 0 },
]

function lobbyView(members: Array<Omit<Player, 'position'>> = [host]) {
  return {
    status: 'lobby' as const,
    roomCode: 'frvg7',
    members,
    player: host,
  }
}

function playingView(
  requestingPlayer: Player = player,
  cooldownUntil: number | null = null,
) {
  return {
    status: 'playing' as const,
    roomCode: 'frvg7',
    player: requestingPlayer,
    cooldownUntil,
    pairRevision: 0,
    cards: gameCards,
    scoreboard: gameScoreboard,
    lastAcceptedClaim: null,
  }
}

function finishedView(requestingPlayer: Player = player) {
  const scoreboard = [
    { ...host, position: 0, score: 12 },
    { ...player, position: 1, score: 8 },
  ]

  return {
    status: 'finished' as const,
    roomCode: 'frvg7',
    player: requestingPlayer,
    winner: scoreboard[0],
    scoreboard,
  }
}

const mocks = vi.hoisted(() => ({
  clientToken: 'a'.repeat(32) as string | null | undefined,
  heartbeatEnabled: false,
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  prepareRematch: vi.fn(),
  startGame: vi.fn(),
  submitMatchClaim: vi.fn(),
  presenceStatus: 'connected' as
    'inactive' | 'connecting' | 'connected' | 'room-full',
  queryArgs: undefined as unknown,
  queryName: undefined as unknown,
  roomView: undefined as RoomView | undefined,
  routerPush: vi.fn(),
}))

vi.mock('@/convex/_generated/api', () => ({
  api: {
    gameClaims: { submit: 'submitMatchClaim' },
    presence: { heartbeat: 'heartbeat' },
    rooms: {
      getRoomView: 'getRoomView',
      join: 'join',
      leave: 'leave',
      prepareRematch: 'prepareRematch',
      start: 'start',
    },
  },
}))

vi.mock('convex/react', () => ({
  useMutation: (mutation: string) => {
    if (mutation === 'start') return mocks.startGame
    if (mutation === 'prepareRematch') return mocks.prepareRematch
    if (mutation === 'join') return mocks.joinRoom
    if (mutation === 'submitMatchClaim') return mocks.submitMatchClaim
    return mocks.leaveRoom
  },
  useQuery: (query: string, args: unknown) => {
    mocks.queryName = query
    mocks.queryArgs = args
    return args === 'skip' ? undefined : mocks.roomView
  },
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
    mocks.heartbeatEnabled = false
    mocks.joinRoom.mockReset()
    mocks.leaveRoom.mockReset()
    mocks.leaveRoom.mockResolvedValue(undefined)
    mocks.prepareRematch.mockReset()
    mocks.prepareRematch.mockResolvedValue(null)
    mocks.startGame.mockReset()
    mocks.startGame.mockResolvedValue(null)
    mocks.submitMatchClaim.mockReset()
    mocks.submitMatchClaim.mockResolvedValue({ status: 'accepted' })
    mocks.presenceStatus = 'connected'
    mocks.queryArgs = undefined
    mocks.queryName = undefined
    mocks.roomView = lobbyView()
    mocks.routerPush.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('loads the route from one room-view query', () => {
    render(<RoomLobby roomCode="frvg7" />)

    expect(mocks.queryName).toBe('getRoomView')
    expect(mocks.queryArgs).toEqual({
      roomCode: 'frvg7',
      clientToken: 'a'.repeat(32),
    })
  })

  it('renders a neutral skeleton while the player session hydrates', () => {
    mocks.clientToken = undefined

    render(<RoomLobby roomCode="frvg7" />)

    expect(mocks.queryArgs).toBe('skip')
    expect(
      screen.getByRole('main', { name: 'Checking room access' }),
    ).toHaveAttribute('aria-busy', 'true')
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it('renders a neutral skeleton while the room view is unresolved', () => {
    mocks.roomView = undefined

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('Ready to play.')).not.toBeInTheDocument()
    expect(screen.queryByText('Join your friends.')).not.toBeInTheDocument()
  })

  it('renders the not_found view with recovery actions', () => {
    mocks.roomView = { status: 'not_found', roomCode: 'zzzzz' }

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
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it('renders the joinable view as a locked join form', () => {
    mocks.clientToken = null
    mocks.roomView = { status: 'joinable', roomCode: 'frvg7' }

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByRole('main')).toHaveTextContent('Join your friends.')
    expect(screen.getByLabelText('Room code')).toHaveValue('frvg7')
    expect(screen.getByLabelText('Room code')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it('renders game_in_progress without offering a join form', () => {
    mocks.roomView = { status: 'game_in_progress', roomCode: 'frvg7' }

    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('heading', {
        name: 'This game has already started.',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(mocks.heartbeatEnabled).toBe(false)
  })

  it.each([
    ['lobby', 'Reconnecting to the room…'],
    ['playing', 'Reconnecting to your game…'],
    ['finished', 'Reconnecting to your game…'],
  ] as const)(
    'renders the reconnecting view for the %s destination',
    (phase, heading) => {
      mocks.roomView = { status: 'reconnecting', roomCode: 'frvg7', phase }

      render(<RoomLobby roomCode="frvg7" />)

      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
      expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
      expect(mocks.heartbeatEnabled).toBe(true)
    },
  )

  it('renders the lobby view and identifies the requesting player', () => {
    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('Ready to play.')).toBeInTheDocument()
    expect(screen.getByText('You · Host')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeEnabled()
    expect(mocks.heartbeatEnabled).toBe(true)
  })

  it('renders the participant-specific playing view on refresh', () => {
    mocks.roomView = playingView(player, Date.now() + 1_000)

    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('main', { name: 'Game for Chrome player' }),
    ).toHaveAttribute('data-player-position', '1')
    expect(screen.getByText('Firefox host')).toBeInTheDocument()
    expect(screen.getByLabelText('Shared game board')).toBeInTheDocument()
    expect(screen.getByLabelText("Chrome player's score")).toHaveTextContent(
      '0',
    )
    expect(screen.getByRole('button', { name: 'Cat on card 1' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Cat on card 1' }),
    ).toHaveAttribute('data-incorrect', 'false')
    expect(screen.getByLabelText('Match claim feedback')).toHaveTextContent(
      'Please wait a moment before selecting again.',
    )
    expect(mocks.heartbeatEnabled).toBe(true)
  })

  it('submits the selected pair through the participant mutation', async () => {
    mocks.roomView = playingView()
    render(<RoomLobby roomCode="frvg7" />)

    fireEvent.click(screen.getByRole('button', { name: 'Cat on card 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cat on card 2' }))

    await waitFor(() => {
      expect(mocks.submitMatchClaim).toHaveBeenCalledWith({
        roomCode: 'frvg7',
        clientToken: 'a'.repeat(32),
        pairRevision: 0,
        firstSymbolId: 'cat',
        secondSymbolId: 'cat',
      })
    })
  })

  it.each([
    ['host', { ...host, position: 0 }],
    ['non-host', player],
  ] as const)(
    'lets a %s go Home without explicitly leaving',
    async (_role, requestingPlayer) => {
      mocks.roomView = playingView(requestingPlayer)
      render(<RoomLobby roomCode="frvg7" />)

      fireEvent.click(screen.getByRole('button', { name: 'Home' }))

      expect(mocks.routerPush).toHaveBeenCalledWith('/home')
      expect(mocks.leaveRoom).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['host', { ...host, position: 0 }],
    ['non-host', player],
  ] as const)(
    'confirms and submits one explicit leave for a %s while preserving the board',
    async (_role, requestingPlayer) => {
      let resolveLeave!: () => void
      const leaveRequest = new Promise<void>((resolve) => {
        resolveLeave = resolve
      })
      mocks.leaveRoom.mockReturnValue(leaveRequest)
      mocks.roomView = playingView(requestingPlayer)
      const { rerender } = render(<RoomLobby roomCode="frvg7" />)

      fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
      const dialog = screen.getByRole('dialog', { name: 'Leave this room?' })
      const confirmButton = within(dialog).getByRole('button', {
        name: 'Leave room',
      })
      fireEvent.click(confirmButton)
      fireEvent.click(confirmButton)

      expect(mocks.leaveRoom).toHaveBeenCalledOnce()
      expect(mocks.leaveRoom).toHaveBeenCalledWith({
        roomCode: 'frvg7',
        clientToken: 'a'.repeat(32),
      })
      expect(
        screen.getByRole('main', {
          name: `Game for ${requestingPlayer.name}`,
        }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Shared game board')).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Cat on card 1' }),
      ).toBeDisabled()
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')

      mocks.roomView = { status: 'game_in_progress', roomCode: 'frvg7' }
      rerender(<RoomLobby roomCode="frvg7" />)
      expect(
        screen.getByRole('main', {
          name: `Game for ${requestingPlayer.name}`,
        }),
      ).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')

      await act(async () => resolveLeave())
      await waitFor(() => {
        expect(mocks.routerPush).toHaveBeenCalledWith('/home')
      })
    },
  )

  it('keeps the frozen playing view when the room reports full mid-leave', async () => {
    let resolveLeave!: () => void
    const leaveRequest = new Promise<void>((resolve) => {
      resolveLeave = resolve
    })
    mocks.leaveRoom.mockReturnValue(leaveRequest)
    mocks.roomView = playingView()
    const { rerender } = render(<RoomLobby roomCode="frvg7" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Leave room',
      }),
    )

    mocks.presenceStatus = 'room-full'
    rerender(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.queryByRole('heading', { name: 'Sorry, this room is full.' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('main', { name: `Game for ${player.name}` }),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')

    await act(async () => resolveLeave())
    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith('/home')
    })
  })

  it('keeps gameplay and the confirmation open after a failed leave, then retries', async () => {
    mocks.roomView = playingView()
    mocks.leaveRoom
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(undefined)
    render(<RoomLobby roomCode="frvg7" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Leave room',
      }),
    )

    expect(
      await screen.findByText('Unable to leave the room. Please try again.'),
    ).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Shared game board')).toBeVisible()
    expect(mocks.routerPush).not.toHaveBeenCalled()

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Try leaving again',
      }),
    )

    await waitFor(() => {
      expect(mocks.leaveRoom).toHaveBeenCalledTimes(2)
      expect(mocks.routerPush).toHaveBeenCalledWith('/home')
    })
  })

  it('renders the participant-specific finished view', () => {
    mocks.roomView = finishedView()

    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('heading', { name: 'Game finished.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Firefox host wins!')).toBeVisible()
    expect(screen.getByText(/Thanks for playing, Chrome player/)).toBeVisible()
    expect(
      screen.getByLabelText("Firefox host's final score"),
    ).toHaveTextContent('12')
    expect(
      screen.getByLabelText("Chrome player's final score"),
    ).toHaveTextContent('8')
    expect(
      screen.getAllByRole('listitem').map((entry) => entry.textContent),
    ).toEqual([
      expect.stringContaining('Firefox host'),
      expect.stringContaining('Chrome player'),
    ])
    expect(
      screen.getByText(
        'The host can return everyone to the lobby for another game.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Play again' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(mocks.heartbeatEnabled).toBe(true)
  })

  it('identifies the requesting player when they won', () => {
    mocks.roomView = finishedView({ ...host, position: 0 })

    render(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('You won!')).toBeVisible()
    expect(screen.getByText('Winner · You')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled()
  })

  it('lets the host prepare one rematch while preserving final results', async () => {
    mocks.prepareRematch.mockImplementation(
      () =>
        new Promise<void>(() => {
          // Keep the mutation pending to exercise duplicate prevention.
        }),
    )
    mocks.roomView = finishedView({ ...host, position: 0 })

    render(<RoomLobby roomCode="frvg7" />)

    const playAgainButton = screen.getByRole('button', {
      name: 'Play again',
    })
    fireEvent.click(playAgainButton)
    fireEvent.click(playAgainButton)

    expect(mocks.prepareRematch).toHaveBeenCalledTimes(1)
    expect(mocks.prepareRematch).toHaveBeenCalledWith({
      roomCode: 'frvg7',
      clientToken: 'a'.repeat(32),
    })
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled()
    expect(screen.getByText('Preparing the lobby…')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.getByText('Final scoreboard')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go home' })).toBeVisible()
  })

  it('restores the rematch control after an accessible failure', async () => {
    mocks.prepareRematch.mockRejectedValue(new Error('Network unavailable'))
    mocks.roomView = finishedView({ ...host, position: 0 })

    render(<RoomLobby roomCode="frvg7" />)
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))

    expect(
      await screen.findByText(
        'Unable to return to the lobby. Please try again.',
      ),
    ).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled()
    expect(screen.getByText('Final scoreboard')).toBeVisible()
  })

  it('renders the existing lobby after a successful rematch transition', async () => {
    let resolveRematch!: () => void
    const rematchRequest = new Promise<void>((resolve) => {
      resolveRematch = resolve
    })
    mocks.prepareRematch.mockReturnValue(rematchRequest)
    mocks.roomView = finishedView({ ...host, position: 0 })
    const { rerender } = render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('main', { name: 'Final results for Firefox host' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(mocks.prepareRematch).toHaveBeenCalledWith({
      roomCode: 'frvg7',
      clientToken: 'a'.repeat(32),
    })

    resolveRematch()
    await rematchRequest
    mocks.roomView = lobbyView([host, player])
    rerender(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('Ready to play.')).toBeVisible()
    expect(screen.getByText('Firefox host')).toBeVisible()
    expect(screen.getByText('Chrome player')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled()
  })

  it('follows lobby, playing, and finished server transitions', () => {
    const { rerender } = render(<RoomLobby roomCode="frvg7" />)
    expect(screen.getByText('Ready to play.')).toBeInTheDocument()

    mocks.roomView = playingView({ ...host, position: 0 })
    rerender(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('main', { name: 'Game for Firefox host' }),
    ).toBeInTheDocument()

    mocks.roomView = finishedView({ ...host, position: 0 })
    rerender(<RoomLobby roomCode="frvg7" />)
    expect(
      screen.getByRole('heading', { name: 'Game finished.' }),
    ).toBeInTheDocument()
  })

  it('keeps the host start button disabled until another player joins', () => {
    render(<RoomLobby roomCode="frvg7" />)

    const startButton = screen.getByRole('button', { name: 'Start game' })
    expect(startButton).toBeDisabled()
    expect(startButton).toHaveAttribute(
      'aria-describedby',
      'start-game-requirement',
    )
    expect(
      screen.getByText('At least 2 players are needed to start.'),
    ).toHaveAttribute('id', 'start-game-requirement')
  })

  it('lets the host start once at least two players are in the lobby', async () => {
    mocks.roomView = lobbyView([host, player])

    render(<RoomLobby roomCode="frvg7" />)
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))

    await waitFor(() => {
      expect(mocks.startGame).toHaveBeenCalledWith({
        roomCode: 'frvg7',
        clientToken: 'a'.repeat(32),
      })
    })
  })

  it('restores the start control when starting fails', async () => {
    mocks.roomView = lobbyView([host, player])
    mocks.startGame.mockRejectedValue(new Error('Network unavailable'))

    render(<RoomLobby roomCode="frvg7" />)

    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))

    expect(
      await screen.findByText('Unable to start the game. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled()
  })

  it('shows non-host players a waiting status instead of a start button', () => {
    mocks.roomView = {
      ...lobbyView([host, player]),
      player: { ...player, position: null },
    }

    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByText('Waiting for the host to start the game.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Start game' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the lobby visible while leaving and navigating home', async () => {
    const { rerender } = render(<RoomLobby roomCode="frvg7" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave room' }))

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Firefox host')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leaving…' })).toBeDisabled()

    mocks.roomView = { status: 'joinable', roomCode: 'frvg7' }
    rerender(<RoomLobby roomCode="frvg7" />)

    expect(screen.getByText('Ready to play.')).toBeInTheDocument()
    expect(screen.queryByText('Join your friends.')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith('/home')
    })
  })

  it('restores the lobby when leaving fails', async () => {
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
    mocks.roomView = {
      status: 'reconnecting',
      roomCode: 'frvg7',
      phase: 'lobby',
    }
    mocks.presenceStatus = 'room-full'

    render(<RoomLobby roomCode="frvg7" />)

    expect(
      screen.getByRole('heading', { name: 'Sorry, this room is full.' }),
    ).toBeInTheDocument()
  })
})
