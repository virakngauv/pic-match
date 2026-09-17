'use client'

import { Button } from '@/components/ui/button'

export function ReloadPageButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      className={className}
      onClick={() => window.location.reload()}
    >
      Reload page
    </Button>
  )
}
