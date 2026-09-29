'use client'

import { useState } from 'react'

import { SoloPlay } from '@/components/solo-play'
import { SoloResults } from '@/components/solo-results'
import { SoloStart } from '@/components/solo-start'

type SoloPhase =
  | Readonly<{ name: 'rules' }>
  | Readonly<{ name: 'play' }>
  | Readonly<{ name: 'results'; score: number }>

export function SoloFlow() {
  const [phase, setPhase] = useState<SoloPhase>({ name: 'rules' })

  if (phase.name === 'play') {
    return (
      <SoloPlay onFinish={(score) => setPhase({ name: 'results', score })} />
    )
  }

  if (phase.name === 'results') {
    return (
      <SoloResults
        score={phase.score}
        onPlayAgain={() => setPhase({ name: 'play' })}
      />
    )
  }

  return <SoloStart onStart={() => setPhase({ name: 'play' })} />
}
