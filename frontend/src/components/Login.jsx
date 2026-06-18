import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DocumentTextIcon, UserIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import api from '../api/axios'
import { getDefaultRoute } from '../utils/defaultRoute'
import { updateUserData } from '../utils/userDataEvents'
import { usePreferences } from '../contexts/PreferencesContext'
import { readBranding, subscribeBranding } from '../utils/branding'
import PublicTopbar from './PublicTopbar'
import PublicFooter from './PublicFooter'

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
      setError(err.response?.data?.message || 'Login failed')
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

  return (
    <div className="min-h-screen pt-16 pb-14" style={{ background: `linear-gradient(to bottom right, var(--dms-login-bg-start, #F9FAFB), var(--dms-login-bg-end, #EFF6FF))` }}>
      <PublicTopbar />
      <PublicFooter />

      {/* Login Section */}
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)] py-12 px-4">
        <div className="grid md:grid-cols-2 gap-16 items-center max-w-7xl w-full">
          {/* Left Side - Illustration */}
          <div className="hidden md:flex justify-center">
            <div className="text-center">
              <div className="mb-6">
                {branding.logo ? (
                  <div className="inline-block p-8 bg-white rounded-3xl shadow-sm">
                    <img src={branding.logo} alt="Company Logo" className="h-48 w-auto object-contain" />
                  </div>
                ) : (
                  <div className="inline-block p-8 rounded-3xl" style={{ backgroundColor: `var(--dms-login-accent-bg, #DBEAFE)` }}>
                    <DocumentTextIcon className="h-48 w-48" style={{ color: `var(--dms-login-accent-icon, #2563EB)` }} />
                  </div>
                )}
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">{branding.welcomeMessage.replace('{companyName}', branding.companyName)}</h3>
              <p className="text-gray-600">{t('secure_dms')}</p>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="w-full max-w-lg mx-auto">
            <div className="rounded-2xl p-10" style={{ backgroundColor: `var(--dms-login-card-bg, #FFFFFF)`, boxShadow: `var(--dms-login-card-shadow, 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04))` }}>
              {/* Logo & Title */}
              <div className="text-center mb-10">
                <div className="flex items-center justify-center mb-5">
                  {branding.logo ? (
                    <div className="h-20 flex items-center bg-white rounded-xl px-4 shadow-sm">
                      <img src={branding.logo} alt="Company Logo" className="max-h-16 max-w-[240px] object-contain" />
                    </div>
                  ) : (
                    <div className="flex items-center px-5 py-3 rounded-lg" style={{ backgroundColor: `var(--dms-login-btn-bg, #2563EB)` }}>
                      <DocumentTextIcon className="h-10 w-10" style={{ color: `var(--dms-login-btn-text, #FFFFFF)` }} />
                      <span className="ml-3 text-3xl font-bold" style={{ color: `var(--dms-login-btn-text, #FFFFFF)` }}>{branding.companyName}</span>
                    </div>
                  )}
                </div>
                <p className="text-gray-600 text-base">{t('sign_in_desc')}</p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-base">{error}</p>
                </div>
              )}

              {/* 2FA Verification Form */}
              {show2FA ? (
                <form onSubmit={handleVerify2FA} className="space-y-6">
                  <div className="text-center mb-6">
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
                    <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                      {t('verification_code')}
                    </label>
                    <input
                      type="text"
                      id="code"
                      value={verificationCode}
                      onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      className="w-full px-5 py-4 text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                    className="w-full py-4 text-lg rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
              <form onSubmit={submit} className="space-y-6">
                {/* Email/Username Input */}
                <div>
                  <label htmlFor="email" className="block text-base font-medium text-gray-700 mb-2">
                    <UserIcon className="inline h-5 w-5 mr-1" />
                    {t('enter_username')}
                  </label>
                  <input
                    type="text"
                    id="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full px-5 py-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder="username or email"
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="block text-base font-medium text-gray-700 mb-2">
                    <LockClosedIcon className="inline h-5 w-5 mr-1" />
                    {t('enter_password')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="w-full px-5 py-4 pr-12 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-6 w-6" />
                      ) : (
                        <EyeIcon className="h-6 w-6" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-base text-gray-700">{t('remember_me')}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(true)}
                    className="text-base text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    {t('forgot_password_q')}
                  </button>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 text-lg rounded-lg font-semibold focus:ring-4 focus:ring-blue-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                  {loading ? t('logging_in') : t('login_btn')}
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
                      className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                        className="w-full px-4 py-3 pr-11 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                        className="w-full px-4 py-3 pr-11 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                        className="w-full px-4 py-3 pr-11 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
                      className="w-full py-3.5 text-base rounded-lg font-semibold focus:ring-4 focus:ring-blue-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                      className="w-full py-3.5 text-base rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {t('back_to_login')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
