import type { Metadata } from 'next'

import { SoloStart } from '@/components/solo-start'
import { parseSoloChallenge } from '@/lib/solo-mode'

export const metadata: Metadata = {
  title: 'Solo — Pic Match',
  description:
    'Match as many pairs as you can in a quick, browser-only Pic Match run.',
}

export default async function SoloPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string; target?: string }>
}) {
  const params = await searchParams
  const { seed, target } = parseSoloChallenge(params.seed, params.target)
  return <SoloStart seed={seed} target={target} />
}
