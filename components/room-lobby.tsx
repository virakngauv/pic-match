'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { GameScreen } from '@/components/game-screen'
import {
  useGameSocket,
  useRoomSnapshot,
} from '@/components/game-socket-provider'
import { JoinRoomScreen } from '@/components/join-room-screen'
import { Button } from '@/components/ui/button'
import type { RoomSnapshot } from '@/lib/game-protocol'
import type { MatchClaimPayload } from '@/lib/match-claim'

const noopJoined = () => {}

type RoomView = RoomSnapshot
type LobbyView = Extract<RoomView, { status: 'lobby' }>
type LeaveableView = Extract<RoomView, { status: 'lobby' | 'playing' }>
type LeavingSnapshot = {
  view: LeaveableView
}

export function RoomLobby({ roomCode }: { roomCode: string }) {
  const channel = useRoomSnapshot(roomCode)
  return <PresentRoomLobby roomCode={roomCode} {...channel} />
}

function PresentRoomLobby({
  roomCode,
  snapshot: roomView,
  endedReason,
  connectionStatus,
}: {
  roomCode: string
  snapshot: RoomSnapshot | undefined
  endedReason: 'expired' | 'server_restart' | null
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
}) {
  const router = useRouter()
  const { leaveRoom, startGame, claimMatch, prepareRematch } = useGameSocket()
  const [leavingSnapshot, setLeavingSnapshot] =
    useState<LeavingSnapshot | null>(null)
  const leaveRequestLockedRef = useRef(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const handleLeaveRoom = async (currentView: LeaveableView) => {
    if (leaveRequestLockedRef.current) {
      return
    }

    leaveRequestLockedRef.current = true
    setLeavingSnapshot({ view: currentView })
    setLeaveError(null)

    try {
      const result = await leaveRoom(roomCode)
      if (result.status !== 'success') throw new Error(result.message)
      router.push('/home')
    } catch {
      setLeaveError('Unable to leave the room. Please try again.')
      setLeavingSnapshot(null)
      leaveRequestLockedRef.current = false
    }
  }

  const handleGoHome = () => {
    if (!leavingSnapshot) {
      router.push('/home')
    }
  }

  const handleStartGame = async () => {
    if (isStarting) {
      return
    }

    setIsStarting(true)
    setStartError(null)

    try {
      const result = await startGame(roomCode)
      if (result.status !== 'success') setStartError(result.message)
    } catch {
      setStartError('The game server is unavailable. Please try again.')
    } finally {
      setIsStarting(false)
    }
  }

  /** Adds the current room credentials to a local match claim. */
  const handleSubmitMatchClaim = async (claim: MatchClaimPayload) => {
    const result = await claimMatch({
      roomCode,
      commandId: crypto.randomUUID(),
      ...claim,
    })
    if (result.status === 'success') return { status: 'accepted' as const }
    if (result.status === 'stale') return { status: 'stale' as const }
    if (
      (result.status === 'incorrect' || result.status === 'cooldown') &&
      result.cooldownUntil !== undefined
    ) {
      return { status: result.status, cooldownUntil: result.cooldownUntil }
    }
    throw new Error(result.message)
  }

  const displayedRoomView = leavingSnapshot?.view ?? roomView

  if (displayedRoomView === undefined) {
    return <RoomEntrySkeleton />
  }

  if (!leavingSnapshot && endedReason) {
    return <RoomEnded roomCode={roomCode} reason={endedReason} />
  }

  if (
    !leavingSnapshot &&
    connectionStatus !== 'connected' &&
    isMemberView(displayedRoomView)
  ) {
    return (
      <RoomReconnecting
        roomCode={displayedRoomView.roomCode}
        isGame={displayedRoomView.status !== 'lobby'}
      />
    )
  }

  switch (displayedRoomView.status) {
    case 'not_found':
      return <RoomNotFound roomCode={displayedRoomView.roomCode} />
    case 'joinable':
      return (
        <JoinRoomScreen
          roomCode={displayedRoomView.roomCode}
          onJoined={noopJoined}
        />
      )
    case 'game_in_progress':
      return <GameInProgress roomCode={displayedRoomView.roomCode} />
    case 'lobby':
      return (
        <ConnectedRoomLobby
          view={displayedRoomView}
          isLeaving={leavingSnapshot !== null}
          isStarting={leavingSnapshot ? false : isStarting}
          leaveError={leavingSnapshot ? null : leaveError}
          startError={leavingSnapshot ? null : startError}
          onLeave={() => handleLeaveRoom(displayedRoomView)}
          onStart={handleStartGame}
        />
      )
    case 'playing':
      return (
        <GameScreen
          roomCode={displayedRoomView.roomCode}
          player={displayedRoomView.player}
          pairRevision={displayedRoomView.pairRevision}
          cards={displayedRoomView.cards}
          scoreboard={displayedRoomView.scoreboard}
          lastAcceptedClaim={displayedRoomView.lastAcceptedClaim ?? null}
          cooldownUntil={displayedRoomView.cooldownUntil}
          isLeaving={leavingSnapshot !== null}
          leaveError={leaveError}
          onDismissError={() => setLeaveError(null)}
          onGoHome={handleGoHome}
          onLeaveRoom={() => handleLeaveRoom(displayedRoomView)}
          onSubmitClaim={handleSubmitMatchClaim}
        />
      )
    case 'finished':
      return (
        <FinishedRoom
          roomCode={displayedRoomView.roomCode}
          player={displayedRoomView.player}
          winner={displayedRoomView.winner}
          scoreboard={displayedRoomView.scoreboard}
          onPrepareRematch={async () => {
            const result = await prepareRematch(roomCode)
            if (result.status !== 'success') throw new Error(result.message)
          }}
        />
      )
    default:
      return assertNever(displayedRoomView)
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

type FinishedPlayer = {
  playerId: string
  name: string
  role: 'host' | 'player'
  position: number
}

type FinishedScoreboardEntry = FinishedPlayer & {
  score: number
}

/** Presents the persisted winner and final scores to one participant. */
function FinishedRoom({
  roomCode,
  player,
  winner,
  scoreboard,
  onPrepareRematch,
}: {
  roomCode: string
  player: FinishedPlayer
  winner: FinishedScoreboardEntry
  scoreboard: readonly FinishedScoreboardEntry[]
  onPrepareRematch: () => Promise<void>
}) {
  const isWinner = player.playerId === winner.playerId
  const isHost = player.role === 'host'
  const [isPreparingRematch, setIsPreparingRematch] = useState(false)
  const [rematchError, setRematchError] = useState<string | null>(null)

  const handlePrepareRematch = async () => {
    if (!isHost || isPreparingRematch) {
      return
    }

    setIsPreparingRematch(true)
    setRematchError(null)

    try {
      await onPrepareRematch()
    } catch {
      setRematchError('Unable to return to the lobby. Please try again.')
      setIsPreparingRematch(false)
    }
  }

  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-label={`Final results for ${player.name}`}
      aria-busy={isPreparingRematch}
    >
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Game finished.
        </h1>
        <p className="mt-4 text-2xl font-semibold tracking-[-0.03em]">
          {isWinner ? 'You won!' : `${winner.name} wins!`}
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
          {isWinner
            ? `Great match, ${player.name}.`
            : `Thanks for playing, ${player.name}.`}
        </p>

        <div className="mt-8 text-left">
          <h2 className="text-lg font-semibold">Final scoreboard</h2>
          <ol className="mt-3 grid gap-2">
            {scoreboard.map((entry) => {
              const isLocalPlayer = entry.playerId === player.playerId
              const isWinningPlayer = entry.playerId === winner.playerId

              return (
                <li
                  key={entry.playerId}
                  className={
                    isLocalPlayer
                      ? 'border-accent bg-accent/10 flex items-center gap-3 rounded-2xl border px-4 py-3'
                      : 'bg-background flex items-center gap-3 rounded-2xl border px-4 py-3'
                  }
                  aria-current={isLocalPlayer ? 'true' : undefined}
                  data-player-position={entry.position}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {entry.name}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {isWinningPlayer
                        ? isLocalPlayer
                          ? 'Winner · You'
                          : 'Winner'
                        : isLocalPlayer
                          ? 'You'
                          : entry.role === 'host'
                            ? 'Host'
                            : 'Player'}
                    </span>
                  </span>
                  <output
                    className="bg-foreground text-background inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 font-mono text-lg font-bold"
                    aria-label={`${entry.name}'s final score`}
                  >
                    {entry.score}
                  </output>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="mt-8 grid justify-items-center gap-3">
          {isHost ? (
            <Button
              type="button"
              className="min-w-28"
              disabled={isPreparingRematch}
              onClick={handlePrepareRematch}
            >
              {isPreparingRematch ? 'Preparing…' : 'Play again'}
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm leading-6">
              The host can return everyone to the lobby for another game.
            </p>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {isPreparingRematch ? 'Preparing the lobby…' : ''}
          </p>
          {rematchError ? (
            <p className="text-destructive text-sm" role="alert">
              {rematchError}
            </p>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/home">Go home</Link>
          </Button>
        </div>
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

function RoomEnded({
  roomCode,
  reason,
}: {
  roomCode: string
  reason: 'expired' | 'server_restart'
}) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          This room has ended.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          {reason === 'expired'
            ? 'The room expired after a period without game activity.'
            : 'The game server restarted, so its temporary rooms were cleared.'}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/create">Create a new room</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/join">Join another room</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}

function isMemberView(view: RoomSnapshot) {
  return (
    view.status === 'lobby' ||
    view.status === 'playing' ||
    view.status === 'finished'
  )
}

function assertNever(value: never): never {
  throw new Error(`Unhandled room view: ${JSON.stringify(value)}`)
}
