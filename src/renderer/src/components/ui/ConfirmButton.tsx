import { useEffect, useState } from 'react'
import { Button } from './Button'

interface ConfirmButtonProps {
  onConfirm: () => void | Promise<void>
  label?: string
  confirmLabel?: string
  variant?: 'danger' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  disabled?: boolean
}

/** Two-step destructive action: click shows "Confirm?", a second click runs it. */
export function ConfirmButton({
  onConfirm,
  label = 'Delete',
  confirmLabel = 'Confirm?',
  variant = 'danger',
  size = 'sm',
  disabled
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  return (
    <Button
      variant={variant}
      size={size}
      disabled={disabled || busy}
      onClick={async () => {
        if (!armed) {
          setArmed(true)
          return
        }
        setBusy(true)
        try {
          await onConfirm()
        } finally {
          setBusy(false)
          setArmed(false)
        }
      }}
    >
      {busy ? 'Working…' : armed ? confirmLabel : label}
    </Button>
  )
}
