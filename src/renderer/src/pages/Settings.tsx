import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { call } from '../lib/api'
import { InvoiceDocument } from '../components/InvoiceDocument'
import { useAsync } from '../lib/useAsync'
import { currencyOptions, formatCents } from '@shared/money'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { showError } from '../lib/toast'
import type { UpdateCheckResponse, UpdateEnvironment } from '@shared/ipc'
import type { InvoiceDetail, Settings } from '@shared/types'

export function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const state = useAsync(async () => {
    const [settings, dataPath] = await Promise.all([call('settings:get', {}), call('app:dataPath', {})])
    return { settings: settings as Settings, dataPath: dataPath as string }
  }, [])

  // A real invoice to preview the design against; the newest one is the most representative.
  const preview = useAsync(async () => {
    const invoices = await call('invoices:list', {})
    const first = invoices[0]
    if (!first) return null
    const detail = await call('invoices:get', { id: first.id })
    return detail ? { detail: detail as InvoiceDetail, invoiceId: first.id } : null
  }, [])

  if (state.loading && !state.data) return <Loading />
  if (!state.data) return <p className="text-sm text-red-600">{state.error ?? 'Could not load settings.'}</p>

  return (
    <div>
      <PageHeader title="Settings" description="Currency, business details and invoice defaults." />
      <SettingsForm
        settings={state.data.settings}
        dataPath={state.data.dataPath}
        saved={saved}
        preview={preview.data ?? null}
        invoiceId={preview.data?.invoiceId ?? null}
        onSaved={() => {
          setSaved(true)
          state.reload()
          preview.reload()
        }}
      />
    </div>
  )
}

type SettingsToggle = {
  key:
    | 'showLogo'
    | 'showPhone'
    | 'showWebsite'
    | 'showTaxId'
    | 'showPaymentInstructions'
    | 'showTerms'
    | 'showNotes'
    | 'showFooter'
    | 'showQuantity'
  label: string
  hint: string
}

const TOGGLES: SettingsToggle[] = [
  { key: 'showPaymentInstructions', label: 'How to pay', hint: 'Bank details or payment link' },
  { key: 'showTerms', label: 'Due date and terms', hint: 'Printed date plus Net N' },
  { key: 'showPhone', label: 'Phone number', hint: 'In your details block' },
  { key: 'showWebsite', label: 'Website', hint: 'In your details block' },
  { key: 'showTaxId', label: 'Tax ID', hint: 'EIN, VAT or GST number' },
  { key: 'showLogo', label: 'Logo', hint: 'Only when one is uploaded' },
  { key: 'showQuantity', label: 'Quantity and rate', hint: 'Adds columns when a line has qty ≠ 1' },
  { key: 'showNotes', label: 'Notes', hint: 'The note typed on the invoice' },
  { key: 'showFooter', label: 'Footer', hint: 'Closing line at the bottom' }
]

