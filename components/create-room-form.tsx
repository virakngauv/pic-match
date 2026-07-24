'use client'

import { useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { usePlayerSession } from '@/components/player-session-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/convex/_generated/api'

export function CreateRoomForm() {
  const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)

  if (!convexConfigured) {
    return (
      <div className="mt-7">
        <label className="text-sm font-semibold" htmlFor="name">
          Name
        </label>
        <Input id="name" className="mt-2" disabled placeholder="Your name" />
        <p className="text-muted-foreground mt-3 text-sm" role="status">
          Room creation is unavailable until Convex is configured.
        </p>
        <Button className="mt-5 w-full" disabled>
          Create
        </Button>
      </div>
    )
  }

  return <ConnectedCreateRoomForm />
}

function ConnectedCreateRoomForm() {
  const createRoom = useMutation(api.rooms.create)
  const router = useRouter()
  const { ensureClientToken } = usePlayerSession()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()

    if (!normalizedName) {
      setError('Enter your name to create a room.')
      return
    }

    setError(null)
    setIsCreating(true)

    try {
      const clientToken = ensureClientToken()
      const { roomCode } = await createRoom({
        name: normalizedName,
        clientToken,
      })
      router.push(`/${roomCode}`)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'The room could not be created. Please try again.',
      )
      setIsCreating(false)
    }
  }

  return (
    <form className="mt-7" onSubmit={handleSubmit}>
      <label className="text-sm font-semibold" htmlFor="name">
        Name
      </label>
      <Input
        id="name"
        name="name"
        className="mt-2"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        autoComplete="name"
        maxLength={50}
        autoFocus
        required
        disabled={isCreating}
      />
      <p
        className="text-accent mt-3 min-h-5 text-sm"
        role="alert"
        aria-live="polite"
      >
        {error}
      </p>
      <Button className="mt-2 h-12 w-full text-base" disabled={isCreating}>
        {isCreating ? 'Creating…' : 'Create'}
      </Button>
    </form>
  )
}
