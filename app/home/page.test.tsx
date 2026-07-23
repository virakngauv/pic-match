import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import HomePage from './page'

describe('HomePage', () => {
  it('links to the create and join room flows', () => {
    render(<HomePage />)

    expect(screen.getByRole('link', { name: 'Create a room' })).toHaveAttribute(
      'href',
      '/create',
    )
    expect(screen.getByRole('link', { name: 'Join a room' })).toHaveAttribute(
      'href',
      '/join',
    )
  })
})
