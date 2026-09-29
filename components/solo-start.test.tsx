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

  it('lists the timer and scoring rules with live values', () => {
    render(<SoloStart />)

    const rules = screen.getByRole('list')
    expect(rules).toBeVisible()
    expect(rules).toHaveTextContent(
      'goal: tap the one symbol both cards share — either card works',
    )
    expect(rules).toHaveTextContent('timer: 30 seconds')
    expect(rules).toHaveTextContent('matching symbol: +2 seconds')
    expect(rules).toHaveTextContent('wrong symbol: −3 seconds')
  })
})
