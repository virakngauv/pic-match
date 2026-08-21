'use client'

import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs'
import posthog from 'posthog-js'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useGameSocket } from '@/components/game-socket-provider'
import { cn } from '@/lib/utils'

type TabId = 'react' | 'next' | 'socket' | 'clerk' | 'posthog' | 'arcjet'

const tabs: Array<{ id: TabId; label: string; eyebrow: string }> = [
  { id: 'react', label: 'React', eyebrow: 'State' },
  { id: 'next', label: 'Next.js', eyebrow: 'API' },
  { id: 'socket', label: 'Socket.IO', eyebrow: 'Game server' },
  { id: 'clerk', label: 'Clerk', eyebrow: 'Auth' },
  { id: 'posthog', label: 'PostHog', eyebrow: 'Events' },
  { id: 'arcjet', label: 'Arcjet', eyebrow: 'Security' },
]

type ApiResult = {
  message: string
  detail?: string
  timestamp?: string
  protected?: boolean
  decision?: string
}

export function IntegrationLab() {
  const [activeTab, setActiveTab] = useState<TabId>('react')
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

  return (
    <section
      id="wiring-lab"
      aria-labelledby="wiring-lab-title"
      className="bg-card border-y"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="mb-10 max-w-2xl">
          <p className="text-muted-foreground mb-3 text-xs font-bold tracking-[0.18em] uppercase">
            Interactive wiring lab
          </p>
          <h2
            id="wiring-lab-title"
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Say hello to every layer.
          </h2>
          <p className="text-muted-foreground mt-4 text-sm leading-6 sm:text-base">
            Every tab has a small, observable action. Services without keys run
            in a clearly labeled local demo mode.
          </p>
        </div>

        <div className="bg-background overflow-hidden rounded-3xl border shadow-sm">
          <div
            role="tablist"
            aria-label="Integration demos"
            className="flex gap-2 overflow-x-auto border-b p-3 sm:p-4"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'focus-visible:ring-ring min-w-fit rounded-full px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="block text-[10px] font-bold tracking-[0.14em] uppercase opacity-70">
                  {tab.eyebrow}
                </span>
                <span className="text-sm font-semibold">{tab.label}</span>
              </button>
            ))}
          </div>

          <div
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            className="min-h-[370px] p-6 sm:p-10"
          >
            {activeTab === 'react' && <ReactDemo />}
            {activeTab === 'next' && <NextDemo />}
            {activeTab === 'socket' && <SocketDemo />}
            {activeTab === 'clerk' &&
              (clerkConfigured ? <ClerkDemo /> : <ClerkFallback />)}
            {activeTab === 'posthog' && <PostHogDemo />}
            {activeTab === 'arcjet' && <ArcjetDemo />}
          </div>
        </div>
      </div>
    </section>
  )
}

function DemoShell({
  label,
  title,
  description,
  children,
}: {
  label: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-start">
      <div>
        <p className="text-accent font-mono text-xs">{label}</p>
        <h3 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h3>
        <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-6">
          {description}
        </p>
      </div>
      <div className="bg-card rounded-2xl border p-5 sm:p-6">{children}</div>
    </div>
  )
}

function Output({ children }: { children: ReactNode }) {
  return (
    <output className="bg-foreground text-background mt-4 block min-h-20 rounded-xl p-4 font-mono text-sm leading-6">
      {children}
    </output>
  )
}

function ReactDemo() {
  const [count, setCount] = useState(0)

  return (
    <DemoShell
      label="client component"
      title="Hello from React state."
      description="A tiny client-side interaction proves hydration, event handling, and component state are working."
    >
      <p className="text-sm font-semibold">Hello count</p>
      <Output>
        {count === 0 ? 'Waiting for a hello…' : `Hello × ${count}`}
      </Output>
      <Button className="mt-4" onClick={() => setCount((value) => value + 1)}>
        Say hello
      </Button>
    </DemoShell>
  )
}

