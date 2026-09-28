import { SoloPlay } from '@/components/solo-play'
import { parseSoloChallenge } from '@/lib/solo-mode'

export default async function SoloPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string; target?: string }>
}) {
  const params = await searchParams
  const { seed, target } = parseSoloChallenge(params.seed, params.target)
  return <SoloPlay seed={seed} target={target} />
}
