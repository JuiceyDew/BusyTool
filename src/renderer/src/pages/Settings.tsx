import { useEffect, useState } from 'react'
import { call } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { currencyOptions, formatCents } from '@shared/money'
import { Button, ButtonSpinner } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Field, Input, Select, Textarea } from '../components/ui/Input'
import { Loading, PageHeader } from '../components/ui/PageHeader'
import { showError } from '../lib/toast'
import type { Settings } from '@shared/types'

export function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const state = useAsync(async () => {
    const [settings, dataPath] = await Promise.all([call('settings:get', {}), call('app:dataPath', {})])
    return { settings: settings as Settings, dataPath: dataPath as string }
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
        onSaved={() => {
          setSaved(true)
          state.reload()
        }}
      />
    </div>
  )
}

function SettingsForm({
  settings,
  dataPath,
  saved,
  onSaved
}: {
  settings: Settings
  dataPath: string
  saved: boolean
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

  const submit = async (): Promise<void> => {
    const paymentTermsDays = Number(terms)
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365) {
      setError('Payment terms must be a whole number of days between 0 and 365.')
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
      <Card>
        <CardHeader title="Business" subtitle="Printed on every invoice PDF." />
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name">
              <Input
                value={form.businessName}
                onChange={(event) => setForm({ ...form, businessName: event.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.businessEmail}
                onChange={(event) => setForm({ ...form, businessEmail: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Address">
            <Textarea
              value={form.businessAddress}
              onChange={(event) => setForm({ ...form, businessAddress: event.target.value })}
            />
          </Field>
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

      <div className="space-y-4">
        <Card>
          <CardHeader title="Price preview" />
          <div className="space-y-1 p-4 text-sm">
            <p className="tabular-nums text-lg font-semibold">{formatCents(125000, form.currency)}</p>
            <p className="text-xs text-zinc-500">How amounts appear across the app and on PDFs.</p>
            <p className="pt-2 text-xs text-zinc-500">Invoice numbers look like</p>
            <p className="font-mono text-sm">
              {form.invoicePrefix || 'INV'}-{new Date().getFullYear()}-
              {String(1).padStart(3, '0')}
            </p>
          </div>
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
