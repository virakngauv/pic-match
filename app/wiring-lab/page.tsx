import type { Metadata } from 'next'

import { WiringLabPage } from '@/components/wiring-lab-page'

export const metadata: Metadata = {
  title: 'Wiring Lab — Spot It',
  description: 'Integration diagnostics for the Spot It app.',
}

export default function WiringLabRoute() {
  return <WiringLabPage />
}
