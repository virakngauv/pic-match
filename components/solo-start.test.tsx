import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SoloStart } from './solo-start'

describe('SoloStart', () => {
  it('presents the solo rules like the other entry screens', () => {
    render(<SoloStart />)

    expect(screen.getByRole('heading', { name: 'play solo.' })).toBeVisible()
    expect(screen.queryByText('Ready?')).not.toBeInTheDocument()
    expect(screen.queryByText(/Personal best/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute(
      'href',
      '/solo/play',
    )
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/home',
    )
  })

  it('states the timer and scoring rules with live values', () => {
    render(<SoloStart />)

    expect(
      screen.getByText(/before the 30-second timer runs out/),
    ).toBeVisible()
    expect(screen.getByText(/gets you \+1 second/)).toBeVisible()
    expect(screen.getByText(/wrong tap is −2 seconds/)).toBeVisible()
    expect(screen.getByText(/fresh board/)).toBeVisible()
  })
})
