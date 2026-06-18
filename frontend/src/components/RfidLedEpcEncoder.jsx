import React, { useMemo, useState } from 'react'
import {
  DEFAULT_SGTIN_SAMPLE,
  FILTER_OPTIONS,
  encodeSgtin96,
  getSgtinPartition
} from '../utils/epcEncoder'
import PageHeader from './ui/PageHeader'
import AppSurface from './ui/AppSurface'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import SelectField from './ui/SelectField'

const initialForm = {
  filter: DEFAULT_SGTIN_SAMPLE.filter,
  companyPrefixDigits: DEFAULT_SGTIN_SAMPLE.companyPrefixDigits,
  companyPrefix: DEFAULT_SGTIN_SAMPLE.companyPrefix,
  itemReference: DEFAULT_SGTIN_SAMPLE.itemReference,
  serial: DEFAULT_SGTIN_SAMPLE.serial
}

const resultCards = [
  { key: 'tagUri', label: 'Tag URI', mono: false },
  { key: 'pureIdentityUri', label: 'Pure Identity URI', mono: false },
  { key: 'gtin14', label: 'GTIN-14', mono: true },
  { key: 'hex', label: 'EPC Hex (24 chars)', mono: true }
]

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error(`Failed to copy ${label}`, error)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={handleCopy}
      className="h-8 rounded-xl px-3 text-xs"
    >
      {copied ? 'Copied' : `Copy ${label}`}
    </Button>
  )
}

function OutputRow({ label, value, mono = false }) {
  return (
    <AppSurface padding="md" className="rounded-xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{label}</h3>
        <CopyButton value={value} label={label} />
      </div>
      <div className={`break-all rounded-lg bg-surface-muted px-3 py-3 text-sm text-ink-secondary ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </AppSurface>
  )
}

export default function RfidLedEpcEncoder() {
  const [form, setForm] = useState(initialForm)

  const partitionMeta = useMemo(() => {
    try {
      return getSgtinPartition(form.companyPrefixDigits)
    } catch {
      return null
    }
  }, [form.companyPrefixDigits])

  const encodedResult = useMemo(() => {
    try {
      return {
        data: encodeSgtin96(form),
        error: ''
      }
    } catch (error) {
      return {
        data: null,
        error: error.message || 'Gagal encode EPC.'
      }
    }
  }, [form])

  const handleChange = (field) => (event) => {
    const nextValue = event.target.value
    setForm((current) => ({ ...current, [field]: nextValue }))
  }

  const loadSample = () => {
    setForm(initialForm)
  }

  return (
    <div className="space-y-6">
      <AppSurface padding="lg" className="space-y-4">
        <PageHeader
          title="RFID LED EPC Code Encoding"
          subtitle="Module ini encode identifier kepada format EPC standard untuk RFID. Release awal ini fokus pada SGTIN-96 dengan output terus dalam bentuk Tag URI, Pure Identity URI, binary 96-bit, hex EPC, dan GTIN-14."
        />
        <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm text-ink-secondary">
          <p className="font-semibold text-ink">Quick Notes</p>
          <p className="mt-2">- Company prefix: 6 hingga 12 digit</p>
          <p>- Item reference ikut partition GS1 automatik</p>
          <p>- Serial disimpan dalam 38-bit field</p>
        </div>
      </AppSurface>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <AppSurface as="section" padding="lg">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Input EPC</h2>
              <p className="mt-1 text-sm text-ink-muted">Isi nilai GS1 dan hasil encoding akan update secara langsung.</p>
            </div>
            <Button type="button" variant="secondary" onClick={loadSample}>
              Load Sample
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-secondary">Scheme</span>
              <TextInput
                value="SGTIN-96"
                readOnly
                className="bg-surface-muted text-ink-muted"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-secondary">Filter Value</span>
              <SelectField
                value={form.filter}
                onChange={handleChange('filter')}
              >
                {FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-secondary">Company Prefix Digits</span>
              <SelectField
                value={form.companyPrefixDigits}
                onChange={handleChange('companyPrefixDigits')}
              >
                {[6, 7, 8, 9, 10, 11, 12].map((digits) => (
                  <option key={digits} value={digits}>
                    {digits} digits
                  </option>
                ))}
              </SelectField>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-secondary">Company Prefix</span>
              <TextInput
                value={form.companyPrefix}
                onChange={handleChange('companyPrefix')}
                inputMode="numeric"
                placeholder="Contoh: 9551234"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-secondary">
                Item Reference
                {partitionMeta && (
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    diperlukan {partitionMeta.itemReferenceDigits} digit
                  </span>
                )}
              </span>
              <TextInput
                value={form.itemReference}
                onChange={handleChange('itemReference')}
                inputMode="numeric"
                placeholder="Item reference termasuk indicator digit"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-secondary">Serial</span>
              <TextInput
                value={form.serial}
                onChange={handleChange('serial')}
                inputMode="numeric"
                placeholder="Contoh: 123456"
              />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-[var(--dms-color-info-soft)] p-4">
            <h3 className="text-sm font-semibold text-[var(--dms-color-info-ink)]">Partition Summary</h3>
            {partitionMeta ? (
              <div className="mt-2 grid gap-3 text-sm text-[var(--dms-color-info-ink)] sm:grid-cols-3">
                <div>
                  <p className="font-medium">Partition</p>
                  <p>{partitionMeta.partition}</p>
                </div>
                <div>
                  <p className="font-medium">Company Prefix Bits</p>
                  <p>{partitionMeta.companyPrefixBits}</p>
                </div>
                <div>
                  <p className="font-medium">Item Reference Bits</p>
                  <p>{partitionMeta.itemReferenceBits}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--dms-color-info-ink)]">Pilih company prefix digits yang sah untuk lihat partition detail.</p>
            )}
          </div>

          {encodedResult.error && (
            <div className="mt-5 rounded-xl border border-border bg-[var(--dms-color-danger-soft)] px-4 py-3 text-sm text-[var(--dms-color-danger-ink)]">
              {encodedResult.error}
            </div>
          )}
        </AppSurface>

        <section className="space-y-4">
          <AppSurface padding="lg">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-ink">Encoded Output</h2>
              <p className="mt-1 text-sm text-ink-muted">Output ini boleh terus dipakai untuk semakan, integrasi middleware, atau tulis ke EPC memory.</p>
            </div>

            {encodedResult.data ? (
              <div className="space-y-4">
                {resultCards.map((card) => (
                  <OutputRow
                    key={card.key}
                    label={card.label}
                    value={encodedResult.data[card.key]}
                    mono={card.mono}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-ink-muted">
                Betulkan input untuk jana EPC output.
              </div>
            )}
          </AppSurface>

          {encodedResult.data && (
            <>
              <AppSurface padding="lg">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">Binary 96-bit</h3>
                  <CopyButton value={encodedResult.data.binary} label="Binary" />
                </div>
                <div className="rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-300">
                  {encodedResult.data.binaryWords.map((word, index) => (
                    <span key={`${word}-${index}`} className="mr-3 inline-block">
                      {word}
                    </span>
                  ))}
                </div>
              </AppSurface>

              <AppSurface padding="lg">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-ink">EPC Memory Words</h3>
                  <CopyButton value={encodedResult.data.epcWords.join(' ')} label="Words" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {encodedResult.data.epcWords.map((word, index) => (
                    <div key={`${word}-${index}`} className="rounded-xl border border-border bg-surface-muted px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Word {index + 1}</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-ink">{word}</p>
                    </div>
                  ))}
                </div>
              </AppSurface>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
