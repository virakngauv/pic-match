'use client'

import { ClerkProvider, useAuth } from '@clerk/nextjs'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect, useMemo, type ReactNode } from 'react'

import { PlayerSessionProvider } from '@/components/player-session-provider'

export function Providers({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const posthogHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

  const convex = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  )

  useEffect(() => {
    if (posthogKey) {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        defaults: '2025-11-30',
        capture_pageview: true,
      })
    }
  }, [posthogHost, posthogKey])

  let content = <PlayerSessionProvider>{children}</PlayerSessionProvider>

  if (convex) {
    content = clerkKey ? (
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {content}
      </ConvexProviderWithClerk>
    ) : (
      <ConvexProvider client={convex}>{content}</ConvexProvider>
    )
  }

  if (posthogKey) {
    content = <PostHogProvider client={posthog}>{content}</PostHogProvider>
  }

  if (clerkKey) {
    content = <ClerkProvider publishableKey={clerkKey}>{content}</ClerkProvider>
  }

  return content
}
