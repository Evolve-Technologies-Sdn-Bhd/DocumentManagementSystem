import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function clampPercent(value) {
  const num = Number(value)
  if (Number.isNaN(num)) return 50
  return Math.max(0, Math.min(100, num))
}

function clampNumber(value, min, max) {
  const num = Number(value)
  if (Number.isNaN(num)) return min
  return Math.max(min, Math.min(max, num))
}

function buildHeroBackground(heroImage) {
  return heroImage
    ? `linear-gradient(90deg, rgba(23, 23, 35, 0.58), rgba(12, 25, 58, 0.32)), url('${heroImage}')`
    : `linear-gradient(135deg, var(--dms-login-bg-start, #3F3F46), var(--dms-login-bg-end, #0F172A))`
}

function HeroCropPreview({ heroImage, focalX, focalY, onChange, presetKey, defaultSize, defaultRatio }) {
  const boxRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const resizeRef = useRef(null)
  const [lockAspectRatio, setLockAspectRatio] = useState(true)
  const [size, setSize] = useState(defaultSize)

  useEffect(() => {
    setSize(defaultSize)
    setLockAspectRatio(true)
  }, [presetKey, defaultSize])

  const updateFromEvent = useCallback((event) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return

    const percentX = clampPercent(((event.clientX - rect.left) / rect.width) * 100)
    const percentY = clampPercent(((event.clientY - rect.top) / rect.height) * 100)

    onChange({ focalX: Math.round(percentX), focalY: Math.round(percentY) })
  }, [onChange])

  const handlePointerDown = useCallback((event) => {
    if (resizing) return
    if (event.button != null && event.button !== 0) return
    boxRef.current?.setPointerCapture?.(event.pointerId)
    setDragging(true)
    updateFromEvent(event)
  }, [resizing, updateFromEvent])

  const handlePointerMove = useCallback((event) => {
    if (!dragging) return
    updateFromEvent(event)
  }, [dragging, updateFromEvent])

  const handlePointerUp = useCallback((event) => {
    try {
      boxRef.current?.releasePointerCapture?.(event.pointerId)
    } catch {}
    setDragging(false)
  }, [])

  const handleResizeDown = useCallback((event) => {
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return

    boxRef.current?.setPointerCapture?.(event.pointerId)
    setResizing(true)
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: size.width,
      startHeight: size.height
    }
  }, [size.height, size.width])

  const handleResizeMove = useCallback((event) => {
    if (!resizing) return
    const state = resizeRef.current
    if (!state) return

    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    const ratio = Number(defaultRatio) || (8 / 9)

    const nextWidthRaw = state.startWidth + dx
    const nextHeightRaw = state.startHeight + dy

    const nextWidth = clampNumber(nextWidthRaw, 240, 2000)
    const nextHeight = lockAspectRatio
      ? clampNumber(nextWidth / ratio, 240, 2000)
      : clampNumber(nextHeightRaw, 240, 2000)

    setSize({ width: Math.round(nextWidth), height: Math.round(nextHeight) })
  }, [defaultRatio, lockAspectRatio, resizing])

  const handleResizeUp = useCallback((event) => {
    if (!resizing) return
    try {
      boxRef.current?.releasePointerCapture?.(event.pointerId)
    } catch {}
    resizeRef.current = null
    setResizing(false)
  }, [resizing])

  const backgroundImage = buildHeroBackground(heroImage)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-ink-muted">Drag within the preview to set focal point. Resize the preview to match your screen.</div>
        <a href="/login" target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand hover:underline">
          Open full preview
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="text-xs text-ink-muted">
          Preview: {size.width}×{size.height}px
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink">
          <input type="checkbox" checked={lockAspectRatio} onChange={(e) => setLockAspectRatio(e.target.checked)} />
          Lock ratio
        </label>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setSize(defaultSize)
            setLockAspectRatio(true)
          }}
        >
          Reset size
        </Button>
      </div>

      <div className="w-full overflow-x-auto pb-2">
        <div
          ref={boxRef}
          className="relative overflow-hidden rounded-3xl border border-border"
          style={{
            width: `${size.width}px`,
            height: `${size.height}px`,
            backgroundImage,
            backgroundSize: 'cover',
            backgroundPosition: `${focalX ?? 50}% ${focalY ?? 50}%`,
            touchAction: 'none',
            cursor: resizing ? 'nwse-resize' : (dragging ? 'grabbing' : 'grab')
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={(e) => {
            handlePointerMove(e)
            handleResizeMove(e)
          }}
          onPointerUp={(e) => {
            handlePointerUp(e)
            handleResizeUp(e)
          }}
          onPointerCancel={(e) => {
            handlePointerUp(e)
            handleResizeUp(e)
          }}
          role="presentation"
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(31,41,55,0.22),rgba(17,24,39,0.18))]" />

          <div className="absolute inset-0">
            <div className="absolute h-full w-px bg-white/35" style={{ left: `${focalX ?? 50}%` }} />
            <div className="absolute h-px w-full bg-white/35" style={{ top: `${focalY ?? 50}%` }} />
            <div
              className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/85 bg-white/10 backdrop-blur-sm"
              style={{ left: `${focalX ?? 50}%`, top: `${focalY ?? 50}%` }}
            />
          </div>

          <div className="absolute bottom-3 right-3 rounded-full bg-black/35 px-2 py-1 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
            {(focalX ?? 50)}% / {(focalY ?? 50)}%
          </div>

          <div
            className="absolute bottom-2 right-2 h-7 w-7 rounded-xl border border-white/25 bg-black/25 backdrop-blur-sm"
            onPointerDown={handleResizeDown}
            onPointerUp={handleResizeUp}
            role="presentation"
          />
        </div>
      </div>
    </div>
  )
}

