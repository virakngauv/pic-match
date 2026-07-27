'use client'

import { useMutation } from 'convex/react'
import { useState, type ComponentProps, type FormEvent } from 'react'

import { usePlayerSession } from '@/components/player-session-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'

const ROOM_CODE_PATTERN = /^[bcdfghkpqrstvz]{4}[2-9y]$/

export type JoinedRoom = { roomCode: string }

export function JoinRoomForm({
  roomCode,
  onJoined,
}: {
  roomCode?: string
  onJoined?: (room: JoinedRoom) => void
}) {
  const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

  if (!convexConfigured) {
    return <UnavailableJoinRoomForm roomCode={roomCode} />
  }

  return <ConnectedJoinRoomForm roomCode={roomCode} onJoined={onJoined} />
}

function UnavailableJoinRoomForm({ roomCode }: { roomCode?: string }) {
  const roomCodeLocked = roomCode !== undefined

  return (
    <div className="mt-7 grid gap-5">
      <Field
        label="Room code"
        id="room-code"
        placeholder="bcdf2"
        value={roomCode ?? ''}
        readOnly={roomCodeLocked}
        disabled
      />
      <Field label="Name" id="name" placeholder="Your name" disabled />
      <p className="text-muted-foreground text-sm" role="status">
        Room joining is unavailable until Convex is configured.
      </p>
      <Button className="h-12 w-full text-base" disabled>
        Join
      </Button>
    </div>
  )
}

function ConnectedJoinRoomForm({
  roomCode,
  onJoined,
}: {
  roomCode?: string
  onJoined?: (room: JoinedRoom) => void
}) {
  const roomCodeLocked = roomCode !== undefined
  const joinRoom = useMutation(api.rooms.join)
  const { ensureClientToken } = usePlayerSession()
  const [enteredRoomCode, setEnteredRoomCode] = useState(roomCode ?? '')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedRoomCode = enteredRoomCode.trim().toLowerCase()
    const normalizedName = name.trim()

    if (!ROOM_CODE_PATTERN.test(normalizedRoomCode)) {
      setError('Enter a valid five-character room code.')
      return
    }

    if (!normalizedName) {
      setError('Enter your name to join the room.')
      return
    }

    setError(null)
    setIsJoining(true)

    try {
      const clientToken = ensureClientToken()
      const room = await joinRoom({
        roomCode: normalizedRoomCode,
        name: normalizedName,
        clientToken,
      })

      if (!room) {
        setError('We couldn’t find that room. Check the code and try again.')
        setIsJoining(false)
        return
      }

      onJoined?.({ roomCode: room.roomCode })
    } catch {
      setError('The room could not be checked. Please try again.')
      setIsJoining(false)
    }
  }

  return (
    <form className="mt-7" onSubmit={handleSubmit}>
      <div className="grid gap-5">
        <Field
          label="Room code"
          id="room-code"
          name="roomCode"
          placeholder="bcdf2"
          value={enteredRoomCode}
          onChange={(event) => setEnteredRoomCode(event.target.value)}
          maxLength={5}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono tracking-[0.15em] lowercase"
          autoFocus={!roomCodeLocked}
          readOnly={roomCodeLocked}
          required
          disabled={isJoining}
        />
        <Field
          label="Name"
          id="name"
          name="name"
          placeholder="Your name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={50}
          autoFocus={roomCodeLocked}
          required
          disabled={isJoining}
        />
      </div>
      <p
        className="text-accent mt-3 min-h-5 text-sm"
        role="alert"
        aria-live="polite"
      >
        {error}
      </p>
      <Button className="mt-2 h-12 w-full text-base" disabled={isJoining}>
        {isJoining ? 'Joining…' : 'Join'}
      </Button>
    </form>
  )
}

function Field({
  label,
  id,
  className,
  ...props
}: { label: string; id: string } & ComponentProps<typeof Input>) {
  return (
    <div>
      <label className="text-sm font-semibold" htmlFor={id}>
        {label}
      </label>
      <Input id={id} className={cn('mt-2', className)} {...props} />
    </div>
  )
}
