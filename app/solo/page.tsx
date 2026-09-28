import type { Metadata } from 'next'

import { SoloStart } from '@/components/solo-start'

export const metadata: Metadata = {
  title: 'Solo — Pic Match',
  description:
    'Match as many pairs as you can in a quick, browser-only Pic Match run.',
}

export default function SoloPage() {
  return <SoloStart />
}
