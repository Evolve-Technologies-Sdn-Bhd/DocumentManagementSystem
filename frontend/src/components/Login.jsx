import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DocumentTextIcon, UserIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
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
  const [loginPageSettings, setLoginPageSettings] = useState(() => normalizeLoginPageSettings(readLoginPageSettings()))
  const [showPassword, setShowPassword] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [changePasswordData, setChangePasswordData] = useState({
    username: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [changePasswordMessage, setChangePasswordMessage] = useState('')
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    hasMinLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false
  })
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
    setBranding(readBranding())
    return subscribeBranding((next) => setBranding(next))
  }, [])

  useEffect(() => {
    let mounted = true

    const loadSettings = async () => {
      try {
        const res = await api.get('/public/login-page-settings')
        const serverSettings = res.data?.data?.settings
        if (serverSettings && typeof serverSettings === 'object') {
          const normalized = normalizeLoginPageSettings(serverSettings)
          if (!mounted) return
          setLoginPageSettings(normalized)
          persistLoginPageSettings(normalized)
          return
        }
      } catch {}

      if (!mounted) return
      setLoginPageSettings(normalizeLoginPageSettings(readLoginPageSettings()))
    }

    loadSettings()
    const unsubscribe = subscribeLoginPageSettings((next) => {
      setLoginPageSettings(normalizeLoginPageSettings(next))
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      const res = await api.post('/auth/login', { email, password })
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

  // Password strength checker
  const checkPasswordStrength = (password) => {
    const strength = {
      score: 0,
      hasMinLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*]/.test(password)
    }
    
    // Calculate score
    if (strength.hasMinLength) strength.score++
    if (strength.hasUpperCase) strength.score++
    if (strength.hasLowerCase) strength.score++
    if (strength.hasNumber) strength.score++
    if (strength.hasSpecialChar) strength.score++
    
    setPasswordStrength(strength)
  }

  const handleNewPasswordChange = (value) => {
    setChangePasswordData(prev => ({ ...prev, newPassword: value }))
    checkPasswordStrength(value)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setChangePasswordMessage('')
    
    // Validation
    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
      setChangePasswordMessage('New passwords do not match')
      return
    }
    
    const meetsAllPasswordRequirements =
      passwordStrength.hasMinLength &&
      passwordStrength.hasUpperCase &&
      passwordStrength.hasLowerCase &&
      passwordStrength.hasNumber &&
      passwordStrength.hasSpecialChar

    if (!meetsAllPasswordRequirements) {
      setChangePasswordMessage('new password set does not follow password requirements')
      return
    }
    
    setChangePasswordLoading(true)
    
    try {
      // First, login to verify username and current password
      const loginRes = await api.post('/auth/login', { 
        email: changePasswordData.username, 
        password: changePasswordData.currentPassword 
      })
      
      // Handle 2FA enabled accounts
      if (loginRes.data?.data?.requires2FA) {
        setChangePasswordMessage('Two-factor authentication is enabled. Please log in normally and change your password from Profile Settings.')
        setChangePasswordLoading(false)
        return
      }

      const token = loginRes.data?.data?.accessToken
      if (!token) {
        throw new Error('Authentication failed')
      }
      
      // Then change the password
      const changeRes = await api.post('/auth/change-password', {
        currentPassword: changePasswordData.currentPassword,
        newPassword: changePasswordData.newPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      setChangePasswordMessage('Password changed successfully! Redirecting to login...')
      setTimeout(() => {
        setShowChangePassword(false)
        setChangePasswordData({
          username: '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
        setPasswordStrength({
          score: 0,
          hasMinLength: false,
          hasUpperCase: false,
          hasLowerCase: false,
          hasNumber: false,
          hasSpecialChar: false
        })
        setChangePasswordMessage('')
      }, 2000)
    } catch (err) {
      const backendMessage = err.response?.data?.message
      setChangePasswordMessage(
        backendMessage && /validation failed/i.test(backendMessage)
          ? 'new password set does not follow password requirements'
          : (backendMessage || 'Failed to change password. Please check your credentials.')
      )
    } finally {
      setChangePasswordLoading(false)
    }
  }

  const hero = loginPageSettings.heroSection
  const formCopy = DEFAULT_LOGIN_FORM_COPY
  const brandLogo = branding.logo
  const brandLogoPlaceholder = branding.logoPlaceholder
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
  const loginFontFamily = "Outfit, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

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
              ) : !showChangePassword ? (
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
                      onClick={() => setShowChangePassword(true)}
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
              ) : (
                /* Change Password Form */
                <form onSubmit={handleChangePassword} className="space-y-5">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('change_password_title')}</h3>
                    <p className="text-sm text-gray-600 mb-4">{t('change_password_desc')}</p>
                  </div>
                  
                  {changePasswordMessage && (
                    <div className={`p-3 rounded-lg border ${changePasswordMessage.includes('Failed') || changePasswordMessage.includes('not match') || changePasswordMessage.includes('weak') || changePasswordMessage.includes('requirements') ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <p className={`text-sm ${changePasswordMessage.includes('Failed') || changePasswordMessage.includes('not match') || changePasswordMessage.includes('weak') || changePasswordMessage.includes('requirements') ? 'text-red-800' : 'text-green-800'}`}>{changePasswordMessage}</p>
                    </div>
                  )}
                  
                  {/* Username */}
                  <div>
                    <label htmlFor="changeUsername" className="block text-sm font-medium text-gray-700 mb-1.5">
                      <UserIcon className="inline h-4 w-4 mr-1" />
                      {t('username_or_email')}
                    </label>
                    <input
                      type="text"
                      id="changeUsername"
                      value={changePasswordData.username}
                      onChange={e => setChangePasswordData(prev => ({ ...prev, username: e.target.value }))}
                      required
                      className="w-full rounded-2xl border border-gray-200 bg-[#F3F7FD] px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                      placeholder="username or email"
                    />
                  </div>
                  
                  {/* Current Password */}
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                      <LockClosedIcon className="inline h-4 w-4 mr-1" />
                      {t('current_password')}
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        id="currentPassword"
                        value={changePasswordData.currentPassword}
                        onChange={e => setChangePasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                        required
                        className="w-full rounded-2xl border border-gray-200 bg-[#F3F7FD] px-4 py-3 pr-11 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {showCurrentPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  
                  {/* New Password */}
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                      <LockClosedIcon className="inline h-4 w-4 mr-1" />
                      {t('new_password')}
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        id="newPassword"
                        value={changePasswordData.newPassword}
                        onChange={e => handleNewPasswordChange(e.target.value)}
                        required
                        className="w-full rounded-2xl border border-gray-200 bg-[#F3F7FD] px-4 py-3 pr-11 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {showNewPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                    
                    {/* Password Strength Indicator */}
                    {changePasswordData.newPassword && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${
                                passwordStrength.score <= 2 ? 'bg-red-500' :
                                passwordStrength.score === 3 ? 'bg-yellow-500' :
                                passwordStrength.score === 4 ? 'bg-blue-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                            ></div>
                          </div>
                          <span className={`text-xs font-medium ${
                            passwordStrength.score <= 2 ? 'text-red-600' :
                            passwordStrength.score === 3 ? 'text-yellow-600' :
                            passwordStrength.score === 4 ? 'text-blue-600' :
                            'text-green-600'
                          }`}>
                            {passwordStrength.score <= 2 ? t('weak') :
                             passwordStrength.score === 3 ? t('fair') :
                             passwordStrength.score === 4 ? t('good') :
                             t('strong')}
                          </span>
                        </div>
                        
                        {/* Requirements Checklist */}
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                          <p className="text-xs font-medium text-gray-700 mb-2">{t('pass_req_title')}</p>
                          <div className="flex items-center gap-2">
                            {passwordStrength.hasMinLength ? 
                              <CheckCircleIcon className="h-4 w-4 text-green-500" /> : 
                              <XCircleIcon className="h-4 w-4 text-red-500" />}
                            <span className={`text-xs ${passwordStrength.hasMinLength ? 'text-green-700' : 'text-red-700'}`}>
                              {t('pass_req_min_len')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {passwordStrength.hasUpperCase ? 
                              <CheckCircleIcon className="h-4 w-4 text-green-500" /> : 
                              <XCircleIcon className="h-4 w-4 text-red-500" />}
                            <span className={`text-xs ${passwordStrength.hasUpperCase ? 'text-green-700' : 'text-red-700'}`}>
                              {t('pass_req_upper')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {passwordStrength.hasLowerCase ? 
                              <CheckCircleIcon className="h-4 w-4 text-green-500" /> : 
                              <XCircleIcon className="h-4 w-4 text-red-500" />}
                            <span className={`text-xs ${passwordStrength.hasLowerCase ? 'text-green-700' : 'text-red-700'}`}>
                              {t('pass_req_lower')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {passwordStrength.hasNumber ? 
                              <CheckCircleIcon className="h-4 w-4 text-green-500" /> : 
                              <XCircleIcon className="h-4 w-4 text-red-500" />}
                            <span className={`text-xs ${passwordStrength.hasNumber ? 'text-green-700' : 'text-red-700'}`}>
                              {t('pass_req_number')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {passwordStrength.hasSpecialChar ? 
                              <CheckCircleIcon className="h-4 w-4 text-green-500" /> : 
                              <XCircleIcon className="h-4 w-4 text-red-500" />}
                            <span className={`text-xs ${passwordStrength.hasSpecialChar ? 'text-green-700' : 'text-red-700'}`}>
                              {t('pass_req_special')}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Confirm Password */}
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                      <LockClosedIcon className="inline h-4 w-4 mr-1" />
                      {t('confirm_new_password')}
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        id="confirmPassword"
                        value={changePasswordData.confirmPassword}
                        onChange={e => setChangePasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        required
                        className="w-full rounded-2xl border border-gray-200 bg-[#F3F7FD] px-4 py-3 pr-11 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                      </button>
                    </div>
                    {changePasswordData.confirmPassword && changePasswordData.newPassword !== changePasswordData.confirmPassword && (
                      <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                        <XCircleIcon className="h-3.5 w-3.5" />
                        {t('pass_mismatch')}
                      </p>
                    )}
                    {changePasswordData.confirmPassword && changePasswordData.newPassword === changePasswordData.confirmPassword && (
                      <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        {t('pass_match')}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={changePasswordLoading}
                      className="w-full rounded-2xl py-3.5 text-base font-semibold focus:ring-4 focus:ring-blue-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      style={{
                        backgroundColor: changePasswordLoading ? 'var(--dms-login-btn-bg, #2563EB)' : `var(--dms-login-btn-bg, #2563EB)`,
                        color: `var(--dms-login-btn-text, #FFFFFF)`,
                      }}
                      onMouseEnter={(e) => {
                        if (!changePasswordLoading) {
                          e.target.style.backgroundColor = `var(--dms-login-btn-hover, #1D4ED8)`
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!changePasswordLoading) {
                          e.target.style.backgroundColor = `var(--dms-login-btn-bg, #2563EB)`
                        }
                      }}
                    >
                      {changePasswordLoading ? t('changing_password') : t('change_password_title')}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setShowChangePassword(false)
                        setChangePasswordData({
                          username: '',
                          currentPassword: '',
                          newPassword: '',
                          confirmPassword: ''
                        })
                        setPasswordStrength({
                          score: 0,
                          hasMinLength: false,
                          hasUpperCase: false,
                          hasLowerCase: false,
                          hasNumber: false,
                          hasSpecialChar: false
                        })
                        setChangePasswordMessage('')
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
