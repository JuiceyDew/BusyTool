import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const BASE =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${BASE} ${className}`} {...rest} />
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${BASE} min-h-20 ${className}`} {...rest} />
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${BASE} pr-8 ${className}`} {...rest} />
}

interface FieldProps {
  label: string
  error?: string | null
  hint?: string
  children: React.ReactNode
}

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : null}
      {!error && hint ? <span className="block text-xs text-zinc-400">{hint}</span> : null}
    </label>
  )
}
