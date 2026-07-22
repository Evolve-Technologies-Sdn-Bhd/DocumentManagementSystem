import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DocumentTextIcon, EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import api from '../api/axios'
import { getDefaultRoute } from '../utils/defaultRoute'
import { updateUserData } from '../utils/userDataEvents'
import { usePreferences } from '../contexts/PreferencesContext'
import { persistLoginPageSettings, readBranding, readLoginPageSettings, subscribeBranding, subscribeLoginPageSettings } from '../utils/branding'
import { DEFAULT_LOGIN_FORM_COPY, normalizeLoginPageSettings } from '../utils/loginPageSettings'
import PublicTopbar from './PublicTopbar'
import PublicFooter from './PublicFooter'
import BrandLogoImage from './ui/BrandLogoImage'
import BrandLogoPreload from './ui/BrandLogoPreload'

export default function Login() {
  const { t } = usePreferences()
  const initialLoginPageSettings = readLoginPageSettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  
  // 2FA State
  const [show2FA, setShow2FA] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [tempUserId, setTempUserId] = useState(null)
  const [resendTimer, setResendTimer] = useState(0)
  const [twoFAMethod, setTwoFAMethod] = useState('email')
  const [twoFAMessage, setTwoFAMessage] = useState('')
  const [twoFAAvailableMethods, setTwoFAAvailableMethods] = useState([])
  const [trustDevice, setTrustDevice] = useState(true)

  const [branding, setBranding] = useState(() => readBranding())
  const [loginPageSettings, setLoginPageSettings] = useState(() => normalizeLoginPageSettings(initialLoginPageSettings))
  const [settingsReady, setSettingsReady] = useState(() => !!initialLoginPageSettings)
  const [showPassword, setShowPassword] = useState(false)
  const [authPanel, setAuthPanel] = useState('login')
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [forgotPasswordCode, setForgotPasswordCode] = useState('')
  const [forgotNewPassword, setForgotNewPassword] = useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('')
  const [forgotShowNewPassword, setForgotShowNewPassword] = useState(false)
  const [forgotShowConfirmPassword, setForgotShowConfirmPassword] = useState(false)
  const [forgotPasswordFeedback, setForgotPasswordFeedback] = useState(null)
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [forgotResendTimer, setForgotResendTimer] = useState(0)
  const navigate = useNavigate()

  // Resend Timer
  useEffect(() => {
    let interval
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => prev - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [resendTimer])

  useEffect(() => {
    let interval
    if (forgotResendTimer > 0) {
      interval = setInterval(() => {
        setForgotResendTimer((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [forgotResendTimer])

  useEffect(() => {
    setBranding(readBranding())
    return subscribeBranding((next) => setBranding(next))
  }, [])

  useEffect(() => {
    let mounted = true

    const loadSettings = async () => {
      try {
        const res = await api.get('/public/login-page-settings', { timeout: 4000 })
        const serverSettings = res.data?.data?.settings
        if (serverSettings && typeof serverSettings === 'object') {
          const normalized = normalizeLoginPageSettings(serverSettings)
          if (!mounted) return
          setLoginPageSettings(normalized)
          persistLoginPageSettings(normalized)
          setSettingsReady(true)
          return
        }
      } catch {}

      if (!mounted) return
      setLoginPageSettings(normalizeLoginPageSettings(readLoginPageSettings()))
      setSettingsReady(true)
    }

    loadSettings()
    const unsubscribe = subscribeLoginPageSettings((next) => {
      setLoginPageSettings(normalizeLoginPageSettings(next))
      setSettingsReady(true)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  async function loginWithCredentials(nextEmail, nextPassword) {
    setError(null)
    setLoading(true)
    
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      const res = await api.post('/auth/login', { email: nextEmail, password: nextPassword })
      // Backend returns: { success: true, message: "...", data: { user, accessToken, refreshToken } }
      
      // Check for 2FA Requirement
      if (res.data?.data?.requires2FA) {
        setTempUserId(res.data.data.userId)
        const available = res.data.data.availableMethods || (res.data.data.method ? [res.data.data.method] : ['email'])
        const defaultMethod = res.data.data.method || (available.includes('app') ? 'app' : 'email')
        setTwoFAAvailableMethods(available)
        setTwoFAMethod(defaultMethod)
        setTwoFAMessage(res.data.data.message || '')
        setShow2FA(true)
        setTrustDevice(true)
        setLoading(false)
        setError(null)
        setResendTimer((defaultMethod === 'email' && res.data.data.codeSent) ? 60 : 0)
        return
      }

      const token =
        res.data?.data?.accessToken ||
        res.data?.data?.token ||
        res.data?.accessToken ||
        res.data?.token
      if (token) {
        localStorage.setItem('token', token)
        // Also store refresh token if needed
        const nextRefresh =
          res.data?.data?.refreshToken ||
          res.data?.refreshToken
        if (nextRefresh) localStorage.setItem('refreshToken', nextRefresh)
        // Store user info and notify listeners
        if (res.data.data?.user) {
          updateUserData(res.data.data.user)
        }
        
        let next = null
        try {
          next = localStorage.getItem('postLoginRedirect')
          if (next) localStorage.removeItem('postLoginRedirect')
        } catch {}
        const defaultRoute = getDefaultRoute()
        navigate(next || defaultRoute)
      } else {
        setError('No token returned')
        setLoading(false)
      }
    } catch (err) {
      const status = err.response?.status
      const nextMessage = status >= 500
        ? 'Login is temporarily unavailable. Please try again shortly.'
        : (err.response?.data?.message || 'Login failed')
      setError(nextMessage)
      setLoading(false)
      console.error(err)
    }
  }

  async function submit(e) {
    e.preventDefault()
    await loginWithCredentials(email, password)
  }

  // 2FA Handlers
  async function handleVerify2FA(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await api.post('/auth/verify-2fa', { 
        userId: tempUserId,
        code: verificationCode,
        method: twoFAMethod,
        rememberDevice: trustDevice
      })

      const token =
        res.data?.data?.accessToken ||
        res.data?.data?.token ||
        res.data?.accessToken ||
        res.data?.token
      if (token) {
        localStorage.setItem('token', token)
        const nextRefresh =
          res.data?.data?.refreshToken ||
          res.data?.refreshToken
        if (nextRefresh) localStorage.setItem('refreshToken', nextRefresh)
        if (res.data.data?.user) {
          updateUserData(res.data.data.user)
        }
        
        let next = null
        try {
          next = localStorage.getItem('postLoginRedirect')
          if (next) localStorage.removeItem('postLoginRedirect')
        } catch {}
        const defaultRoute = getDefaultRoute()
        navigate(next || defaultRoute)
      } else {
        setError('Verification successful but no token returned')
        setLoading(false)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code')
      setLoading(false)
    }
  }

  async function handleResend2FA() {
    if (resendTimer > 0) return
    if (twoFAMethod !== 'email') return
    setError(null)
    
    try {
      await api.post('/auth/resend-2fa', { userId: tempUserId, method: twoFAMethod })
      setResendTimer(60)
      setError(null)
      // Optional: show success message
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code')
    }
  }

  async function selectTwoFAMethod(nextMethod) {
    setTwoFAMethod(nextMethod)
    setVerificationCode('')
    setError(null)

    if (nextMethod === 'email') {
      setResendTimer(0)
      try {
        await api.post('/auth/resend-2fa', { userId: tempUserId, method: 'email' })
        setResendTimer(60)
        setTwoFAMessage('Verification code sent to your email')
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to send verification code')
      }
    } else {
      setResendTimer(0)
      setTwoFAMessage('Open your authenticator app and enter the 6-digit code.')
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setError(null)
    setForgotPasswordFeedback(null)
    setForgotPasswordLoading(true)

    try {
      const res = await api.post('/auth/forgot-password', {
        email: forgotPasswordEmail.trim()
      })

      setForgotPasswordFeedback({
        type: 'success',
        message: res.data?.message || 'If the email is registered, a reset code has been sent.'
      })
      setAuthPanel('forgot_code')
      setForgotResendTimer(60)
    } catch (err) {
      setForgotPasswordFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to send reset code. Please try again.'
      })
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  async function handleResendForgotCode() {
    if (forgotResendTimer > 0) return
    setError(null)
    setForgotPasswordFeedback(null)
    setForgotPasswordLoading(true)

    try {
      const res = await api.post('/auth/forgot-password', {
        email: forgotPasswordEmail.trim()
      })

      setForgotPasswordFeedback({
        type: 'success',
        message: res.data?.message || 'If the email is registered, a reset code has been sent.'
      })
      setForgotResendTimer(60)
    } catch (err) {
      setForgotPasswordFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to resend reset code. Please try again.'
      })
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  async function handleVerifyForgotCode(e) {
    e.preventDefault()
    setError(null)
    setForgotPasswordFeedback(null)
    setForgotPasswordLoading(true)

    try {
      await api.post('/auth/verify-reset-code', {
        email: forgotPasswordEmail.trim(),
        code: forgotPasswordCode.trim()
      })
      setAuthPanel('forgot_new')
    } catch (err) {
      const nextMessage = err.response?.data?.message || 'Invalid or expired reset code'
      setForgotPasswordFeedback({ type: 'error', message: nextMessage })
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  async function handleResetPasswordWithCode(e) {
    e.preventDefault()
    setError(null)
    setForgotPasswordFeedback(null)

    const nextNewPassword = forgotNewPassword
    const nextConfirm = forgotConfirmPassword
    if (nextNewPassword !== nextConfirm) {
      setForgotPasswordFeedback({ type: 'error', message: 'Passwords do not match' })
      return
    }

    setForgotPasswordLoading(true)
    try {
      await api.post('/auth/reset-password-code', {
        email: forgotPasswordEmail.trim(),
        code: forgotPasswordCode.trim(),
        newPassword: nextNewPassword
      })

      setEmail(forgotPasswordEmail.trim())
      setPassword(nextNewPassword)
      setAuthPanel('login')
      await loginWithCredentials(forgotPasswordEmail.trim(), nextNewPassword)
    } catch (err) {
      const nextMessage = err.response?.data?.message || 'Failed to reset password'
      setForgotPasswordFeedback({ type: 'error', message: nextMessage })
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  const hero = loginPageSettings.heroSection
  const formCopy = DEFAULT_LOGIN_FORM_COPY
  const brandLogo = branding.logo
  const brandLogoPlaceholder = branding.logoPlaceholder
  const loginFontFamily = "Outfit, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

  if (!settingsReady) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: loginPageSettings.pageBackground, fontFamily: loginFontFamily }}>
        <BrandLogoPreload src={brandLogo} />
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-[var(--dms-login-btn-bg,#2563EB)]" />
          <p className="text-base font-semibold text-gray-900">{branding.companyName || hero.brandName || 'Loading'}</p>
          <p className="mt-1 text-sm text-gray-500">Loading login page settings...</p>
        </div>
      </div>
    )
  }

  const contentOffsetClass = loginPageSettings.showTopbar ? 'pt-16' : ''
  const contentBottomClass = loginPageSettings.showFooter ? 'pb-14' : ''
  const pageShellClass = [contentOffsetClass, contentBottomClass].filter(Boolean).join(' ')
  const showRequiredAsterisk = formCopy.showRequiredAsterisk !== false
  const inputClass = 'w-full rounded-[10px] border border-[#D9DEE8] bg-white px-4 py-[10px] text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
  const passwordInputClass = `${inputClass} pr-12`
  const heroBackgroundStyle = hero.heroImage
    ? `linear-gradient(90deg, rgba(23, 23, 35, 0.58), rgba(12, 25, 58, 0.32)), url('${hero.heroImage}')`
    : `linear-gradient(135deg, var(--dms-login-bg-start, #3F3F46), var(--dms-login-bg-end, #0F172A))`
  const featurePillStyle = {
    height: hero.featurePillHeight ? `${hero.featurePillHeight}px` : undefined,
    paddingLeft: hero.featurePillPaddingX ? `${hero.featurePillPaddingX}px` : undefined,
    paddingRight: hero.featurePillPaddingX ? `${hero.featurePillPaddingX}px` : undefined,
    fontSize: hero.featurePillFontSize ? `${hero.featurePillFontSize}px` : undefined
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: loginPageSettings.pageBackground, fontFamily: loginFontFamily }}>
      <BrandLogoPreload src={brandLogo} />
      {loginPageSettings.showTopbar ? <PublicTopbar /> : null}
      {loginPageSettings.showFooter ? <PublicFooter /> : null}

      <div className={`min-h-screen ${pageShellClass}`}>
        <div className="grid min-h-screen lg:grid-cols-2">
          <div
            className="relative hidden overflow-hidden lg:flex"
            style={{
              backgroundImage: heroBackgroundStyle,
              backgroundSize: 'cover',
              backgroundPosition: `${hero.heroFocalX ?? 50}% ${hero.heroFocalY ?? 50}%`
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(31,41,55,0.22),rgba(17,24,39,0.18))]" />
            <div className="relative z-10 flex min-h-full w-full flex-col justify-between px-7 py-7 text-white xl:px-8 xl:py-8">
              <div className="flex items-center gap-3">
                {brandLogo ? (
                  <BrandLogoImage
                    src={brandLogo}
                    placeholderSrc={brandLogoPlaceholder}
                    alt="Brand Logo"
                    className="h-9 w-auto object-contain"
                  />
                ) : (
                  <DocumentTextIcon className="h-6 w-6 text-white" />
                )}
                <div>
                  <p className="text-[22px] font-semibold tracking-tight text-white/95">
                    {hero.brandName || branding.companyName}
                  </p>
                  {hero.platformLabel ? (
                    <p className="text-xs text-white/60">{hero.platformLabel}</p>
                  ) : null}
                </div>
              </div>

              <div
                className="w-full pb-4"
                style={{
                  transform: hero.heroTextOffsetX ? `translateX(${hero.heroTextOffsetX}px)` : undefined,
                  fontFamily: hero.heroFontFamily || undefined,
                  maxWidth: hero.heroTextMaxWidth ? `${hero.heroTextMaxWidth}px` : undefined
                }}
              >
                <h1
                  className="font-bold"
                  style={{
                    fontSize: hero.heroTitleFontSize ? `${hero.heroTitleFontSize}px` : undefined,
                    fontWeight: hero.heroTitleFontWeight || undefined,
                    letterSpacing: hero.heroTitleLetterSpacing != null ? `${hero.heroTitleLetterSpacing}em` : undefined,
                    lineHeight: hero.heroTitleLineHeight || undefined,
                    textShadow: hero.heroTextShadowEnabled ? (hero.heroTitleTextShadow || undefined) : undefined
                  }}
                >
                  <span className="block">{hero.headline}</span>
                  <span className="mt-1 block" style={{ color: hero.heroHighlightColor || undefined }}>
                    {hero.highlightedHeadline}
                  </span>
                </h1>
                <p
                  className="mt-5 text-white/78"
                  style={{
                    fontSize: hero.heroDescriptionFontSize ? `${hero.heroDescriptionFontSize}px` : undefined,
                    lineHeight: hero.heroDescriptionLineHeight || undefined,
                    textShadow: hero.heroTextShadowEnabled ? (hero.heroDescriptionTextShadow || undefined) : undefined,
                    maxWidth: hero.heroDescriptionMaxWidth ? `${hero.heroDescriptionMaxWidth}px` : undefined
                  }}
                >
                  {hero.description}
                </p>
                <div className="mt-7 flex max-w-[470px] flex-wrap gap-2">
                  {hero.featurePills.filter(Boolean).map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center rounded-full border border-white/12 bg-white/12 font-medium text-white/90 backdrop-blur-sm"
                      style={featurePillStyle}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-white/65">{hero.footerNote}</p>
            </div>
          </div>

          <div
            className="flex min-h-screen items-center justify-center px-6 py-10 sm:px-8 lg:px-20 lg:py-10"
            style={{ backgroundColor: loginPageSettings.formCardBackground }}
          >
            <div
              className="w-full max-w-[400px]"
              style={{
                backgroundColor: 'transparent',
                borderColor: loginPageSettings.formCardBorderColor
              }}
            >
              <div className="mb-7 text-left">
                <div className="mb-5 flex items-center justify-center gap-3 lg:hidden">
                  {brandLogo ? (
                    <BrandLogoImage
                      src={brandLogo}
                      placeholderSrc={brandLogoPlaceholder}
                      alt="Brand Logo"
                      className="block h-auto max-h-12 w-auto max-w-[140px] object-contain"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--dms-login-btn-bg,#2563EB)]">
                      <DocumentTextIcon className="h-6 w-6 text-white" />
                    </div>
                  )}
                  <span className="text-lg font-semibold text-gray-800">{hero.brandName || branding.companyName}</span>
                </div>
                <h2 className="text-[40px] font-bold tracking-[-0.03em] text-gray-900">{formCopy.title}</h2>
                <p className="mt-1.5 text-[13px] text-gray-500">{formCopy.subtitle}</p>
              </div>

              {brandLogo ? (
                <div className="mb-7 flex justify-center">
                  <BrandLogoImage
                    src={brandLogo}
                    placeholderSrc={brandLogoPlaceholder}
                    alt="Company Logo"
                    className="block h-auto max-h-[220px] w-auto max-w-full object-contain"
                  />
                </div>
              ) : null}

              {/* Error Message */}
              {error && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* 2FA Verification Form */}
              {show2FA ? (
                <form onSubmit={handleVerify2FA} className="space-y-6">
                  <div className="mb-6 text-center lg:text-left">
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
                      <ShieldCheckIcon className="h-10 w-10 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">{t('two_factor_auth')}</h3>
                    <p className="text-sm text-gray-500 mt-2">
                      {twoFAMethod === 'app'
                        ? (twoFAMessage || 'Open your authenticator app and enter the 6-digit code.')
                        : (twoFAMessage || t('enter_verification_code'))}
                    </p>
                  </div>

                  {twoFAAvailableMethods.length > 1 && (
                    <div className="flex items-center justify-center gap-6 -mt-2">
                      {twoFAAvailableMethods.includes('app') && (
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="radio"
                            name="twofa-method"
                            checked={twoFAMethod === 'app'}
                            onChange={() => selectTwoFAMethod('app')}
                          />
                          Authenticator App
                        </label>
                      )}
                      {twoFAAvailableMethods.includes('email') && (
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="radio"
                            name="twofa-method"
                            checked={twoFAMethod === 'email'}
                            onChange={() => selectTwoFAMethod('email')}
                          />
                          Email Code
                        </label>
                      )}
                    </div>
                  )}

                  <div>
                    <label htmlFor="code" className="mb-2 block text-sm font-semibold text-gray-700">
                      {t('verification_code')}
                    </label>
                    <input
                      type="text"
                      id="code"
                      value={verificationCode}
                      onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      className="w-full rounded-2xl border border-gray-200 bg-[#F3F7FD] px-5 py-4 text-center font-mono text-2xl tracking-[0.5em] text-gray-900 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                      placeholder="000000"
                      autoFocus
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                    />
                    Trust this device for 7 days
                  </label>

                  <button
                    type="submit"
                    disabled={loading || verificationCode.length !== 6}
                    className="w-full rounded-2xl py-4 text-lg font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: 'var(--dms-login-btn-bg, #2563EB)' }}
                  >
                    {loading ? t('verifying') : t('verify_code')}
                  </button>

                  <div className="flex flex-col items-center gap-4 mt-6">
                    {twoFAMethod === 'email' && (
                      <button
                        type="button"
                        onClick={handleResend2FA}
                        disabled={resendTimer > 0}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        {resendTimer > 0 ? t('resend_code_timer').replace('{seconds}', resendTimer) : t('resend_code')}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShow2FA(false)
                        setTempUserId(null)
                        setVerificationCode('')
                        setTwoFAMethod('email')
                        setTwoFAMessage('')
                        setTwoFAAvailableMethods([])
                        setTrustDevice(true)
                        setError(null)
                      }}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      {t('back_to_login')}
                    </button>
                  </div>
                </form>
              ) : authPanel === 'login' ? (
              <form onSubmit={submit} className="space-y-5">
                {/* Email/Username Input */}
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-[11px] font-semibold text-gray-700">
                    {formCopy.usernameLabel}
                    {showRequiredAsterisk ? <span className="ml-0.5 text-red-500">*</span> : null}
                  </label>
                  <input
                    type="text"
                    id="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className={inputClass}
                    placeholder={formCopy.usernamePlaceholder || 'username or email'}
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="mb-1.5 block text-[11px] font-semibold text-gray-700">
                    {formCopy.passwordLabel}
                    {showRequiredAsterisk ? <span className="ml-0.5 text-red-500">*</span> : null}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className={passwordInputClass}
                      placeholder={formCopy.passwordPlaceholder || '••••••••'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-4.5 w-4.5" />
                      ) : (
                        <EyeIcon className="h-4.5 w-4.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between gap-4 pt-0.5">
                  <label className="flex min-w-0 items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="peer sr-only"
                    />
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-gray-300 bg-white text-transparent transition peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-200">
                      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                        <path d="M16.667 5L7.5 14.167 3.333 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 truncate text-sm text-gray-700">{formCopy.rememberMeLabel}</span>
                  </label>
                  {formCopy.showForgotPassword ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setForgotPasswordFeedback(null)
                        setAuthPanel('forgot_email')
                        setForgotPasswordEmail(email)
                        setForgotPasswordCode('')
                        setForgotNewPassword('')
                        setForgotConfirmPassword('')
                      }}
                      className="whitespace-nowrap text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
                    >
                      {formCopy.forgotPasswordText || t('forgot_password_q')}
                    </button>
                  ) : (
                    <span className="w-4" aria-hidden="true" />
                  )}
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full rounded-[10px] py-3 text-sm font-semibold focus:ring-4 focus:ring-blue-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundColor: loading ? 'var(--dms-login-btn-bg, #2563EB)' : `var(--dms-login-btn-bg, #2563EB)`,
                    color: `var(--dms-login-btn-text, #FFFFFF)`,
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.target.style.backgroundColor = `var(--dms-login-btn-hover, #1D4ED8)`
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.target.style.backgroundColor = `var(--dms-login-btn-bg, #2563EB)`
                    }
                  }}
                >
                  {loading ? t('logging_in') : formCopy.loginButtonLabel}
                </button>
              </form>
              ) : authPanel === 'forgot_email' ? (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div>
                    <h3 className="mb-2 text-xl font-semibold text-gray-900">Forgot Password</h3>
                    <p className="mb-4 text-sm text-gray-600">
                      Enter your registered email address and we will send you a 6-digit reset code.
                    </p>
                  </div>

                  {forgotPasswordFeedback ? (
                    <div
                      className={`rounded-lg border p-3 ${
                        forgotPasswordFeedback.type === 'error'
                          ? 'border-red-200 bg-red-50'
                          : 'border-green-200 bg-green-50'
                      }`}
                    >
                      <p
                        className={`text-sm ${
                          forgotPasswordFeedback.type === 'error' ? 'text-red-800' : 'text-green-800'
                        }`}
                      >
                        {forgotPasswordFeedback.message}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="forgotPasswordEmail" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Email
                    </label>
                    <input
                      type="email"
                      id="forgotPasswordEmail"
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      required
                      className={inputClass}
                      placeholder="name@company.com"
                    />
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={forgotPasswordLoading}
                      className="w-full rounded-2xl py-3.5 text-base font-semibold transition-colors focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundColor: 'var(--dms-login-btn-bg, #2563EB)',
                        color: 'var(--dms-login-btn-text, #FFFFFF)',
                      }}
                      onMouseEnter={(e) => {
                        if (!forgotPasswordLoading) {
                          e.target.style.backgroundColor = 'var(--dms-login-btn-hover, #1D4ED8)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!forgotPasswordLoading) {
                          e.target.style.backgroundColor = 'var(--dms-login-btn-bg, #2563EB)'
                        }
                      }}
                    >
                      {forgotPasswordLoading ? 'Sending code...' : 'Send code'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setAuthPanel('login')
                        setForgotPasswordEmail('')
                        setForgotPasswordCode('')
                        setForgotNewPassword('')
                        setForgotConfirmPassword('')
                        setForgotPasswordFeedback(null)
                      }}
                      className="w-full rounded-2xl border-2 border-gray-300 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      {t('back_to_login')}
                    </button>
                  </div>
                </form>
              ) : authPanel === 'forgot_code' ? (
                <form onSubmit={handleVerifyForgotCode} className="space-y-5">
                  <div>
                    <h3 className="mb-2 text-xl font-semibold text-gray-900">Verify Reset Code</h3>
                    <p className="mb-4 text-sm text-gray-600">
                      Enter the 6-digit code sent to your email.
                    </p>
                  </div>

                  {forgotPasswordFeedback ? (
                    <div
                      className={`rounded-lg border p-3 ${
                        forgotPasswordFeedback.type === 'error'
                          ? 'border-red-200 bg-red-50'
                          : 'border-green-200 bg-green-50'
                      }`}
                    >
                      <p
                        className={`text-sm ${
                          forgotPasswordFeedback.type === 'error' ? 'text-red-800' : 'text-green-800'
                        }`}
                      >
                        {forgotPasswordFeedback.message}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="forgotPasswordCode" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Reset Code
                    </label>
                    <input
                      type="text"
                      id="forgotPasswordCode"
                      value={forgotPasswordCode}
                      onChange={(e) => setForgotPasswordCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      className="w-full rounded-2xl border border-gray-200 bg-[#F3F7FD] px-5 py-4 text-center font-mono text-2xl tracking-[0.5em] text-gray-900 transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                      placeholder="000000"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={forgotPasswordLoading || forgotPasswordCode.length !== 6}
                      className="w-full rounded-2xl py-3.5 text-base font-semibold transition-colors focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundColor: 'var(--dms-login-btn-bg, #2563EB)',
                        color: 'var(--dms-login-btn-text, #FFFFFF)'
                      }}
                      onMouseEnter={(e) => {
                        if (!forgotPasswordLoading) {
                          e.target.style.backgroundColor = 'var(--dms-login-btn-hover, #1D4ED8)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!forgotPasswordLoading) {
                          e.target.style.backgroundColor = 'var(--dms-login-btn-bg, #2563EB)'
                        }
                      }}
                    >
                      {forgotPasswordLoading ? 'Verifying...' : 'Verify code'}
                    </button>

                    <button
                      type="button"
                      onClick={handleResendForgotCode}
                      disabled={forgotResendTimer > 0 || forgotPasswordLoading}
                      className="w-full rounded-2xl border-2 border-gray-300 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {forgotResendTimer > 0 ? `Resend code (${forgotResendTimer}s)` : 'Resend code'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setAuthPanel('login')
                        setForgotPasswordEmail('')
                        setForgotPasswordCode('')
                        setForgotNewPassword('')
                        setForgotConfirmPassword('')
                        setForgotPasswordFeedback(null)
                      }}
                      className="w-full rounded-2xl border-2 border-gray-300 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      {t('back_to_login')}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleResetPasswordWithCode} className="space-y-5">
                  <div>
                    <h3 className="mb-2 text-xl font-semibold text-gray-900">Set New Password</h3>
                    <p className="mb-4 text-sm text-gray-600">
                      Enter a new password for your account.
                    </p>
                  </div>

                  {forgotPasswordFeedback ? (
                    <div
                      className={`rounded-lg border p-3 ${
                        forgotPasswordFeedback.type === 'error'
                          ? 'border-red-200 bg-red-50'
                          : 'border-green-200 bg-green-50'
                      }`}
                    >
                      <p
                        className={`text-sm ${
                          forgotPasswordFeedback.type === 'error' ? 'text-red-800' : 'text-green-800'
                        }`}
                      >
                        {forgotPasswordFeedback.message}
                      </p>
                    </div>
                  ) : null}

                  <div>
                    <label htmlFor="forgotNewPassword" className="mb-1.5 block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={forgotShowNewPassword ? 'text' : 'password'}
                        id="forgotNewPassword"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        required
                        className={passwordInputClass}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setForgotShowNewPassword(!forgotShowNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                      >
                        {forgotShowNewPassword ? (
                          <EyeSlashIcon className="h-4.5 w-4.5" />
                        ) : (
                          <EyeIcon className="h-4.5 w-4.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="forgotConfirmPassword" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={forgotShowConfirmPassword ? 'text' : 'password'}
                        id="forgotConfirmPassword"
                        value={forgotConfirmPassword}
                        onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        required
                        className={passwordInputClass}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setForgotShowConfirmPassword(!forgotShowConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-600"
                      >
                        {forgotShowConfirmPassword ? (
                          <EyeSlashIcon className="h-4.5 w-4.5" />
                        ) : (
                          <EyeIcon className="h-4.5 w-4.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={forgotPasswordLoading}
                      className="w-full rounded-2xl py-3.5 text-base font-semibold transition-colors focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundColor: 'var(--dms-login-btn-bg, #2563EB)',
                        color: 'var(--dms-login-btn-text, #FFFFFF)'
                      }}
                      onMouseEnter={(e) => {
                        if (!forgotPasswordLoading) {
                          e.target.style.backgroundColor = 'var(--dms-login-btn-hover, #1D4ED8)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!forgotPasswordLoading) {
                          e.target.style.backgroundColor = 'var(--dms-login-btn-bg, #2563EB)'
                        }
                      }}
                    >
                      {forgotPasswordLoading ? 'Updating password...' : 'Reset password & sign in'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setAuthPanel('login')
                        setForgotPasswordEmail('')
                        setForgotPasswordCode('')
                        setForgotNewPassword('')
                        setForgotConfirmPassword('')
                        setForgotPasswordFeedback(null)
                      }}
                      className="w-full rounded-2xl border-2 border-gray-300 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      {t('back_to_login')}
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="text-[12px] text-gray-400 transition-colors hover:text-gray-600"
                >
                  {`← ${formCopy.backToHomeText}`}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
  )
}