function NextDemo() {
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function callApi() {
    setLoading(true)
    try {
      const response = await fetch('/api/hello')
      setResult((await response.json()) as ApiResult)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DemoShell
      label="GET /api/hello"
      title="Hello from the server."
      description="This calls a Next.js route handler and renders the JSON response in the browser."
    >
      <p className="text-sm font-semibold">Route response</p>
      <Output>
        {result ? (
          <>
            {result.message}
            <span className="text-background/55 block">{result.timestamp}</span>
          </>
        ) : (
          'No request yet.'
        )}
      </Output>
      <Button className="mt-4" onClick={callApi} disabled={loading}>
        {loading ? 'Calling…' : 'Call API route'}
      </Button>
    </DemoShell>
  )
}

function SocketDemo() {
  const { connectionStatus } = useGameSocket()

  return (
    <DemoShell
      label="GameSocketProvider"
      title="Hello from the game server."
      description="This reads the Socket.IO connection used for ephemeral multiplayer rooms."
    >
      <p className="text-sm font-semibold">Connection status</p>
      <Output>
        {connectionStatus === 'connected'
          ? 'Connected · game server ready'
          : connectionStatus === 'connecting'
            ? 'Connecting to the game server…'
            : 'Game server disconnected'}
      </Output>
    </DemoShell>
  )
}

function ClerkFallback() {
  return (
    <DemoShell
      label="NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
      title="Hello from authentication."
      description="The Clerk provider stays dormant without credentials, keeping the starter runnable for everyone."
    >
      <p className="text-sm font-semibold">Session status</p>
      <Output>Demo mode · Clerk key not configured</Output>
      <p className="text-muted-foreground mt-4 text-xs leading-5">
        Add the Clerk keys from .env.example to enable sign-in and user data.
      </p>
    </DemoShell>
  )
}

function ClerkDemo() {
  const { isLoaded, isSignedIn, user } = useUser()

  return (
    <DemoShell
      label="ClerkProvider + useUser"
      title="Hello from authentication."
      description="This reads the active Clerk session and exposes sign-in or the current user control."
    >
      <p className="text-sm font-semibold">Session status</p>
      <Output>
        {!isLoaded
          ? 'Loading Clerk…'
          : isSignedIn
            ? `Hello, ${user.firstName ?? user.primaryEmailAddress?.emailAddress ?? 'signed-in user'}!`
            : 'Clerk is ready · no active session'}
      </Output>
      <div className="mt-4">
        {isSignedIn ? (
          <UserButton />
        ) : (
          <div className="flex flex-wrap gap-3">
            <SignInButton mode="modal">
              <Button>Sign in with Clerk</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button variant="outline">Create an account</Button>
            </SignUpButton>
          </div>
        )}
      </div>
    </DemoShell>
  )
}

function PostHogDemo() {
  const configured = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
  const [capturedAt, setCapturedAt] = useState<string | null>(null)

  function captureHello() {
    if (configured) {
      posthog.capture('hello_world_clicked', { source: 'wiring_lab' })
    }
    setCapturedAt(new Date().toLocaleTimeString())
  }

  return (
    <DemoShell
      label="posthog.capture"
      title="Hello from analytics."
      description="The button emits a named product event when PostHog is configured and always mirrors the action locally for easy testing."
    >
      <p className="text-sm font-semibold">Event status</p>
      <Output>
        {capturedAt
          ? `${configured ? 'Captured' : 'Simulated'} hello_world_clicked at ${capturedAt}`
          : `${configured ? 'Live' : 'Demo'} mode · no event yet`}
      </Output>
      <Button className="mt-4" onClick={captureHello}>
        Capture hello event
      </Button>
    </DemoShell>
  )
}

function ArcjetDemo() {
  const [result, setResult] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function testProtection() {
    setLoading(true)
    try {
      const response = await fetch('/api/arcjet-demo', { method: 'POST' })
      setResult((await response.json()) as ApiResult)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DemoShell
      label="POST /api/arcjet-demo"
      title="Hello through the security layer."
      description="This calls a route that runs Arcjet Shield when ARCJET_KEY is present, with a transparent demo response otherwise."
    >
      <p className="text-sm font-semibold">Protection result</p>
      <Output>
        {result ? (
          <>
            {result.message}
            <span className="text-background/55 block">
              {result.protected ? `live · ${result.decision}` : result.detail}
            </span>
          </>
        ) : (
          'No request yet.'
        )}
      </Output>
      <Button className="mt-4" onClick={testProtection} disabled={loading}>
        {loading ? 'Checking…' : 'Test protected route'}
      </Button>
    </DemoShell>
  )
}
