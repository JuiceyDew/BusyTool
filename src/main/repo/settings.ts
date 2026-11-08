import type { DatabaseSync } from 'node:sqlite'
import { isValidCurrency } from '../../shared/money'
import type { Settings } from '../../shared/types'
import { boolInt, num, str, type Row } from '../rows'

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  businessName: '',
  businessEmail: '',
  businessAddress: '',
  invoicePrefix: 'INV',
  paymentTermsDays: 14,
  businessPhone: '',
  businessWebsite: '',
  businessTaxId: '',
  paymentInstructions: '',
  invoiceFooter: '',
  accentColor: '#18181b',
  logoData: '',
  showLogo: true,
  showPhone: true,
  showWebsite: true,
  showTaxId: true,
  showPaymentInstructions: true,
  showTerms: true,
  showNotes: true,
  showFooter: true,
  showQuantity: true
}

/** #rgb / #rrggbb only: the value goes straight into an inline style, so keep it a literal. */
export function isValidAccent(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}

const COLUMNS = `currency, business_name, business_email, business_address, invoice_prefix,
  payment_terms_days, business_phone, business_website, business_tax_id, payment_instructions,
  invoice_footer, accent_color, logo_data, show_logo, show_phone, show_website, show_tax_id,
  show_payment_instructions, show_terms, show_notes, show_footer, show_quantity`

function mapSettings(row: Row): Settings {
  return {
    currency: str(row.currency) || DEFAULT_SETTINGS.currency,
    businessName: str(row.business_name),
    businessEmail: str(row.business_email),
    businessAddress: str(row.business_address),
    invoicePrefix: str(row.invoice_prefix) || DEFAULT_SETTINGS.invoicePrefix,
    paymentTermsDays: num(row.payment_terms_days),
    businessPhone: str(row.business_phone),
    businessWebsite: str(row.business_website),
    businessTaxId: str(row.business_tax_id),
    paymentInstructions: str(row.payment_instructions),
    invoiceFooter: str(row.invoice_footer),
    accentColor: str(row.accent_color) || DEFAULT_SETTINGS.accentColor,
    logoData: str(row.logo_data),
    showLogo: boolInt(row.show_logo) === 1,
    showPhone: boolInt(row.show_phone) === 1,
    showWebsite: boolInt(row.show_website) === 1,
    showTaxId: boolInt(row.show_tax_id) === 1,
    showPaymentInstructions: boolInt(row.show_payment_instructions) === 1,
    showTerms: boolInt(row.show_terms) === 1,
    showNotes: boolInt(row.show_notes) === 1,
    showFooter: boolInt(row.show_footer) === 1,
    showQuantity: boolInt(row.show_quantity) === 1
  }
}

export function getSettings(db: DatabaseSync): Settings {
  const row = db.prepare(`SELECT ${COLUMNS} FROM settings WHERE id = 1`).get()
  return row ? mapSettings(row) : { ...DEFAULT_SETTINGS }
}

export function updateSettings(db: DatabaseSync, input: Settings): Settings {
  if (!isValidCurrency(input.currency)) throw new Error(`Unknown currency code: ${input.currency}`)
  if (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0 || input.paymentTermsDays > 365) {
    throw new Error('Payment terms must be a whole number of days between 0 and 365.')
  }
  if (!isValidAccent(input.accentColor)) {
    throw new Error('Accent colour must be a hex value like #18181b.')
  }
  const prefix = input.invoicePrefix.trim() || DEFAULT_SETTINGS.invoicePrefix
  db.prepare(
    `INSERT INTO settings(id, currency, business_name, business_email, business_address, invoice_prefix,
       payment_terms_days, business_phone, business_website, business_tax_id, payment_instructions,
       invoice_footer, accent_color, logo_data, show_logo, show_phone, show_website, show_tax_id,
       show_payment_instructions, show_terms, show_notes, show_footer, show_quantity)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       currency = excluded.currency,
       business_name = excluded.business_name,
       business_email = excluded.business_email,
       business_address = excluded.business_address,
       invoice_prefix = excluded.invoice_prefix,
       payment_terms_days = excluded.payment_terms_days,
       business_phone = excluded.business_phone,
       business_website = excluded.business_website,
       business_tax_id = excluded.business_tax_id,
       payment_instructions = excluded.payment_instructions,
       invoice_footer = excluded.invoice_footer,
       accent_color = excluded.accent_color,
       logo_data = excluded.logo_data,
       show_logo = excluded.show_logo,
       show_phone = excluded.show_phone,
       show_website = excluded.show_website,
       show_tax_id = excluded.show_tax_id,
       show_payment_instructions = excluded.show_payment_instructions,
       show_terms = excluded.show_terms,
       show_notes = excluded.show_notes,
       show_footer = excluded.show_footer,
       show_quantity = excluded.show_quantity`
  ).run(
    input.currency,
    input.businessName.trim(),
    input.businessEmail.trim(),
    input.businessAddress.trim(),
    prefix,
    input.paymentTermsDays,
    input.businessPhone.trim(),
    input.businessWebsite.trim(),
    input.businessTaxId.trim(),
    input.paymentInstructions.trim(),
    input.invoiceFooter.trim(),
    input.accentColor,
    input.logoData,
    input.showLogo ? 1 : 0,
    input.showPhone ? 1 : 0,
    input.showWebsite ? 1 : 0,
    input.showTaxId ? 1 : 0,
    input.showPaymentInstructions ? 1 : 0,
    input.showTerms ? 1 : 0,
    input.showNotes ? 1 : 0,
    input.showFooter ? 1 : 0,
    input.showQuantity ? 1 : 0
  )
  return getSettings(db)
}
