import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { sessionManager } from '../utils/sessionManager'

/**
 * Session timeout warning modal
 */
function SessionWarningModal({ secondsRemaining, onExtend, onLogout }) {
  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[95]">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-yellow-50">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="w-8 h-8 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Session Timeout Warning</h3>
              <p className="text-sm text-gray-600">Your session is about to expire</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-gray-700 mb-4">
            You will be automatically logged out in:
          </p>
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-yellow-700">
              {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
            </div>
            <div className="text-sm text-yellow-600 mt-1">minutes remaining</div>
          </div>
          <p className="text-sm text-gray-600 mt-4">
            Click "Stay Logged In" to continue your session, or "Logout" to end your session now.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onLogout}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Logout Now
          </button>
          <button
            onClick={onExtend}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Session Provider Component
 * Manages session timeout and handles automatic logout
 */
export default function SessionProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [showWarning, setShowWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const countdownIntervalRef = React.useRef(null)

  useEffect(() => {
    // Don't initialize session manager on login page
    if (location.pathname === '/login') {
      return
    }

    // Check if user is logged in
    const token = localStorage.getItem('token')
    if (!token) {
      return
    }

    // Initialize session manager
    sessionManager.init(
      // On warning callback
      (show, seconds) => {
        setShowWarning(show)
        if (show) {
          setSecondsRemaining(seconds)
          
          // Start countdown
          const interval = setInterval(() => {
            setSecondsRemaining(prev => {
              if (prev <= 1) {
                clearInterval(interval)
                return 0
              }
              return prev - 1
            })
          }, 1000)
          
          countdownIntervalRef.current = interval
        } else {
          // Clear countdown when warning is hidden
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
            countdownIntervalRef.current = null
          }
        }
      },
      // On logout callback
      (message) => {
        setShowWarning(false)
        
        // Clear countdown
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
        }

        // Show message (optional: you can use a toast notification here)
        if (message) {
        }

        // Redirect to login
        navigate('/login', { replace: true })
      }
    )

    // Cleanup on unmount
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
      sessionManager.destroy()
    }
  }, [location.pathname, navigate])

  const handleExtendSession = () => {
    sessionManager.extendSession()
    setShowWarning(false)
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }

  const handleLogoutNow = () => {
    sessionManager.logout('You have been logged out.')
  }

  return (
    <>
      {children}
      {showWarning && (
        <SessionWarningModal
          secondsRemaining={secondsRemaining}
          onExtend={handleExtendSession}
          onLogout={handleLogoutNow}
        />
      )}
    </>
  )
}
