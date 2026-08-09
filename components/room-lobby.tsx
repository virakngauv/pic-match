'use client'

import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { GameScreen } from '@/components/game-screen'
import { JoinRoomScreen } from '@/components/join-room-screen'
import { usePlayerSession } from '@/components/player-session-provider'
import { Button } from '@/components/ui/button'
import { api } from '@/convex/_generated/api'
import type { MatchClaimPayload } from '@/lib/match-claim'
import { useRoomPresence } from '@/lib/use-room-presence'

const noopJoined = () => {}
const noopAction = () => {}

type RoomView = FunctionReturnType<typeof api.rooms.getRoomView>
type LobbyView = Extract<RoomView, { status: 'lobby' }>
type LeavingSnapshot = {
  view: LobbyView
}

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const { clientToken } = usePlayerSession()

  return <PresentRoomLobby roomCode={roomCode} clientToken={clientToken} />
}

function PresentRoomLobby({
  roomCode,
  clientToken,
}: {
  roomCode: string
  clientToken: string | null | undefined
}) {
  const router = useRouter()
  const leaveRoom = useMutation(api.rooms.leave)
  const startGame = useMutation(api.rooms.start)
  const submitMatchClaim = useMutation(api.gameClaims.submit)
  const [leavingSnapshot, setLeavingSnapshot] =
    useState<LeavingSnapshot | null>(null)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const roomView = useQuery(
    api.rooms.getRoomView,
    clientToken === undefined ? 'skip' : { roomCode, clientToken },
  )
  const hasRoomMembership =
    roomView?.status === 'reconnecting' ||
    roomView?.status === 'lobby' ||
    roomView?.status === 'playing' ||
    roomView?.status === 'finished'

  const presenceStatus = useRoomPresence(
    roomCode,
    clientToken,
    Boolean(clientToken && hasRoomMembership),
  )

  const handleLeaveRoom = async (currentView: LobbyView) => {
    if (!clientToken) {
      return
    }

    setLeavingSnapshot({ view: currentView })
    setLeaveError(null)

    try {
      await leaveRoom({ roomCode, clientToken })
      router.push('/home')
    } catch {
      setLeaveError('Unable to leave the room. Please try again.')
      setLeavingSnapshot(null)
    }
  }

  const handleStartGame = async () => {
    if (!clientToken || isStarting) {
      return
    }

    setIsStarting(true)
    setStartError(null)

    try {
      await startGame({ roomCode, clientToken })
    } catch {
      setStartError('Unable to start the game. Please try again.')
    } finally {
      setIsStarting(false)
    }
  }

  /** Adds the current room credentials to a local match claim. */
  const handleSubmitMatchClaim = async (claim: MatchClaimPayload) => {
    if (!clientToken) {
      throw new Error('A player session is required to submit a match.')
    }

    return await submitMatchClaim({ roomCode, clientToken, ...claim })
  }

  if (leavingSnapshot) {
    return (
      <ConnectedRoomLobby
        view={leavingSnapshot.view}
        isLeaving
        isStarting={false}
        leaveError={null}
        startError={null}
        onLeave={noopAction}
        onStart={noopAction}
      />
    )
  }

  if (roomView === undefined || clientToken === undefined) {
    return <RoomEntrySkeleton />
  }

  if (presenceStatus === 'room-full') {
    return <RoomFull roomCode={roomView.roomCode} />
  }

  switch (roomView.status) {
    case 'not_found':
      return <RoomNotFound roomCode={roomView.roomCode} />
    case 'joinable':
      return (
        <JoinRoomScreen roomCode={roomView.roomCode} onJoined={noopJoined} />
      )
    case 'game_in_progress':
      return <GameInProgress roomCode={roomView.roomCode} />
    case 'reconnecting':
      return (
        <RoomReconnecting
          roomCode={roomView.roomCode}
          isGame={roomView.phase !== 'lobby'}
        />
      )
    case 'lobby':
      return (
        <ConnectedRoomLobby
          view={roomView}
          isLeaving={false}
          isStarting={isStarting}
          leaveError={leaveError}
          startError={startError}
          onLeave={() => handleLeaveRoom(roomView)}
          onStart={handleStartGame}
        />
      )
    case 'playing':
      return (
        <GameScreen
          roomCode={roomView.roomCode}
          player={roomView.player}
          pairRevision={roomView.pairRevision}
          cards={roomView.cards}
          scoreboard={roomView.scoreboard}
          onSubmitClaim={handleSubmitMatchClaim}
        />
      )
    case 'finished':
      return (
        <FinishedRoom
          roomCode={roomView.roomCode}
          name={roomView.player.name}
        />
      )
    default:
      return assertNever(roomView)
  }
}

