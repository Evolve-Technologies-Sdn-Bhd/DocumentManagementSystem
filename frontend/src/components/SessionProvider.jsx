import React, { useEffect, useState } from 'react'
import Modal, { ModalHeader, ModalBody, ModalFooter } from './ui/Modal'
import { useNavigate, useLocation } from 'react-router-dom'
import { sessionManager } from '../utils/sessionManager'

/**
 * Session timeout warning modal
 */
function SessionWarningModal({ secondsRemaining, onExtend, onLogout }) {
  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60

  return (
    <Modal isOpen size="sm">
      <ModalHeader
        title="Session Timeout Warning"
        subtitle="Your session is about to expire"
      />

      <ModalBody>
        <p className="text-sm text-ink-secondary mb-4">
          You will be automatically logged out in:
        </p>

        <div className="rounded-lg border border-[var(--dms-color-warning-ink)]/30 bg-[var(--dms-color-warning-soft)] p-4 text-center">
          <div className="text-3xl font-bold text-[var(--dms-color-warning-ink)] tabular-nums">
            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
          </div>
          <div className="text-sm text-[var(--dms-color-warning-ink)] mt-1">
            minutes remaining
          </div>
        </div>

        <p className="text-sm text-ink-secondary mt-4">
          Click "Stay Logged In" to continue your session, or "Logout" to end your session now.
        </p>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg h-10 px-4 border border-[var(--dms-color-border-default)] bg-[var(--dms-color-bg-surface)] text-ink-secondary font-medium hover:bg-[var(--dms-color-bg-surface-muted)] transition-colors"
        >
          Logout Now
        </button>

        <button
          type="button"
          onClick={onExtend}
          className="rounded-lg h-10 px-4 bg-[var(--dms-color-brand-primary)] text-white font-semibold hover:opacity-90 transition-colors"
        >
          Stay Logged In
        </button>
      </ModalFooter>
    </Modal>
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
