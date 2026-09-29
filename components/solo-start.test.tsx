import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SoloStart } from './solo-start'

describe('SoloStart', () => {
  it('presents the solo rules like the other entry screens', () => {
    const onStart = vi.fn()
    render(<SoloStart onStart={onStart} />)

    expect(
      screen.getByRole('heading', { name: 'play solo game.' }),
    ).toBeVisible()
    expect(screen.queryByText('Ready?')).not.toBeInTheDocument()
    expect(screen.queryByText(/Personal best/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play solo game' }))
    expect(onStart).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/home',
    )
  })

  it('lists the timer and scoring rules with live values', () => {
    render(<SoloStart onStart={() => {}} />)

    const rules = screen.getByRole('list')
    expect(rules).toBeVisible()
    expect(rules).toHaveTextContent('timer: 30 seconds')
    expect(rules).toHaveTextContent('matching symbol: +1 second')
    expect(rules).toHaveTextContent('wrong symbol: −3 seconds')
  })
})
