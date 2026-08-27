'use client'

import { ClerkProvider } from '@clerk/nextjs'
import type { ReactNode } from 'react'

import { GameSocketProvider } from '@/components/game-socket-provider'
import { PlayerSessionProvider } from '@/components/player-session-provider'

export function Providers({ children }: { children: ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  let content = (
    <PlayerSessionProvider>
      <GameSocketProvider>{children}</GameSocketProvider>
    </PlayerSessionProvider>
  )

  if (clerkKey) {
    content = <ClerkProvider publishableKey={clerkKey}>{content}</ClerkProvider>
  }

  return content
}
