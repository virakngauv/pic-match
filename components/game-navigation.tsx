'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

export function GameNavigation({
  isLeaving,
  leaveError,
  onDismissError,
  onGoHome,
  onLeaveRoom,
}: {
  isLeaving: boolean
  leaveError: string | null
  onDismissError: () => void
  onGoHome: () => void
  onLeaveRoom: () => void
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isConfirmingLeave, setIsConfirmingLeave] = useState(false)
  const menuId = useId()
  const dialogTitleId = useId()
  const dialogDescriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const leaveTriggerRef = useRef<HTMLButtonElement | null>(null)
  const leaveRequestedRef = useRef(false)

  useEffect(() => {
    if (isConfirmingLeave) {
      cancelButtonRef.current?.focus()
    }
  }, [isConfirmingLeave])

  useEffect(() => {
    if (!isLeaving && leaveError) {
      leaveRequestedRef.current = false
    }
  }, [isLeaving, leaveError])

  const closeConfirmation = () => {
    if (isLeaving) {
      return
    }

    setIsConfirmingLeave(false)
    onDismissError()
    queueMicrotask(() => leaveTriggerRef.current?.focus())
  }

  const openConfirmation = (trigger: HTMLButtonElement) => {
    leaveTriggerRef.current = trigger
    setIsConfirmingLeave(true)
  }

  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeConfirmation()
      return
    }

    if (event.key !== 'Tab' || isLeaving) {
      return
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ) ?? [],
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements.at(-1)

    if (!firstElement || !lastElement) {
      return
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  const goHome = () => {
    setIsMenuOpen(false)
    onGoHome()
  }

  const requestLeave = () => {
    if (isLeaving || leaveRequestedRef.current) {
      return
    }

    leaveRequestedRef.current = true
    onLeaveRoom()
  }

  return (
    <nav className="game-navigation" aria-label="Room navigation">
      <div className="game-navigation-wide hidden items-center gap-2 sm:flex">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-4"
          disabled={isLeaving}
          onClick={goHome}
        >
          Home
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 px-4"
          disabled={isLeaving}
          onClick={(event) => openConfirmation(event.currentTarget)}
        >
          Leave room
        </Button>
      </div>

      <div className="game-navigation-compact relative sm:hidden">
        <Button
          ref={menuButtonRef}
          type="button"
          variant="outline"
          className="min-h-11 px-4"
          aria-controls={menuId}
          aria-expanded={isMenuOpen}
          disabled={isLeaving}
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        >
          Room menu
        </Button>
        {isMenuOpen ? (
          <div
            id={menuId}
            className="bg-card absolute top-full right-0 z-40 mt-2 grid w-44 gap-2 rounded-2xl border p-2 shadow-lg"
            role="group"
            aria-label="Room actions"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setIsMenuOpen(false)
                queueMicrotask(() => menuButtonRef.current?.focus())
              }
            }}
          >
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={goHome}
            >
              Home
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full"
              onClick={(event) => openConfirmation(event.currentTarget)}
            >
              Leave room
            </Button>
          </div>
        ) : null}
      </div>

      {isConfirmingLeave ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5"
          data-testid="leave-room-backdrop"
        >
          <div
            ref={dialogRef}
            className="bg-card w-full max-w-md rounded-[2rem] border p-7 shadow-2xl sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            aria-busy={isLeaving}
            onKeyDown={handleDialogKeyDown}
          >
            <p className="text-accent text-xs font-bold tracking-[0.16em] uppercase">
              Active game
            </p>
            <h2
              id={dialogTitleId}
              className="mt-3 text-2xl font-semibold tracking-[-0.03em]"
            >
              Leave this room?
            </h2>
            <p
              id={dialogDescriptionId}
              className="text-muted-foreground mt-3 text-sm leading-6"
            >
              You’ll leave the active game and may not be able to rejoin. The
              game will stay open for the other player.
            </p>
            {leaveError ? (
              <p
                className="mt-4 text-sm font-semibold text-red-700"
                role="alert"
              >
                {leaveError}
              </p>
            ) : null}
            <p className="sr-only" role="status" aria-live="polite">
              {isLeaving ? 'Leaving the room…' : ''}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                ref={cancelButtonRef}
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={isLeaving}
                onClick={closeConfirmation}
              >
                Stay in game
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                disabled={isLeaving}
                onClick={requestLeave}
              >
                {isLeaving
                  ? 'Leaving…'
                  : leaveError
                    ? 'Try leaving again'
                    : 'Leave room'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  )
}