export default function LoginPageSettings() {
  const { t } = usePreferences()
  const [settings, setSettings] = useState(DEFAULT_LOGIN_PAGE_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [heroPreviewMode, setHeroPreviewMode] = useState('desktop')

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

            <Field label="Preview size" hint="Desktop matches the left hero panel (50% screen width x 100vh).">
              <select
                value={heroPreviewMode}
                onChange={(e) => setHeroPreviewMode(e.target.value)}
                className="block w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="desktop">Desktop (Recommended)</option>
                <option value="widescreen">Widescreen (16:9)</option>
              </select>
            </Field>
          </div>

          <HeroCropPreview
            heroImage={settings.heroSection.heroImage}
            focalX={settings.heroSection.heroFocalX ?? 50}
            focalY={settings.heroSection.heroFocalY ?? 50}
            presetKey={heroPreviewMode}
            defaultSize={heroPreviewMode === 'widescreen' ? { width: 640, height: 360 } : { width: 520, height: 585 }}
            defaultRatio={heroPreviewMode === 'widescreen' ? (16 / 9) : (8 / 9)}
            onChange={({ focalX, focalY }) => {
              updateHero('heroFocalX', focalX)
              updateHero('heroFocalY', focalY)
            }}
          />
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

            <Field label="Text max width (px)" hint="Increase this if your headline breaks into 2 lines.">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="280"
                  max="900"
                  value={settings.heroSection.heroTextMaxWidth ?? 420}
                  onChange={(e) => updateHero('heroTextMaxWidth', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="280"
                  max="900"
                  value={settings.heroSection.heroTextMaxWidth ?? 420}
                  onChange={(e) => updateHero('heroTextMaxWidth', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>

            <Field label="Description max width (px)" hint="Increase to make the description line longer before it wraps.">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="240"
                  max="900"
                  value={settings.heroSection.heroDescriptionMaxWidth ?? 360}
                  onChange={(e) => updateHero('heroDescriptionMaxWidth', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="240"
                  max="900"
                  value={settings.heroSection.heroDescriptionMaxWidth ?? 360}
                  onChange={(e) => updateHero('heroDescriptionMaxWidth', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>

            <Field label="Text offset X (px) (optional)" hint="Use only if you need to shift the whole block left/right. Set 0 to disable.">
              <TextInput
                type="number"
                min="-200"
                max="200"
                value={settings.heroSection.heroTextOffsetX ?? 0}
                onChange={(e) => updateHero('heroTextOffsetX', Number(e.target.value))}
              />
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

        <AppSurface padding="md" variant="panel" className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-ink">Feature pills styling</div>
            <div className="mt-1 text-xs text-ink-muted">Control the pill size shown under the hero description.</div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Pill height (px)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="18"
                  max="60"
                  value={settings.heroSection.featurePillHeight ?? 24}
                  onChange={(e) => updateHero('featurePillHeight', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="18"
                  max="60"
                  value={settings.heroSection.featurePillHeight ?? 24}
                  onChange={(e) => updateHero('featurePillHeight', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>

            <Field label="Pill padding X (px)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="6"
                  max="32"
                  value={settings.heroSection.featurePillPaddingX ?? 12}
                  onChange={(e) => updateHero('featurePillPaddingX', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="6"
                  max="32"
                  value={settings.heroSection.featurePillPaddingX ?? 12}
                  onChange={(e) => updateHero('featurePillPaddingX', Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </Field>

            <Field label="Pill font size (px)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="9"
                  max="18"
                  value={settings.heroSection.featurePillFontSize ?? 10}
                  onChange={(e) => updateHero('featurePillFontSize', Number(e.target.value))}
                  className="w-full"
                />
                <TextInput
                  type="number"
                  min="9"
                  max="18"
                  value={settings.heroSection.featurePillFontSize ?? 10}
                  onChange={(e) => updateHero('featurePillFontSize', Number(e.target.value))}
                  className="w-24"
                />
              </div>
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
