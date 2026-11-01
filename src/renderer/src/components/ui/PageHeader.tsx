import { Link } from 'react-router-dom'

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  )
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <span>{message}</span>
      {onDismiss ? (
        <button className="text-xs uppercase tracking-wide text-red-500 hover:text-red-700" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="text-sm text-zinc-500 hover:text-zinc-900" to={to}>
      ← {label}
    </Link>
  )
}

export function Loading() {
  return <p className="px-1 py-6 text-sm text-zinc-400">Loading…</p>
}
