import type { Metadata } from 'next'

import { SoloMode } from '@/components/solo-mode'
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
  return <SoloMode initialSeed={seed} target={target} />
}
