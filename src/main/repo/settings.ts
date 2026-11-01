import type { DatabaseSync } from 'node:sqlite'
import { isValidCurrency } from '../../shared/money'
import type { Settings } from '../../shared/types'
import { num, str } from '../rows'

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  businessName: '',
  businessEmail: '',
  businessAddress: '',
  invoicePrefix: 'INV',
  paymentTermsDays: 14
}

export function getSettings(db: DatabaseSync): Settings {
  const row = db
    .prepare(
      `SELECT currency, business_name, business_email, business_address, invoice_prefix, payment_terms_days
       FROM settings WHERE id = 1`
    )
    .get()
  if (!row) return { ...DEFAULT_SETTINGS }
  return {
    currency: str(row.currency) || DEFAULT_SETTINGS.currency,
    businessName: str(row.business_name),
    businessEmail: str(row.business_email),
    businessAddress: str(row.business_address),
    invoicePrefix: str(row.invoice_prefix) || DEFAULT_SETTINGS.invoicePrefix,
    paymentTermsDays: num(row.payment_terms_days)
  }
}

export function updateSettings(db: DatabaseSync, input: Settings): Settings {
  if (!isValidCurrency(input.currency)) throw new Error(`Unknown currency code: ${input.currency}`)
  if (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0 || input.paymentTermsDays > 365) {
    throw new Error('Payment terms must be a whole number of days between 0 and 365.')
  }
  const prefix = input.invoicePrefix.trim() || DEFAULT_SETTINGS.invoicePrefix
  db.prepare(
    `INSERT INTO settings(id, currency, business_name, business_email, business_address, invoice_prefix, payment_terms_days)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       currency = excluded.currency,
       business_name = excluded.business_name,
       business_email = excluded.business_email,
       business_address = excluded.business_address,
       invoice_prefix = excluded.invoice_prefix,
       payment_terms_days = excluded.payment_terms_days`
  ).run(
    input.currency,
    input.businessName.trim(),
    input.businessEmail.trim(),
    input.businessAddress.trim(),
    prefix,
    input.paymentTermsDays
  )
  return getSettings(db)
}
