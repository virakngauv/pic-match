import { redirect } from 'next/navigation'

import { SoloResults } from '@/components/solo-results'
import { parseSoloChallenge, parseSoloScoreParam } from '@/lib/solo-mode'

export default async function SoloResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string; score?: string; target?: string }>
}) {
  const params = await searchParams
  const score = parseSoloScoreParam(params.score)
  if (score === null) redirect('/solo')
  const { seed, target } = parseSoloChallenge(params.seed, params.target)
  return <SoloResults seed={seed} score={score} target={target} />
}
