import type { SQLOutputValue } from 'node:sqlite'

export type Row = Record<string, SQLOutputValue>

/** Narrow a column value to a string; anything else becomes ''. */
export function str(value: SQLOutputValue | undefined): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return ''
}

export function nullableStr(value: SQLOutputValue | undefined): string | null {
  if (value === null || value === undefined) return null
  const text = str(value)
  return text === '' ? null : text
}

/** Narrow a column value to a number; bigint and numeric strings are converted. */
export function num(value: SQLOutputValue | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function nullableNum(value: SQLOutputValue | undefined): number | null {
  if (value === null || value === undefined) return null
  return num(value)
}

export function boolInt(value: SQLOutputValue | undefined): 0 | 1 {
  return num(value) === 0 ? 0 : 1
}

/** Narrow to one of a fixed set of literals, falling back when the DB holds something unexpected. */
export function oneOf<T extends string>(value: SQLOutputValue | undefined, allowed: readonly T[], fallback: T): T {
  const text = str(value)
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback
}
