import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GameNavigation } from './game-navigation'

function renderNavigation({
  isLeaving = false,
  leaveError = null,
  onGoHome = vi.fn(),
  onLeaveRoom = vi.fn(),
}: Partial<React.ComponentProps<typeof GameNavigation>> = {}) {
  const props = { isLeaving, leaveError, onGoHome, onLeaveRoom }
  const result = render(<GameNavigation {...props} />)

  return { ...result, props }
}

describe('GameNavigation', () => {
  it('offers Home directly and through the compact room menu', async () => {
    const user = userEvent.setup()
    const onGoHome = vi.fn()
    renderNavigation({ onGoHome })

    await user.click(screen.getByRole('button', { name: 'Home' }))
    expect(onGoHome).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Room menu' }))
    const actions = screen.getByLabelText('Room actions')
    await user.click(within(actions).getByRole('button', { name: 'Home' }))

    expect(onGoHome).toHaveBeenCalledTimes(2)
    expect(screen.queryByLabelText('Room actions')).not.toBeInTheDocument()
  })

  it('explains explicit departure and restores focus after canceling', async () => {
    const user = userEvent.setup()
    renderNavigation()
    const leaveTrigger = screen.getByRole('button', { name: 'Leave room' })

    await user.click(leaveTrigger)

    const dialog = screen.getByRole('dialog', { name: 'Leave this room?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('may not be able to rejoin')
    expect(
      within(dialog).getByRole('button', { name: 'Stay in game' }),
    ).toHaveFocus()

    await user.click(
      within(dialog).getByRole('button', { name: 'Stay in game' }),
    )

    await waitFor(() => expect(leaveTrigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores focus to the compact Leave room action after canceling', async () => {
    const user = userEvent.setup()
    renderNavigation()

    await user.click(screen.getByRole('button', { name: 'Room menu' }))
    const actions = screen.getByLabelText('Room actions')
    const compactLeaveTrigger = within(actions).getByRole('button', {
      name: 'Leave room',
    })
    await user.click(compactLeaveTrigger)
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Stay in game',
      }),
    )

    await waitFor(() => expect(compactLeaveTrigger).toHaveFocus())
    expect(screen.getByLabelText('Room actions')).toBeInTheDocument()
  })

  it('traps keyboard focus and lets Escape cancel only before submission', async () => {
    const user = userEvent.setup()
    const { rerender, props } = renderNavigation()
    const leaveTrigger = screen.getByRole('button', { name: 'Leave room' })

    await user.click(leaveTrigger)
    const dialog = screen.getByRole('dialog')
    const stayButton = within(dialog).getByRole('button', {
      name: 'Stay in game',
    })
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Leave room',
    })

    stayButton.focus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(confirmButton).toHaveFocus()
    await user.tab()
    expect(stayButton).toHaveFocus()

    rerender(<GameNavigation {...props} isLeaving />)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('submits once, locks the dialog, and exposes a retry after failure', async () => {
    const user = userEvent.setup()
    const onLeaveRoom = vi.fn()
    const { rerender, props } = renderNavigation({ onLeaveRoom })

    await user.click(screen.getByRole('button', { name: 'Leave room' }))
    const dialog = screen.getByRole('dialog')
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Leave room',
    })
    await user.dblClick(confirmButton)

    expect(onLeaveRoom).toHaveBeenCalledOnce()

    rerender(<GameNavigation {...props} isLeaving />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Leaving the room…')).toHaveAttribute(
      'role',
      'status',
    )
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Leaving…',
      }),
    ).toBeDisabled()

    rerender(
      <GameNavigation
        {...props}
        leaveError="Unable to leave the room. Please try again."
      />,
    )
    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent(
      'Unable to leave the room. Please try again.',
    )
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Try leaving again',
      }),
    )

    expect(onLeaveRoom).toHaveBeenCalledTimes(2)
  })
})
