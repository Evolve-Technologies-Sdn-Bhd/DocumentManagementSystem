import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircleIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import api from '../api/axios'
import { usePreferences } from '../contexts/PreferencesContext'
import { readBranding } from '../utils/branding'

function getPasswordStrength(password) {
  const strength = {
    score: 0,
    hasMinLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*]/.test(password),
  }

  if (strength.hasMinLength) strength.score += 1
  if (strength.hasUpperCase) strength.score += 1
  if (strength.hasLowerCase) strength.score += 1
  if (strength.hasNumber) strength.score += 1
  if (strength.hasSpecialChar) strength.score += 1

  return strength
}

export default function ResetPassword() {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const branding = readBranding()
  const token = searchParams.get('token') || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const passwordStrength = getPasswordStrength(newPassword)
  const meetsAllPasswordRequirements =
    passwordStrength.hasMinLength &&
    passwordStrength.hasUpperCase &&
    passwordStrength.hasLowerCase &&
    passwordStrength.hasNumber &&
    passwordStrength.hasSpecialChar

  async function handleSubmit(e) {
    e.preventDefault()
    setFeedback(null)

    if (!token) {
      setFeedback({ type: 'error', message: 'Invalid or expired reset link.' })
      return
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: t('pass_mismatch') })
      return
    }

    if (!meetsAllPasswordRequirements) {
      setFeedback({ type: 'error', message: 'new password set does not follow password requirements' })
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/reset-password', {
        token,
        newPassword,
      })

      setFeedback({
        type: 'success',
        message: res.data?.message || 'Password reset successfully. Redirecting to login...',
      })

      window.setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (error) {
      const backendMessage = error.response?.data?.message
      setFeedback({
        type: 'error',
        message:
          backendMessage && /validation failed/i.test(backendMessage)
            ? 'new password set does not follow password requirements'
            : backendMessage || 'Failed to reset password. Please request a new reset link.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--dms-login-btn-bg,#2563EB)] text-white">
            <DocumentTextIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">
              {branding.companyName || 'Document Management System'}
            </p>
            <p className="text-sm text-slate-500">Secure password reset</p>
          </div>
        </div>

        {!token ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Invalid reset link</h1>
              <p className="mt-2 text-sm text-slate-600">
                The password reset link is missing or has expired. Please request a new one from the login page.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full rounded-2xl bg-[var(--dms-login-btn-bg,#2563EB)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--dms-login-btn-hover,#1D4ED8)]"
            >
              {t('back_to_login')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Set a new password</h1>
              <p className="mt-2 text-sm text-slate-600">
                Choose a new secure password for your account.
              </p>
            </div>

            {feedback ? (
              <div
                className={`rounded-xl border p-3 ${
                  feedback.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'
                }`}
              >
                <p className={`text-sm ${feedback.type === 'error' ? 'text-red-800' : 'text-green-800'}`}>
                  {feedback.message}
                </p>
              </div>
            ) : null}

            <div>
              <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('new_password')}
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showNewPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {newPassword ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all duration-300 ${
                        passwordStrength.score <= 2
                          ? 'bg-red-500'
                          : passwordStrength.score === 3
                            ? 'bg-yellow-500'
                            : passwordStrength.score === 4
                              ? 'bg-blue-500'
                              : 'bg-green-500'
                      }`}
                      style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      passwordStrength.score <= 2
                        ? 'text-red-600'
                        : passwordStrength.score === 3
                          ? 'text-yellow-600'
                          : passwordStrength.score === 4
                            ? 'text-blue-600'
                            : 'text-green-600'
                    }`}
                  >
                    {passwordStrength.score <= 2
                      ? t('weak')
                      : passwordStrength.score === 3
                        ? t('fair')
                        : passwordStrength.score === 4
                          ? t('good')
                          : t('strong')}
                  </span>
                </div>

                <div className="space-y-1.5 rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-700">{t('pass_req_title')}</p>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasMinLength ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-xs ${passwordStrength.hasMinLength ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_min_len')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasUpperCase ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-xs ${passwordStrength.hasUpperCase ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_upper')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasLowerCase ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-xs ${passwordStrength.hasLowerCase ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_lower')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasNumber ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-xs ${passwordStrength.hasNumber ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_number')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {passwordStrength.hasSpecialChar ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-xs ${passwordStrength.hasSpecialChar ? 'text-green-700' : 'text-red-700'}`}>
                      {t('pass_req_special')}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('confirm_new_password')}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </button>
              </div>
              {confirmPassword ? (
                <p className={`mt-1.5 text-xs ${newPassword === confirmPassword ? 'text-green-600' : 'text-red-600'}`}>
                  {newPassword === confirmPassword ? t('pass_match') : t('pass_mismatch')}
                </p>
              ) : null}
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[var(--dms-login-btn-bg,#2563EB)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--dms-login-btn-hover,#1D4ED8)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? t('changing_password') : 'Reset password'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {t('back_to_login')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
