const groups = [
  {
    eyebrow: 'Frontend',
    title: 'Fast by default',
    description: 'React 19, Next.js App Router, Tailwind CSS, and shadcn/ui.',
    items: ['React', 'Next.js', 'Tailwind CSS', 'shadcn/ui'],
  },
  {
    eyebrow: 'Platform',
    title: 'Ready for real users',
    description: 'Provider boundaries are wired and stay dormant without keys.',
    items: ['Convex', 'Clerk', 'PostHog', 'Arcjet'],
  },
  {
    eyebrow: 'Quality',
    title: 'Confidence on every commit',
    description: 'Linting, formatting, unit, integration, and browser tests.',
    items: ['ESLint', 'Prettier', 'Vitest + RTL', 'Playwright'],
  },
]

export function StackOverview() {
  return (
    <section
      aria-labelledby="stack-title"
      className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="mb-10 max-w-2xl">
        <p className="text-muted-foreground mb-3 text-xs font-bold tracking-[0.18em] uppercase">
          The foundation
        </p>
        <h2
          id="stack-title"
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          One stack. Clear responsibilities.
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((group, index) => (
          <article
            key={group.eyebrow}
            className="bg-card flex min-h-80 flex-col rounded-3xl border p-6 shadow-sm sm:p-8"
          >
            <div className="mb-10 flex items-center justify-between">
              <span className="text-muted-foreground text-xs font-bold tracking-[0.16em] uppercase">
                {group.eyebrow}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                0{index + 1}
              </span>
            </div>
            <h3 className="text-2xl font-semibold tracking-tight">
              {group.title}
            </h3>
            <p className="text-muted-foreground mt-3 text-sm leading-6">
              {group.description}
            </p>
            <ul
              className="mt-auto grid grid-cols-2 gap-2 pt-8"
              aria-label={`${group.eyebrow} tools`}
            >
              {group.items.map((item) => (
                <li
                  key={item}
                  className="bg-muted rounded-xl px-3 py-2 text-sm font-medium"
                >
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}
