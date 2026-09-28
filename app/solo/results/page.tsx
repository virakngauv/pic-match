import { redirect } from 'next/navigation'

import { SoloResults } from '@/components/solo-results'
import { parseSoloScoreParam } from '@/lib/solo-mode'

export default async function SoloResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ score?: string }>
}) {
  const params = await searchParams
  const score = parseSoloScoreParam(params.score)
  if (score === null) redirect('/solo')
  return <SoloResults score={score} />
}
