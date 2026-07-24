import type { Metadata } from 'next'

import { JoinRoomScreen } from '@/components/join-room-screen'

export const metadata: Metadata = {
  title: 'Join a Room — Spot It',
}

export default function JoinRoomPage() {
  return <JoinRoomScreen />
}
