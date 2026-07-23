import Link from 'next/link'

import { Button } from '@/components/ui/button'

export function RoomPlaceholder({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <main className="flex min-h-screen items-center px-5 py-10 sm:px-8">
      <section className="bg-card mx-auto w-full max-w-xl rounded-[2rem] border p-7 text-center shadow-sm sm:p-10">
        <p className="text-accent text-xs font-bold tracking-[0.18em] uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-md text-sm leading-6 sm:text-base">
          {description}
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild>
            <Link href="/home">Back to home</Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
