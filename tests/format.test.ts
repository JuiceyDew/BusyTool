import { describe, expect, it } from 'vitest'
import { centsToInput, formatCents, isValidCurrency, parseAmountToCents } from '../src/shared/money'

describe('formatCents', () => {
  it('formats whole amounts with grouping and two decimals', () => {
    expect(formatCents(125000, 'USD')).toBe('$1,250.00')
  })

  it('formats zero', () => {
    expect(formatCents(0, 'USD')).toBe('$0.00')
  })

  it('formats negative amounts (discount lines)', () => {
    expect(formatCents(-5000, 'USD')).toBe('-$50.00')
  })

  it('formats fractional cents by rounding to the cent', () => {
    expect(formatCents(1, 'USD')).toBe('$0.01')
    expect(formatCents(999, 'USD')).toBe('$9.99')
  })

  it('honours the currency code', () => {
    expect(formatCents(125000, 'EUR')).toBe('€1,250.00')
  })

  it('falls back to USD on an invalid currency code', () => {
    expect(formatCents(125000, 'NOPE')).toBe('$1,250.00')
  })
})

describe('isValidCurrency', () => {
  it('accepts USD and rejects junk', () => {
    expect(isValidCurrency('USD')).toBe(true)
    expect(isValidCurrency('ZZZZ')).toBe(false)
  })
})

describe('parseAmountToCents', () => {
  it('parses plain and formatted amounts', () => {
    expect(parseAmountToCents('1250')).toBe(125000)
    expect(parseAmountToCents('1250.00')).toBe(125000)
    expect(parseAmountToCents('1,250.5')).toBe(125050)
    expect(parseAmountToCents('$12.34')).toBe(1234)
  })

  it('supports negative amounts', () => {
    expect(parseAmountToCents('-50')).toBe(-5000)
  })

  it('returns null for unusable input', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('-')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
  })
})

describe('centsToInput', () => {
  it('renders an editable decimal', () => {
    expect(centsToInput(125000)).toBe('1250.00')
    expect(centsToInput(0)).toBe('0.00')
  })
})