function RoomEntrySkeleton() {
  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-busy="true"
      aria-label="Checking room access"
    >
      <section
        className="bg-card mx-auto w-full max-w-lg rounded-[2rem] border p-7 shadow-sm sm:p-10"
        aria-hidden="true"
      >
        <div className="bg-muted h-3 w-24 animate-pulse rounded-full" />
        <div className="bg-muted mt-5 h-12 w-4/5 animate-pulse rounded-2xl" />
        <div className="bg-muted mt-4 h-5 w-full animate-pulse rounded-full" />
        <div className="bg-muted mt-2 h-5 w-2/3 animate-pulse rounded-full" />
        <div className="bg-muted mt-8 h-11 w-full animate-pulse rounded-xl" />
        <div className="bg-muted mt-5 h-11 w-full animate-pulse rounded-xl" />
        <div className="bg-muted mt-8 h-12 w-full animate-pulse rounded-full" />
      </section>
    </main>
  )
}

function ConnectedRoomLobby({
  view,
  isLeaving,
  isStarting,
  leaveError,
  startError,
  onLeave,
  onStart,
}: {
  view: LobbyView
  isLeaving: boolean
  isStarting: boolean
  leaveError: string | null
  startError: string | null
  onLeave: () => void
  onStart: () => void
}) {
  const isHost = view.player.role === 'host'
  const canStart = view.members.length >= 2

  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-busy={isLeaving || isStarting}
    >
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 shadow-sm sm:p-10">
        <div className="text-center">
          <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
            Room lobby
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Ready to play.
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
            Share this room code with the people you want to play with, or join
            when you’re ready.
          </p>
          <output className="bg-foreground text-background mt-8 block rounded-2xl px-5 py-6 font-mono text-3xl font-bold tracking-[0.22em] uppercase sm:text-4xl">
            {view.roomCode}
          </output>
        </div>

        <div className="mt-8 border-t pt-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">
              In this room
            </h2>
            <span className="text-muted-foreground text-sm">
              {view.members.length}{' '}
              {view.members.length === 1 ? 'player' : 'players'}
            </span>
          </div>
          <ul className="mt-4 grid gap-2" aria-label="Players in this room">
            {view.members.map((member) => (
              <li
                key={member.playerId}
                className="bg-background flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
              >
                <span className="font-semibold">{member.name}</span>
                <span className="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
                  {member.playerId === view.player.playerId
                    ? member.role === 'host'
                      ? 'You · Host'
                      : 'You'
                    : member.role === 'host'
                      ? 'Host'
                      : 'Player'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid min-h-10 justify-items-center gap-3">
          {isHost ? (
            <>
              <Button
                type="button"
                disabled={isLeaving || isStarting || !canStart}
                onClick={onStart}
                aria-describedby={
                  !canStart ? 'start-game-requirement' : undefined
                }
              >
                {isStarting ? 'Starting…' : 'Start game'}
              </Button>
              {!canStart ? (
                <p
                  id="start-game-requirement"
                  className="text-muted-foreground text-center text-sm"
                >
                  At least 2 players are needed to start.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-center text-sm">
              Waiting for the host to start the game.
            </p>
          )}
          {startError ? (
            <p className="text-destructive text-sm" role="alert">
              {startError}
            </p>
          ) : null}
          {leaveError ? (
            <p className="text-destructive text-sm" role="alert">
              {leaveError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={isLeaving || isStarting}
            onClick={onLeave}
          >
            {isLeaving ? 'Leaving…' : 'Leave room'}
          </Button>
        </div>
      </section>
    </main>
  )
}

function RoomFull({ roomCode }: { roomCode: string }) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Sorry, this room is full.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          All available player spots are currently taken.
        </p>
        <Button asChild className="mt-8">
          <Link href="/home">Go home</Link>
        </Button>
      </section>
    </main>
  )
}

function GameInProgress({ roomCode }: { roomCode: string }) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          This game has already started.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          New players can’t join after the participant list is locked.
        </p>
        <Button asChild className="mt-8">
          <Link href="/home">Go home</Link>
        </Button>
      </section>
    </main>
  )
}

function FinishedRoom({ roomCode, name }: { roomCode: string; name: string }) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Game finished.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Thanks for playing, {name}. Results will appear here when scoring is
          added.
        </p>
        <Button asChild className="mt-8">
          <Link href="/home">Go home</Link>
        </Button>
      </section>
    </main>
  )
}

function RoomReconnecting({
  roomCode,
  isGame,
}: {
  roomCode: string
  isGame: boolean
}) {
  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-busy="true"
    >
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Reconnecting to {isGame ? 'your game' : 'the room'}…
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Your player identity is safe. We’re restoring this connection.
        </p>
      </section>
    </main>
  )
}

function RoomNotFound({ roomCode }: { roomCode: string }) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Sorry, room {roomCode} doesn’t exist.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          You can return home or create a new room to start playing.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/create">Create a new room</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/home">Go home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}

function assertNever(value: never): never {
  throw new Error(`Unhandled room view: ${JSON.stringify(value)}`)
}
