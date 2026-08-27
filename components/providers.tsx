'use client'

import type { ReactNode } from 'react'

import { GameSocketProvider } from '@/components/game-socket-provider'
import { PlayerSessionProvider } from '@/components/player-session-provider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PlayerSessionProvider>
      <GameSocketProvider>{children}</GameSocketProvider>
    </PlayerSessionProvider>
  )
}
