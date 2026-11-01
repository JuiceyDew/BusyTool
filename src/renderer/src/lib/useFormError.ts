import { useState } from 'react'

/**
 * Form error state shared by the modals: any edit clears the last submit error,
 * so a corrected field never keeps a stale message on screen.
 */
export function useFormError(): {
  error: string | null
  setError: (message: string | null) => void
  clearOnEdit: <T>(setter: (value: T) => void) => (value: T) => void
} {
  const [error, setError] = useState<string | null>(null)
  const clearOnEdit =
    <T,>(setter: (value: T) => void) =>
    (value: T): void => {
      setError(null)
      setter(value)
    }
  return { error, setError, clearOnEdit }
}
