import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800 border-zinc-900 disabled:bg-zinc-400',
  secondary: 'bg-white text-zinc-900 hover:bg-zinc-50 border-zinc-300',
  ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100 border-transparent',
  danger: 'bg-white text-red-600 hover:bg-red-50 border-red-200'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  const sizing = size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}

export function ButtonSpinner({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {children}
    </>
  )
}
