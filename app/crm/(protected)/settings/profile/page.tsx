'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff, Save } from 'lucide-react'
import { authClient } from '@/lib/crm/auth-client'
import { cn } from '@/lib/crm/utils'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ProfileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type ProfileValues = z.infer<typeof ProfileSchema>
type PasswordValues = z.infer<typeof PasswordSchema>

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

const inputCls = (hasError?: boolean) =>
  cn(
    'w-full rounded-lg border px-3 py-2 text-sm',
    'bg-white dark:bg-slate-800 text-slate-900 dark:text-white',
    'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
    hasError
      ? 'border-red-400 dark:border-red-500'
      : 'border-slate-300 dark:border-slate-600',
  )

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Profile form
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: { name: '', email: '' },
  })

  // Password form
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  // Load user on mount
  useEffect(() => {
    authClient.getSession().then((res) => {
      if (res.data?.user) {
        profileForm.reset({
          name: res.data.user.name ?? '',
          email: res.data.user.email ?? '',
        })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onProfileSubmit(data: ProfileValues) {
    try {
      await authClient.updateUser({ name: data.name })
      toast.success('Profile updated')
    } catch {
      toast.error('Failed to update profile')
    }
  }

  async function onPasswordSubmit(data: PasswordValues) {
    try {
      await authClient.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: false,
      })
      toast.success('Password changed successfully')
      passwordForm.reset()
    } catch {
      toast.error('Failed to change password. Check your current password.')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your account details and security settings.
        </p>
      </div>

      {/* Profile info */}
      <Section title="Profile Information" description="Update your display name and email address.">
        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
          <Field label="Name" error={profileForm.formState.errors.name?.message}>
            <input
              {...profileForm.register('name')}
              placeholder="Your full name"
              className={inputCls(!!profileForm.formState.errors.name)}
            />
          </Field>

          <Field label="Email" error={profileForm.formState.errors.email?.message}>
            <input
              {...profileForm.register('email')}
              type="email"
              placeholder="your@email.com"
              className={inputCls(!!profileForm.formState.errors.email)}
            />
          </Field>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileForm.formState.isSubmitting}
              className={cn(
                'flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white',
                'hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {profileForm.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save changes
            </button>
          </div>
        </form>
      </Section>

      {/* Password */}
      <Section title="Change Password" description="Use a strong password of at least 8 characters.">
        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
          <Field
            label="Current password"
            error={passwordForm.formState.errors.currentPassword?.message}
          >
            <div className="relative">
              <input
                {...passwordForm.register('currentPassword')}
                type={showCurrent ? 'text' : 'password'}
                placeholder="••••••••"
                className={cn(inputCls(!!passwordForm.formState.errors.currentPassword), 'pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Field
            label="New password"
            error={passwordForm.formState.errors.newPassword?.message}
          >
            <div className="relative">
              <input
                {...passwordForm.register('newPassword')}
                type={showNew ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                className={cn(inputCls(!!passwordForm.formState.errors.newPassword), 'pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowNew((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Field
            label="Confirm new password"
            error={passwordForm.formState.errors.confirmPassword?.message}
          >
            <div className="relative">
              <input
                {...passwordForm.register('confirmPassword')}
                type={showConfirm ? 'text' : 'password'}
                placeholder="Repeat new password"
                className={cn(inputCls(!!passwordForm.formState.errors.confirmPassword), 'pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={passwordForm.formState.isSubmitting}
              className={cn(
                'flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white',
                'hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {passwordForm.formState.isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Change password
            </button>
          </div>
        </form>
      </Section>
    </div>
  )
}
