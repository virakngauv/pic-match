import type { Metadata } from 'next'

import { CardLayoutGallery } from '@/components/card-layout-gallery'

export const metadata: Metadata = {
  title: 'Card layout gallery — Spot It',
  description: 'Visual review fixture for the fixed Spot It card templates.',
}

export default function CardLayoutGalleryPage() {
  return <CardLayoutGallery />
}
