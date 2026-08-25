import type { Metadata } from 'next'

import { WiringLabPage } from '@/components/wiring-lab-page'

export const metadata: Metadata = {
  title: 'Wiring Lab — Pic Match',
  description: 'Integration diagnostics for the Pic Match app.',
}

export default function WiringLabRoute() {
  return <WiringLabPage />
}