function SettingsForm({
  settings,
  dataPath,
  saved,
  preview,
  invoiceId,
  onSaved
}: {
  settings: Settings
  dataPath: string
  saved: boolean
  preview: { detail: InvoiceDetail } | null
  invoiceId: number | null
  onSaved: () => void
}) {
  const [form, setForm] = useState<Settings>(settings)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [terms, setTerms] = useState(String(settings.paymentTermsDays))

  useEffect(() => {
    setForm(settings)
    setTerms(String(settings.paymentTermsDays))
  }, [settings])

  const currencies = currencyOptions()

  const pickLogo = async (): Promise<void> => {
    try {
      const picked = await call('app:pickLogo', {})
      if (picked.canceled || !picked.dataUrl) return
      setForm((current) => ({ ...current, logoData: picked.dataUrl as string }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load that image.'
      setError(message)
      showError(message)
    }
  }

  const submit = async (): Promise<void> => {
    const paymentTermsDays = Number(terms)
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365) {
      setError('Payment terms must be a whole number of days between 0 and 365.')
      return
    }
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(form.accentColor)) {
      setError('Accent colour must be a hex value like #18181b.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await call('settings:update', { ...form, paymentTermsDays })
      onSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save settings.'
      setError(message)
      showError(message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Business details" subtitle="Your side of every invoice." />
          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Business name">
                <Input
                  value={form.businessName}
                  onChange={(event) => setForm({ ...form, businessName: event.target.value })}
                />
              </Field>
              <Field label="Email" hint="Where clients reply about payment.">
                <Input
                  value={form.businessEmail}
                  onChange={(event) => setForm({ ...form, businessEmail: event.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone">
                <Input
                  value={form.businessPhone}
                  onChange={(event) => setForm({ ...form, businessPhone: event.target.value })}
                />
              </Field>
              <Field label="Website">
                <Input
                  value={form.businessWebsite}
                  onChange={(event) => setForm({ ...form, businessWebsite: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Address" hint="Street, city, postal code, country.">
              <Textarea
                className="min-h-16"
                value={form.businessAddress}
                onChange={(event) => setForm({ ...form, businessAddress: event.target.value })}
              />
            </Field>
            <Field label="Tax ID" hint="EIN, VAT or GST number. Clients need it for their records.">
              <Input
                value={form.businessTaxId}
                onChange={(event) => setForm({ ...form, businessTaxId: event.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="How to pay"
            subtitle="The single most useful block on an invoice — it is what gets you paid."
          />
          <div className="space-y-3 p-4">
            <Field
              label="Payment instructions"
              hint="Bank name, account number, routing/SWIFT, or a payment link. Printed in a highlighted box."
            >
              <Textarea
                className="min-h-24 font-mono text-xs"
                placeholder={'Bank transfer — Chase\nAcme Studio LLC\nRouting 021000021 · Account 1234567890'}
                value={form.paymentInstructions}
                onChange={(event) => setForm({ ...form, paymentInstructions: event.target.value })}
              />
            </Field>
            <Field label="Footer" hint="A closing line: thanks, contact details, or a late-fee note.">
              <Textarea
                className="min-h-16"
                value={form.invoiceFooter}
                onChange={(event) => setForm({ ...form, invoiceFooter: event.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Invoice design" subtitle="Control what appears and how it looks." />
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Accent colour" hint="Used for the rule, the due date and the total.">
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label="Accent colour"
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-zinc-300 bg-white p-0.5"
                    value={form.accentColor}
                    onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
                  />
                  <Input
                    value={form.accentColor}
                    onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
                  />
                </div>
              </Field>
              <Field label="Logo" hint="PNG or SVG under 1.5 MB. Shown top-left.">
                <div className="flex items-center gap-2">
                  {form.logoData ? (
                    <img
                      src={form.logoData}
                      alt="Logo preview"
                      className="h-9 w-14 rounded border border-zinc-200 object-contain"
                    />
                  ) : (
                    <span className="flex h-9 w-14 items-center justify-center rounded border border-dashed border-zinc-300 text-[10px] text-zinc-400">
                      none
                    </span>
                  )}
                  <Button size="sm" onClick={pickLogo} disabled={pending}>
                    {form.logoData ? 'Replace' : 'Upload'}
                  </Button>
                  {form.logoData ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, logoData: '' })}
                      disabled={pending}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </Field>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-zinc-600">Show on the invoice</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {TOGGLES.map(({ key, label, hint }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-2.5 py-2 hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-zinc-900"
                      checked={form[key]}
                      onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                    />
                    <span>
                      <span className="block text-xs font-medium text-zinc-700">{label}</span>
                      <span className="block text-[11px] text-zinc-400">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Numbering and currency" />
          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Currency">
                <Select
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                >
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Invoice prefix">
                <Input
                  value={form.invoicePrefix}
                  onChange={(event) => setForm({ ...form, invoicePrefix: event.target.value })}
                />
              </Field>
              <Field label="Payment terms (days)">
                <Input value={terms} inputMode="numeric" onChange={(event) => setTerms(event.target.value)} />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={submit} disabled={pending}>
                {pending ? <ButtonSpinner>Saving…</ButtonSpinner> : 'Save settings'}
              </Button>
              {saved && !pending ? <span className="text-xs text-emerald-600">Saved</span> : null}
            </div>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardHeader
            title="Preview"
            subtitle="Live — this is the layout the PDF uses."
            actions={
              invoiceId ? (
                <Link to={`/invoices/${invoiceId}/print`} className="text-xs text-zinc-500 hover:text-zinc-900">
                  Open invoice
                </Link>
              ) : null
            }
          />
          {preview ? (
            <div className="bg-zinc-50 p-3">
              <InvoiceDocument
                detail={preview.detail}
                settings={{ ...form, paymentTermsDays: Number(terms) || 0 }}
                className="rounded-lg border border-zinc-200 p-4 text-[10px]"
              />
            </div>
          ) : (
            <p className="p-4 text-xs text-zinc-500">
              Add a client and an invoice to see a live preview here.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Data file" subtitle="Copy this file to back up everything." />
          <div className="p-4">
            <p className="break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700">
              {dataPath}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Close BusyTool before copying so the WAL is flushed into the file.
            </p>
          </div>
        </Card>

        <UpdateCard />

        <Card>
          <CardHeader title="Video stats" />
          <div className="space-y-2 p-4 text-xs text-zinc-500">
            <p>TikTok links can be fetched automatically via yt-dlp. Every fetch appends a new row.</p>
            <p>Instagram links are always entered manually — the upstream extractor is unreliable.</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function UpdateCard() {
  const [env, setEnv] = useState<UpdateEnvironment | null>(null)
  const [result, setResult] = useState<UpdateCheckResponse | null>(null)
  const [busy, setBusy] = useState<'check' | 'install' | null>(null)
  const [installed, setInstalled] = useState<string | null>(null)

  useEffect(() => {
    call('app:updateInfo', {})
      .then(setEnv)
      .catch(() => undefined)
  }, [])

  const check = async (): Promise<void> => {
    setBusy('check')
    setInstalled(null)
    try {
      setResult(await call('app:updateCheck', {}))
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not check for updates.')
    } finally {
      setBusy(null)
    }
  }

  const install = async (): Promise<void> => {
    setBusy('install')
    try {
      const outcome = await call('app:updateInstall', {})
      if (outcome.installed) {
        setInstalled(outcome.version ?? null)
        setResult(null)
      } else if (outcome.message) {
        showError(outcome.message)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not install the update.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Updates"
        subtitle={env ? `Version ${env.version}` : 'Version unknown'}
      />
      <div className="space-y-2 p-4 text-xs text-zinc-500">
        {env && !env.canUpdate ? (
          <p>Updates apply to the packaged AppImage. This build is run from source; use git to update.</p>
        ) : (
          <>
            <p>The AppImage replaces itself with the latest GitHub release, verified by checksum.</p>
            <p className="break-all font-mono text-[11px] text-zinc-400">{env?.appImagePath}</p>
          </>
        )}

        {installed ? (
          <p className="text-emerald-600">
            Version {installed} installed. Quit and reopen BusyTool to use it.
          </p>
        ) : null}

        {result?.status === 'current' ? <p>You are on the latest version.</p> : null}
        {result?.status === 'available' && result.version ? (
          <p className="text-zinc-700">
            Version {result.version} is available (you have {result.currentVersion}).
          </p>
        ) : null}
        {result?.message ? <p className="text-zinc-600">{result.message}</p> : null}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={check}
            disabled={busy !== null || (env ? !env.canUpdate : false)}
          >
            {busy === 'check' ? <ButtonSpinner>Checking…</ButtonSpinner> : 'Check for updates'}
          </Button>
          {result?.status === 'available' ? (
            <Button size="sm" variant="primary" onClick={install} disabled={busy !== null}>
              {busy === 'install' ? <ButtonSpinner>Installing…</ButtonSpinner> : `Install ${result.version}`}
            </Button>
          ) : null}
          {result?.notesUrl ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (result.notesUrl) void call('app:openExternal', { url: result.notesUrl })
              }}
            >
              Release notes
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
