'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

import { GameScreen } from '@/components/game-screen'
import {
  type ConnectionStatus,
  type RoomEndedReason,
  useGameSocket,
  useRoomSnapshot,
} from '@/components/game-socket-provider'
import { JoinRoomScreen } from '@/components/join-room-screen'
import {
  RoomInviteActions,
  RoomInviteCard,
} from '@/components/room-invite-card'
import { Button } from '@/components/ui/button'
import {
  isMemberSnapshot,
  type CommandResult,
  type RoomSnapshot,
} from '@/lib/game-protocol'
import type { MatchClaimPayload } from '@/lib/match-claim'
import { generateClientToken } from '@/lib/player-session'

const noopJoined = () => {}

type RoomView = RoomSnapshot
type LobbyView = Extract<RoomView, { status: 'lobby' }>
type LeavingSnapshot = {
  view: LobbyView
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
  endedReason: RoomEndedReason | null
  connectionStatus: ConnectionStatus
}) {
  const router = useRouter()
  const { leaveRoom, removePlayer, startGame, claimMatch, prepareRematch } =
    useGameSocket()
  const [leavingSnapshot, setLeavingSnapshot] =
    useState<LeavingSnapshot | null>(null)
  const leaveRequestLockedRef = useRef(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const handleLeaveRoom = async (currentView: LobbyView) => {
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
      commandId: crypto.randomUUID?.() ?? generateClientToken(),
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

  if (!leavingSnapshot && endedReason) {
    return <RoomEnded roomCode={roomCode} reason={endedReason} />
  }

  if (displayedRoomView === undefined) {
    return <RoomEntrySkeleton />
  }

  if (
    !leavingSnapshot &&
    connectionStatus !== 'connected' &&
    isMemberSnapshot(displayedRoomView)
  ) {
    return (
      <RoomReconnecting
        roomCode={displayedRoomView.roomCode}
        isGame={displayedRoomView.status === 'playing'}
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
      return <GameClosed roomCode={displayedRoomView.roomCode} />
    case 'removed_from_room':
      return (
        <RoomEnded roomCode={displayedRoomView.roomCode} reason="removed" />
      )
    case 'lobby':
      return (
        <ConnectedRoomLobby
          view={displayedRoomView}
          isLeaving={leavingSnapshot !== null}
          isStarting={leavingSnapshot ? false : isStarting}
          leaveError={leavingSnapshot ? null : leaveError}
          startError={leavingSnapshot ? null : startError}
          onLeave={() => handleLeaveRoom(displayedRoomView)}
          onRemovePlayer={(playerId) => removePlayer(roomCode, playerId)}
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
  onRemovePlayer,
  onStart,
}: {
  view: LobbyView
  isLeaving: boolean
  isStarting: boolean
  leaveError: string | null
  startError: string | null
  onLeave: () => void
  onRemovePlayer: (playerId: string) => Promise<CommandResult>
  onStart: () => void
}) {
  const isHost = view.player.role === 'host'
  const [removalTarget, setRemovalTarget] = useState<
    LobbyView['members'][number] | null
  >(null)
  const [removalAnnouncement, setRemovalAnnouncement] = useState('')
  const removalTriggerRef = useRef<HTMLButtonElement | null>(null)
  const rosterHeadingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!removalAnnouncement) return
    const timeout = window.setTimeout(() => setRemovalAnnouncement(''), 2_000)
    return () => window.clearTimeout(timeout)
  }, [removalAnnouncement])

  const closeRemovalDialog = () => {
    setRemovalTarget(null)
    queueMicrotask(() => {
      const trigger = removalTriggerRef.current
      if (trigger?.isConnected) trigger.focus()
      else rosterHeadingRef.current?.focus()
    })
  }

  const finishRemoval = (name: string) => {
    setRemovalTarget(null)
    setRemovalAnnouncement(`${name} was removed from the room.`)
    queueMicrotask(() => rosterHeadingRef.current?.focus())
  }

  return (
    <main
      className="flex min-h-screen items-center px-5 py-10 sm:px-8"
      aria-busy={isLeaving || isStarting}
    >
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 shadow-sm sm:p-10">
        <div>
          <h1 className="text-center text-4xl leading-[1.05] font-bold tracking-[-0.04em] text-balance sm:text-5xl">
            lobby<span className="text-accent">.</span>
          </h1>
          <RoomInviteCard roomCode={view.roomCode} />
          <RoomInviteActions roomCode={view.roomCode} />
        </div>

        <div className="mt-8 border-t pt-7">
          <div className="flex items-baseline justify-between gap-4">
            <h2
              ref={rosterHeadingRef}
              className="text-xl font-semibold tracking-tight outline-none"
              tabIndex={-1}
            >
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
                <span className="min-w-0 font-semibold break-words">
                  {member.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
                    {member.playerId === view.player.playerId
                      ? member.role === 'host'
                        ? 'You · Host'
                        : 'You'
                      : member.role === 'host'
                        ? 'Host'
                        : 'Player'}
                  </span>
                  {isHost &&
                  member.role === 'player' &&
                  member.playerId !== view.player.playerId ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-9 px-3 text-xs"
                      disabled={isLeaving || isStarting}
                      aria-label={`Remove ${member.name} from room`}
                      onClick={(event) => {
                        removalTriggerRef.current = event.currentTarget
                        setRemovalAnnouncement('')
                        setRemovalTarget(member)
                      }}
                    >
                      Remove
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="sr-only" role="status" aria-live="polite">
            {removalAnnouncement}
          </p>
        </div>

        <div className="mt-8 grid min-h-10 justify-items-center gap-3">
          {isHost ? (
            <>
              <Button
                type="button"
                disabled={isLeaving || isStarting}
                onClick={onStart}
              >
                {isStarting ? 'Starting…' : 'Start game'}
              </Button>
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
      {removalTarget ? (
        <RemovePlayerDialog
          member={removalTarget}
          onCancel={closeRemovalDialog}
          onRemove={onRemovePlayer}
          onRemoved={() => finishRemoval(removalTarget.name)}
        />
      ) : null}
    </main>
  )
}

function RemovePlayerDialog({
  member,
  onCancel,
  onRemove,
  onRemoved,
}: {
  member: LobbyView['members'][number]
  onCancel: () => void
  onRemove: (playerId: string) => Promise<CommandResult>
  onRemoved: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const requestLockedRef = useRef(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()
  }, [])

  const close = () => {
    if (!isRemoving) onCancel()
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ) ?? [],
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements.at(-1)
    if (!firstElement || !lastElement) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  const requestRemoval = async () => {
    if (requestLockedRef.current) return
    requestLockedRef.current = true
    setIsRemoving(true)
    setRemoveError(null)

    try {
      const result = await onRemove(member.playerId)
      if (result.status === 'success') {
        onRemoved()
        return
      }
      setRemoveError(result.message)
    } catch {
      setRemoveError(`Unable to remove ${member.name}. Please try again.`)
    }

    requestLockedRef.current = false
    setIsRemoving(false)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5">
      <div
        ref={dialogRef}
        className="bg-card w-full max-w-md rounded-[2rem] border p-7 shadow-2xl sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isRemoving}
        onKeyDown={handleKeyDown}
      >
        <p className="text-accent text-xs font-bold tracking-[0.16em] uppercase">
          Host action
        </p>
        <h2
          id={titleId}
          className="mt-3 text-2xl font-semibold tracking-[-0.03em] break-words"
        >
          Remove {member.name}?
        </h2>
        <p
          id={descriptionId}
          className="text-muted-foreground mt-3 text-sm leading-6"
        >
          They’ll be removed from this lobby and won’t be able to rejoin this
          room.
        </p>
        {removeError ? (
          <p className="mt-4 text-sm font-semibold text-red-700" role="alert">
            {removeError}
          </p>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {isRemoving ? `Removing ${member.name}…` : ''}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={isRemoving}
            onClick={close}
          >
            Keep player
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            disabled={isRemoving}
            onClick={() => void requestRemoval()}
          >
            {isRemoving ? 'Removing…' : `Remove ${member.name}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function GameClosed({ roomCode }: { roomCode: string }) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          This game has already finished.
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          Joining is closed once a game ends. If the host starts a rematch, the
          room opens again from the lobby.
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
  const isSoloGame = scoreboard.length === 1
  const isWinner = player.playerId === winner.playerId
  const isHost = player.role === 'host'
  const orderedScoreboard = [...scoreboard].sort(
    (left, right) => right.score - left.score || left.position - right.position,
  )
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
          {isSoloGame
            ? 'Solo game complete!'
            : isWinner
              ? 'You won!'
              : `${winner.name} wins!`}
        </p>
        <p className="text-muted-foreground mt-2 text-sm leading-6 sm:text-base">
          {isSoloGame
            ? `You scored ${winner.score} points, ${player.name}.`
            : isWinner
              ? `Great match, ${player.name}.`
              : `Thanks for playing, ${player.name}.`}
        </p>

        <div className="mt-8 text-left">
          <h2 className="text-lg font-semibold">Final scoreboard</h2>
          <ol className="mt-3 grid gap-2">
            {orderedScoreboard.map((entry) => {
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
                      {isSoloGame
                        ? 'You'
                        : isWinningPlayer
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
  reason: RoomEndedReason
}) {
  const wasRemoved = reason === 'removed'

  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          Room {roomCode}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {wasRemoved
            ? 'You were removed from this room.'
            : 'This room has ended.'}
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
          {wasRemoved
            ? 'The host removed you from the lobby. You can’t rejoin this room, even with a different name. Create a new room or join another one to keep playing.'
            : reason === 'expired'
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
          {wasRemoved ? (
            <Button asChild variant="outline">
              <Link href="/home">Go home</Link>
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function assertNever(value: never): never {
  throw new Error(`Unhandled room view: ${JSON.stringify(value)}`)
}
