'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { type FormField, type FormSchemaV2, normalizeToV2 } from '@/lib/crm/forms-types'

interface PublicFormClientProps {
  formId: string
  slug: string
  schema: unknown
}

export function PublicFormClient({ slug, schema: rawSchema }: PublicFormClientProps) {
  const schema = useMemo(() => normalizeToV2(rawSchema), [rawSchema])
  const color = schema.primaryColor ?? '#ed1c24'
  const colorLight = shade(color, 20)

  const [stepIdx, setStepIdx] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const steps = schema.steps
  const currentStep = steps[stepIdx]
  const progress = ((stepIdx + 1) / steps.length) * 100

  function setValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }))
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: '' }))
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {}
    for (const f of currentStep.fields) {
      if (f.required && !(values[f.id] ?? '').trim()) errs[f.id] = 'Required'
      if (f.type === 'email' && values[f.id] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.id])) {
        errs[f.id] = 'Please enter a valid email'
      }
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      alert(Object.values(errs)[0])
      return false
    }
    return true
  }

  async function handleNext() {
    if (!validateStep()) return
    if (stepIdx < steps.length - 1) {
      setStepIdx((i) => i + 1)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/forms/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error(await res.text())
      setSuccess(true)
    } catch (e) {
      alert((e as Error).message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  function handleBack() {
    setStepIdx((i) => Math.max(0, i - 1))
  }

  if (success) {
    return <SuccessScreen color={color} title={schema.successTitle} message={schema.successMessage} />
  }

  const isLast = stepIdx === steps.length - 1

  return (
    <div
      className="container"
      style={{
        width: '100%',
        maxWidth: 520,
        background: '#fff',
        borderRadius: 22,
        boxShadow: '0 18px 45px rgba(0,0,0,.20)',
        overflow: 'hidden',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${colorLight} 100%)`,
          color: '#fff',
          textAlign: 'center',
          padding: '26px 20px 18px',
        }}
      >
        <h1
          style={{
            fontSize: 36,
            lineHeight: 1.05,
            fontWeight: 800,
            textShadow: '0 3px 10px rgba(0,0,0,.15)',
            marginBottom: 6,
          }}
        >
          Trial Class
        </h1>
        <p style={{ fontSize: 16, opacity: 0.95, marginBottom: 14 }}>Registration</p>
        <div
          style={{
            height: 7,
            width: '100%',
            background: 'rgba(255,255,255,.45)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'rgba(255,255,255,.92)',
              borderRadius: 999,
              transition: 'width .45s ease',
            }}
          />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '28px 26px 30px', minHeight: 400 }}>
        <div style={{ animation: 'ebr-fade .35s ease' }}>
          {currentStep.fields.map((field) => (
            <FieldRenderer
              key={field.id}
              field={field}
              color={color}
              value={values[field.id] ?? ''}
              error={errors[field.id]}
              onChange={(v) => setValue(field.id, v)}
            />
          ))}

          <button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            style={{
              width: '100%',
              height: 58,
              border: 'none',
              borderRadius: 18,
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: 2,
              cursor: submitting ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              opacity: submitting ? 0.7 : 1,
              marginTop: 16,
              background: isLast ? `linear-gradient(135deg, ${color} 0%, ${colorLight} 100%)` : color,
              color: '#fff',
              boxShadow: `0 14px 26px ${hexToRgba(color, 0.18)}`,
              transition: 'transform .12s ease, box-shadow .2s ease',
            }}
          >
            {submitting ? 'SUBMITTING…' : isLast ? 'SUBMIT' : 'NEXT'}
          </button>

          {stepIdx > 0 && (
            <button
              type="button"
              onClick={handleBack}
              style={{
                width: '100%',
                height: 58,
                border: 'none',
                borderRadius: 18,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: 1,
                cursor: 'pointer',
                textTransform: 'uppercase',
                marginTop: 12,
                background: '#e6e6e6',
                color: '#6b6b6b',
              }}
            >
              BACK
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ebr-fade { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: translateY(0);} }
      `}</style>
    </div>
  )
}

// ─── Field renderer ───────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  color,
  value,
  error,
  onChange,
}: {
  field: FormField
  color: string
  value: string
  error?: string
  onChange: (v: string) => void
}) {
  const filled = value.trim() !== ''

  const labelStyle: CSSProperties = {
    display: 'block',
    fontWeight: 800,
    fontSize: 18,
    color: '#2a2a2a',
    marginBottom: 10,
  }

  const baseInput: CSSProperties = {
    width: '100%',
    height: 52,
    padding: '0 16px',
    border: error
      ? '3px solid #ed1c24'
      : filled
        ? '3px solid #ffb000'
        : '3px solid #e6e6e6',
    borderRadius: 16,
    fontSize: 16,
    color: '#333',
    outline: 'none',
    background: filled ? '#fff9e6' : '#fff',
    fontFamily: 'Arial,sans-serif',
    transition: 'border-color .2s, box-shadow .2s, background .2s',
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>
        {field.label}
        {field.required && <span style={{ color, marginLeft: 6 }}>*</span>}
      </label>

      {(() => {
        if (field.type === 'textarea') {
          return (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={field.placeholder}
              style={{
                ...baseInput,
                height: 'auto',
                minHeight: 110,
                padding: '14px 16px',
                resize: 'vertical',
              }}
            />
          )
        }
        if (field.type === 'select') {
          return (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={{
                ...baseInput,
                appearance: 'none',
                backgroundImage:
                  'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2.5\'><polyline points=\'6 9 12 15 18 9\'></polyline></svg>")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px center',
                paddingRight: 40,
              }}
            >
              <option value="">{field.placeholder ?? 'Please select'}</option>
              {(field.options ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          )
        }
        if (field.type === 'choice') {
          const opts = field.options ?? []
          return (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, opts.length))}, 1fr)`,
                gap: 12,
                marginTop: 14,
              }}
            >
              {opts.map((opt) => {
                const selected = value === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(opt)}
                    style={{
                      height: 70,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: selected ? `3px solid ${color}` : '3px solid #e7e7e7',
                      borderRadius: 16,
                      background: selected
                        ? `linear-gradient(135deg, ${color} 0%, ${shade(color, 20)} 100%)`
                        : '#fff',
                      fontSize: 26,
                      fontWeight: 900,
                      color: selected ? '#fff' : '#666',
                      cursor: 'pointer',
                      transition: 'transform .15s ease, border-color .2s, box-shadow .2s',
                      userSelect: 'none',
                      fontFamily: 'Arial,sans-serif',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          )
        }
        if (field.type === 'date') {
          return (
            <input
              type="date"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              style={baseInput}
            />
          )
        }
        return (
          <input
            type={field.type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            style={baseInput}
          />
        )
      })()}

      {field.helpText && (
        <div
          style={{
            marginTop: 10,
            fontSize: 14,
            color: '#666',
            fontStyle: 'italic',
            lineHeight: 1.35,
          }}
        >
          {field.helpText}
        </div>
      )}
    </div>
  )
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ color, title, message }: { color: string; title?: string; message?: string }) {
  const colorLight = shade(color, 20)
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        background: '#fff',
        borderRadius: 22,
        boxShadow: '0 18px 45px rgba(0,0,0,.20)',
        overflow: 'hidden',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${colorLight} 100%)`,
          height: 12,
        }}
      />
      <div style={{ padding: '56px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: 96, lineHeight: 1, color: '#22c55e', marginBottom: 12 }}>✓</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1a1a1a', marginBottom: 14 }}>
          {title ?? 'Registration Successful!'}
        </h1>
        <p style={{ fontSize: 16, color: '#555', lineHeight: 1.5, maxWidth: 380, margin: '0 auto' }}>
          {message ?? 'Thank you for registering. We will contact you shortly.'}
        </p>
      </div>
    </div>
  )
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const num = parseInt(h, 16)
  let r = (num >> 16) + amount
  let g = ((num >> 8) & 0x00ff) + amount
  let b = (num & 0x0000ff) + amount
  r = Math.max(0, Math.min(255, r))
  g = Math.max(0, Math.min(255, g))
  b = Math.max(0, Math.min(255, b))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return `rgba(237,28,36,${alpha})`
  const num = parseInt(h, 16)
  const r = num >> 16
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  return `rgba(${r},${g},${b},${alpha})`
}
