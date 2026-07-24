import type { Metadata } from 'next'

import { JoinRoomScreen } from '@/components/join-room-screen'

export const metadata: Metadata = {
  title: 'Join a Room — Spot It',
}

export default async function JoinRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ roomCode?: string | string[] }>
}) {
  const { roomCode: roomCodeParam } = await searchParams
  const roomCode =
    typeof roomCodeParam === 'string' ? roomCodeParam : roomCodeParam?.[0]
  const normalizedRoomCode = roomCode?.trim().toLowerCase()
  const roomCodeLocked = Boolean(normalizedRoomCode)

  return (
    <JoinRoomScreen
      initialRoomCode={normalizedRoomCode}
      roomCodeLocked={roomCodeLocked}
    />
  )
}
