import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StackOverview } from './stack-overview'

describe('StackOverview', () => {
  it('shows the architecture layers from the bootstrap brief', () => {
    render(<StackOverview />)

    expect(
      screen.getByRole('heading', { name: /one stack/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Next.js')).toBeInTheDocument()
    expect(screen.getByText('Socket.IO')).toBeInTheDocument()
    expect(screen.getByText('Playwright')).toBeInTheDocument()
  })
})
