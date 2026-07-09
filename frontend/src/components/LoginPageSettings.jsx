import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'
import Button from './ui/Button'
import TextInput from './ui/TextInput'
import AppSurface from './ui/AppSurface'
import { persistLoginPageSettings, readLoginPageSettings } from '../utils/branding'
import { DEFAULT_LOGIN_PAGE_SETTINGS, normalizeLoginPageSettings } from '../utils/loginPageSettings'

function SectionTitle({ title, description }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  )
}

function ImagePicker({ label, hint, value, onChange, onRemove }) {
  const [uploading, setUploading] = useState(false)

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB')
      return
    }

    setUploading(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = (error) => reject(error)
        reader.readAsDataURL(file)
      })
      onChange(dataUrl)
    } catch (error) {
      console.error('Failed to read image:', error)
      alert('Failed to upload image. Please try again.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="space-y-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
          onChange={handleFile}
          className="block w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink"
        />
        {uploading ? <p className="text-xs text-ink-muted">Uploading image...</p> : null}
        {value ? (
          <div className="overflow-hidden rounded-3xl border border-border bg-surface">
            <img src={value} alt={label} className="h-40 w-full object-cover" />
            <div className="flex justify-end border-t border-border p-3">
              <Button variant="secondary" size="sm" onClick={onRemove}>Remove</Button>
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  )
}

export default function LoginPageSettings() {
  const { t } = usePreferences()
  const [settings, setSettings] = useState(DEFAULT_LOGIN_PAGE_SETTINGS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const res = await api.get('/system/config/login-page-settings')
        const serverSettings = res.data?.data?.settings
        if (serverSettings && typeof serverSettings === 'object') {
          const normalized = normalizeLoginPageSettings(serverSettings)
          if (!mounted) return
          setSettings(normalized)
          persistLoginPageSettings(normalized)
          return
        }
      } catch {}

      const stored = readLoginPageSettings()
      if (stored && mounted) {
        setSettings(normalizeLoginPageSettings(stored))
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const featurePills = useMemo(() => {
    return Array.isArray(settings.heroSection?.featurePills)
      ? settings.heroSection.featurePills
      : DEFAULT_LOGIN_PAGE_SETTINGS.heroSection.featurePills
  }, [settings.heroSection?.featurePills])

  const updateRoot = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const updateHero = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      heroSection: { ...prev.heroSection, [key]: value }
    }))
  }

  const updateFeaturePill = (index, value) => {
    const next = [...featurePills]
    next[index] = value
    updateHero('featurePills', next)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = normalizeLoginPageSettings(settings)
      const res = await api.put('/system/config/login-page-settings', payload)
      const saved = normalizeLoginPageSettings(res.data?.data?.settings || payload)
      setSettings(saved)
      persistLoginPageSettings(saved)
      alert('Login page settings saved successfully!')
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save login page settings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    const defaults = normalizeLoginPageSettings(DEFAULT_LOGIN_PAGE_SETTINGS)
    setSettings(defaults)
    persistLoginPageSettings(defaults)
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Login Page Manager"
        description="Manage the public login page layout, content, imagery, and quick branding without editing code."
      />

      <AppSurface padding="lg" variant="panel" className="space-y-5">
        <SectionTitle
          title="Visibility"
          description="Choose which public navigation elements should appear on the login page."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
            <span className="text-sm font-medium text-ink">Show topbar</span>
            <input
              type="checkbox"
              checked={settings.showTopbar}
              onChange={(e) => updateRoot('showTopbar', e.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
            <span className="text-sm font-medium text-ink">Show footer</span>
            <input
              type="checkbox"
              checked={settings.showFooter}
              onChange={(e) => updateRoot('showFooter', e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>
      </AppSurface>

      <AppSurface padding="lg" variant="panel" className="space-y-5">
        <SectionTitle
          title="Page Styling"
          description="Adjust the outer page and form card colors."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Page background">
            <div className="flex gap-2">
              <input type="color" value={settings.pageBackground} onChange={(e) => updateRoot('pageBackground', e.target.value)} className="h-10 w-14 rounded-xl border border-border" />
              <TextInput value={settings.pageBackground} onChange={(e) => updateRoot('pageBackground', e.target.value)} />
            </div>
          </Field>
          <Field label="Form card background">
            <div className="flex gap-2">
              <input type="color" value={settings.formCardBackground} onChange={(e) => updateRoot('formCardBackground', e.target.value)} className="h-10 w-14 rounded-xl border border-border" />
              <TextInput value={settings.formCardBackground} onChange={(e) => updateRoot('formCardBackground', e.target.value)} />
            </div>
          </Field>
          <Field label="Form card border">
            <div className="flex gap-2">
              <input type="color" value={settings.formCardBorderColor} onChange={(e) => updateRoot('formCardBorderColor', e.target.value)} className="h-10 w-14 rounded-xl border border-border" />
              <TextInput value={settings.formCardBorderColor} onChange={(e) => updateRoot('formCardBorderColor', e.target.value)} />
            </div>
          </Field>
        </div>
      </AppSurface>

      <AppSurface padding="lg" variant="panel" className="space-y-5">
        <SectionTitle
          title="Left Hero Panel"
          description="This content appears on the left side of the redesigned login page."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Brand name">
            <TextInput value={settings.heroSection.brandName} onChange={(e) => updateHero('brandName', e.target.value)} />
          </Field>
          <Field label="Brand sublabel">
            <TextInput value={settings.heroSection.platformLabel || ''} onChange={(e) => updateHero('platformLabel', e.target.value)} placeholder="Optional small text under brand name" />
          </Field>
          <Field label="Footer note">
            <TextInput value={settings.heroSection.footerNote} onChange={(e) => updateHero('footerNote', e.target.value)} />
          </Field>
          <Field label="Main headline">
            <TextInput value={settings.heroSection.headline} onChange={(e) => updateHero('headline', e.target.value)} />
          </Field>
          <Field label="Highlighted headline">
            <TextInput value={settings.heroSection.highlightedHeadline} onChange={(e) => updateHero('highlightedHeadline', e.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <textarea
                value={settings.heroSection.description}
                onChange={(e) => updateHero('description', e.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              />
            </Field>
          </div>
        </div>

        <AppSurface padding="md" variant="panel" className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-ink">Hero image crop</div>
            <div className="mt-1 text-xs text-ink-muted">Adjust which part of the hero image stays visible (uses CSS background-position).</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Crop X (%)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.heroSection.heroFocalX ?? 50}
                  onChange={(e) => updateHero('heroFocalX', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="0"
                  max="100"
                  value={settings.heroSection.heroFocalX ?? 50}
                  onChange={(e) => updateHero('heroFocalX', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>
            <Field label="Crop Y (%)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.heroSection.heroFocalY ?? 50}
                  onChange={(e) => updateHero('heroFocalY', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="0"
                  max="100"
                  value={settings.heroSection.heroFocalY ?? 50}
                  onChange={(e) => updateHero('heroFocalY', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>
          </div>
        </AppSurface>

        <AppSurface padding="md" variant="panel" className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-ink">Hero typography & position</div>
            <div className="mt-1 text-xs text-ink-muted">Match font style and fine-tune text position on the hero panel.</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Font family"
              hint="Example: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
            >
              <TextInput value={settings.heroSection.heroFontFamily || ''} onChange={(e) => updateHero('heroFontFamily', e.target.value)} />
            </Field>

            <Field label="Text offset X (px)" hint="Move hero text block left/right. Positive = move right.">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="-200"
                  max="200"
                  value={settings.heroSection.heroTextOffsetX ?? 0}
                  onChange={(e) => updateHero('heroTextOffsetX', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="-200"
                  max="200"
                  value={settings.heroSection.heroTextOffsetX ?? 0}
                  onChange={(e) => updateHero('heroTextOffsetX', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>

            <label className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 md:col-span-2">
              <span className="text-sm font-medium text-ink">Enable text shadow</span>
              <input
                type="checkbox"
                checked={settings.heroSection.heroTextShadowEnabled !== false}
                onChange={(e) => updateHero('heroTextShadowEnabled', e.target.checked)}
                className="h-4 w-4"
              />
            </label>

            <Field
              label="Title text shadow"
              hint="CSS text-shadow value. Example: 0 14px 30px rgba(0,0,0,0.45)"
            >
              <TextInput
                value={settings.heroSection.heroTitleTextShadow || ''}
                onChange={(e) => updateHero('heroTitleTextShadow', e.target.value)}
                placeholder="0 14px 30px rgba(0,0,0,0.45)"
              />
            </Field>

            <Field
              label="Description text shadow"
              hint="CSS text-shadow value. Example: 0 10px 22px rgba(0,0,0,0.35)"
            >
              <TextInput
                value={settings.heroSection.heroDescriptionTextShadow || ''}
                onChange={(e) => updateHero('heroDescriptionTextShadow', e.target.value)}
                placeholder="0 10px 22px rgba(0,0,0,0.35)"
              />
            </Field>

            <Field label="Title font size (px)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="28"
                  max="88"
                  value={settings.heroSection.heroTitleFontSize ?? 50}
                  onChange={(e) => updateHero('heroTitleFontSize', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="28"
                  max="88"
                  value={settings.heroSection.heroTitleFontSize ?? 50}
                  onChange={(e) => updateHero('heroTitleFontSize', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>

            <Field label="Title font weight" hint="Common values: 600, 700, 800">
              <TextInput
                type="number"
                min="300"
                max="900"
                value={settings.heroSection.heroTitleFontWeight ?? 800}
                onChange={(e) => updateHero('heroTitleFontWeight', Number(e.target.value))}
              />
            </Field>

            <Field label="Title letter spacing (em)" hint="Example: -0.03">
              <TextInput
                type="number"
                step="0.01"
                value={settings.heroSection.heroTitleLetterSpacing ?? -0.03}
                onChange={(e) => updateHero('heroTitleLetterSpacing', Number(e.target.value))}
              />
            </Field>

            <Field label="Title line height" hint="Example: 1.02">
              <TextInput
                type="number"
                step="0.01"
                value={settings.heroSection.heroTitleLineHeight ?? 1.02}
                onChange={(e) => updateHero('heroTitleLineHeight', Number(e.target.value))}
              />
            </Field>

            <Field label="Highlight color">
              <div className="flex gap-2">
                <input
                  type="color"
                  value={settings.heroSection.heroHighlightColor || '#F6AA3B'}
                  onChange={(e) => updateHero('heroHighlightColor', e.target.value)}
                  className="h-10 w-14 rounded-xl border border-border"
                />
                <TextInput value={settings.heroSection.heroHighlightColor || ''} onChange={(e) => updateHero('heroHighlightColor', e.target.value)} />
              </div>
            </Field>

            <Field label="Description font size (px)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="11"
                  max="22"
                  value={settings.heroSection.heroDescriptionFontSize ?? 15}
                  onChange={(e) => updateHero('heroDescriptionFontSize', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="11"
                  max="22"
                  value={settings.heroSection.heroDescriptionFontSize ?? 15}
                  onChange={(e) => updateHero('heroDescriptionFontSize', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>

            <Field label="Description line height" hint="Example: 1.85">
              <TextInput
                type="number"
                step="0.01"
                value={settings.heroSection.heroDescriptionLineHeight ?? 1.85}
                onChange={(e) => updateHero('heroDescriptionLineHeight', Number(e.target.value))}
              />
            </Field>
          </div>
        </AppSurface>

        <ImagePicker
          label="Hero background image"
          hint="Recommended: wide landscape image."
          value={settings.heroSection.heroImage}
          onChange={(value) => updateHero('heroImage', value)}
          onRemove={() => updateHero('heroImage', null)}
        />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-ink">Feature pills</h4>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {featurePills.map((item, index) => (
              <TextInput
                key={`login-pill-${index}`}
                value={item}
                onChange={(e) => updateFeaturePill(index, e.target.value)}
                placeholder={`Feature pill ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </AppSurface>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={handleReset}>
          {t('reset')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('gss_saving') : t('gss_save_changes')}
        </Button>
      </div>
    </div>
  )
}
