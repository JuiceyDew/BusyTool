const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string): Intl.NumberFormat {
  const cached = formatters.get(currency)
  if (cached) return cached
  let fmt: Intl.NumberFormat
  try {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency })
  } catch {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
  }
  formatters.set(currency, fmt)
  return fmt
}

/** Format integer cents as currency. Fixed en-US locale so UI and PDF always agree. */
export function formatCents(cents: number, currency: string): string {
  return formatterFor(currency).format(cents / 100)
}

export function currencyOptions(): string[] {
  return Intl.supportedValuesOf('currency')
}

export function isValidCurrency(code: string): boolean {
  return currencyOptions().includes(code)
}

/** Parse a user-entered amount ("1,250.005", "$12") into integer cents. Returns null when invalid. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

/** Render integer cents for an editable amount input, e.g. 125000 -> "1250.00". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}
