import { IntegrationLab } from '@/components/integration-lab'
import { Button } from '@/components/ui/button'
import { StackOverview } from '@/components/stack-overview'

const integrationState = [
  ['Core app', 'ready'],
  ['Game server', 'checked below'],
  ['Clerk', process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'live' : 'demo'],
  ['PostHog', process.env.NEXT_PUBLIC_POSTHOG_KEY ? 'live' : 'demo'],
  ['Arcjet', process.env.ARCJET_KEY ? 'live' : 'demo'],
] as const

export function WiringLabPage() {
  return (
    <main>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <a
          href="#top"
          className="text-lg font-bold tracking-tight"
          aria-label="Spot It home"
        >
          spot it<span className="text-accent">.</span>
        </a>
        <span className="bg-card text-muted-foreground rounded-full border px-3 py-1.5 text-xs font-semibold">
          wiring lab / v0.1
        </span>
      </header>

      <section
        id="top"
        className="mx-auto grid min-h-[650px] w-full max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-24"
      >
        <div className="max-w-3xl">
          <p className="text-accent mb-5 text-xs font-bold tracking-[0.18em] uppercase">
            Production-ready foundation
          </p>
          <h1 className="max-w-3xl text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-7xl">
            Your app stack, wired for the first commit.
          </h1>
          <p className="text-muted-foreground mt-7 max-w-xl text-base leading-7 sm:text-lg">
            A lean Next.js starting point with the frontend, backend hooks,
            auth, analytics, security, and test layers already mapped out.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <a href="#wiring-lab">Try the wiring</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="#stack-title">Explore the stack</a>
            </Button>
          </div>
        </div>

        <aside className="bg-foreground text-background overflow-hidden rounded-3xl shadow-xl">
          <div className="border-background/15 border-b px-6 py-5">
            <p className="text-background/60 font-mono text-xs">terminal</p>
            <p className="mt-3 font-mono text-sm">
              <span className="text-accent">$</span> pnpm dev
            </p>
          </div>
          <dl className="divide-background/10 divide-y px-6">
            {integrationState.map(([label, status]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-6 py-4"
              >
                <dt className="text-sm font-medium">{label}</dt>
                <dd className="text-background/60 flex items-center gap-2 font-mono text-xs">
                  <span
                    className={`size-1.5 rounded-full ${status === 'ready' ? 'bg-accent' : 'bg-background/30'}`}
                    aria-hidden="true"
                  />
                  {status}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </section>

      <IntegrationLab />
      <StackOverview />

      <section id="setup" className="bg-card border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="text-muted-foreground mb-3 text-xs font-bold tracking-[0.18em] uppercase">
              From zero to local
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Three small steps.
            </h2>
          </div>
          <ol className="space-y-3">
            {[
              ['01', 'Copy .env.example to .env.local'],
              ['02', 'Run pnpm dev to start the web and game servers'],
              ['03', 'Add service keys when each integration is needed'],
            ].map(([number, text]) => (
              <li
                key={number}
                className="bg-background flex gap-4 rounded-2xl border p-5"
              >
                <span className="text-muted-foreground font-mono text-xs">
                  {number}
                </span>
                <span className="text-sm font-semibold">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  )
}
