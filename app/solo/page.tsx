import type { Metadata } from 'next'

import { SoloFlow } from '@/components/solo-flow'

export const metadata: Metadata = {
  title: 'Solo — Pic Match',
  description:
    'Match as many pairs as you can in a quick, browser-only Pic Match run.',
}

export default function SoloPage() {
  return <SoloFlow />
}
