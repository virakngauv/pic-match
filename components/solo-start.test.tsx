import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SOLO_STORAGE_KEY } from '@/lib/solo-mode'

import { SoloStart } from './solo-start'

describe('SoloStart', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('invites the player to start a fresh solo run', () => {
    render(<SoloStart seed={null} target={null} />)

    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute(
      'href',
      '/solo/play',
    )
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/home',
    )
    expect(screen.queryByText(/Beat \d/)).not.toBeInTheDocument()
  })

  it('carries a shared challenge onto the play screen', () => {
    render(<SoloStart seed="abc-123" target={23} />)

    expect(screen.getByText('Beat 23')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute(
      'href',
      '/solo/play?seed=abc-123&target=23',
    )
  })

  it('shows the stored personal best', async () => {
    localStorage.setItem(
      SOLO_STORAGE_KEY,
      JSON.stringify({ version: 1, bestScore: 12, lastScore: 3 }),
    )
    render(<SoloStart seed={null} target={null} />)

    expect(await screen.findByText('Personal best: 12')).toBeVisible()
  })
})
