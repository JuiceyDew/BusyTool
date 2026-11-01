import { useSyncExternalStore } from 'react'

interface ToastState {
  message: string | null
}

let state: ToastState = { message: null }
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showError(message: string): void {
  state = { message }
  emit()
}

export function clearError(): void {
  state = { message: null }
  emit()
}

export function useToastMessage(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => state.message,
    () => state.message
  )
}
