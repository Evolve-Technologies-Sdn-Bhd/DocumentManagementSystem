/**
 * Session Manager
 * Handles session timeout, activity tracking, and HMR detection
 */

// Session configuration
const SESSION_CONFIG = {
  // Idle timeout: 30 minutes of inactivity
  IDLE_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  
  // Absolute timeout: 8 hours maximum session duration
  ABSOLUTE_TIMEOUT: 8 * 60 * 60 * 1000, // 8 hours
  
  // Warning before timeout: Show warning 2 minutes before
  WARNING_BEFORE_TIMEOUT: 2 * 60 * 1000, // 2 minutes
  
  // Check interval: How often to check for timeout
  CHECK_INTERVAL: 60 * 1000 // 1 minute
}

class SessionManager {
  constructor() {
    this.idleTimer = null
    this.checkTimer = null
    this.warningTimer = null
    this.sessionStartTime = null
    this.lastActivityTime = null
    this.warningCallback = null
    this.logoutCallback = null
    this.isWarningShown = false
  }

  /**
   * Initialize session manager
   */
  init(onWarning, onLogout) {
    this.warningCallback = onWarning
    this.logoutCallback = onLogout

    // Set session start time from localStorage or now
    const storedStartTime = localStorage.getItem('sessionStartTime')
    this.sessionStartTime = storedStartTime ? parseInt(storedStartTime) : Date.now()
    
    if (!storedStartTime) {
      localStorage.setItem('sessionStartTime', this.sessionStartTime.toString())
    }

    // Set last activity time
    this.lastActivityTime = Date.now()
    localStorage.setItem('lastActivityTime', this.lastActivityTime.toString())

    // Set up activity listeners
    this.setupActivityListeners()

    // Start checking for timeout
    this.startTimeoutCheck()

    // Listen for HMR (Hot Module Replacement) events
    this.setupHMRDetection()

    console.log('Session manager initialized')
  }

  /**
   * Setup activity listeners to track user interaction
   */
  setupActivityListeners() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    
    events.forEach(event => {
      document.addEventListener(event, () => this.updateActivity(), true)
    })
  }

  /**
   * Update last activity time
   */
  updateActivity(force = false) {
    if (this.isWarningShown && !force) return
    this.lastActivityTime = Date.now()
    localStorage.setItem('lastActivityTime', this.lastActivityTime.toString())
  }

  /**
   * Start checking for timeout
   */
  startTimeoutCheck() {
    this.checkTimer = setInterval(() => {
      this.checkTimeout()
    }, SESSION_CONFIG.CHECK_INTERVAL)

    // Also check immediately
    this.checkTimeout()
  }

  /**
   * Check if session has timed out
   */
  checkTimeout() {
    const now = Date.now()
    const idleTime = now - this.lastActivityTime
    const totalSessionTime = now - this.sessionStartTime

    // Check absolute timeout (8 hours maximum)
    if (totalSessionTime >= SESSION_CONFIG.ABSOLUTE_TIMEOUT) {
      console.log('Session expired: Absolute timeout reached')
      this.logout('Your session has expired after 8 hours. Please log in again.')
      return
    }

    // Check idle timeout (30 minutes of inactivity)
    if (idleTime >= SESSION_CONFIG.IDLE_TIMEOUT) {
      console.log('Session expired: Idle timeout reached')
      this.logout('You have been logged out due to inactivity.')
      return
    }

    // Check if warning should be shown
    const timeUntilIdleTimeout = SESSION_CONFIG.IDLE_TIMEOUT - idleTime
    const timeUntilAbsoluteTimeout = SESSION_CONFIG.ABSOLUTE_TIMEOUT - totalSessionTime
    const minTimeUntilTimeout = Math.min(timeUntilIdleTimeout, timeUntilAbsoluteTimeout)

    if (minTimeUntilTimeout <= SESSION_CONFIG.WARNING_BEFORE_TIMEOUT && !this.isWarningShown) {
      this.showWarning(Math.floor(minTimeUntilTimeout / 1000))
    }
  }

  /**
   * Show warning before timeout
   */
  showWarning(secondsRemaining) {
    this.isWarningShown = true
    if (this.warningCallback) {
      this.warningCallback(true, secondsRemaining)
    }
  }

  /**
   * Logout user
   */
  logout(message = 'Session expired') {
    // Clear all timers
    if (this.checkTimer) clearInterval(this.checkTimer)
    if (this.warningTimer) clearTimeout(this.warningTimer)

    // Clear session data
    localStorage.removeItem('sessionStartTime')
    localStorage.removeItem('lastActivityTime')
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')

    // Call logout callback
    if (this.logoutCallback) {
      this.logoutCallback(message)
    }
  }

  /**
   * Extend session (when user clicks "Stay logged in")
   */
  extendSession() {
    this.updateActivity(true)
    this.isWarningShown = false
    if (this.warningCallback) {
      this.warningCallback(false)
    }
  }

  /**
   * Setup HMR (Hot Module Replacement) detection
   * Logs out user when code changes in development
   */
  setupHMRDetection() {
    // Only in development mode
    if (import.meta.env.DEV && import.meta.hot && import.meta.env.VITE_HMR_LOGOUT === 'true') {
      // Check if we were flagged for logout after HMR
      const shouldLogout = sessionStorage.getItem('hmrUpdate')
      if (shouldLogout === 'true') {
        sessionStorage.removeItem('hmrUpdate')
        console.log('Code change detected, logging out...')
        this.logout('Application has been updated. Please log in again.')
        return
      }

      // Listen for Vite HMR events
      import.meta.hot.on('vite:beforeUpdate', () => {
        console.log('HMR update detected, flagging for logout')
        // Flag that an update is happening - will logout on next init
        sessionStorage.setItem('hmrUpdate', 'true')
      })
    }
  }

  /**
   * Get remaining session time
   */
  getRemainingTime() {
    const now = Date.now()
    const idleTime = now - this.lastActivityTime
    const totalSessionTime = now - this.sessionStartTime

    const timeUntilIdleTimeout = SESSION_CONFIG.IDLE_TIMEOUT - idleTime
    const timeUntilAbsoluteTimeout = SESSION_CONFIG.ABSOLUTE_TIMEOUT - totalSessionTime

    return {
      idle: Math.max(0, timeUntilIdleTimeout),
      absolute: Math.max(0, timeUntilAbsoluteTimeout),
      minimum: Math.max(0, Math.min(timeUntilIdleTimeout, timeUntilAbsoluteTimeout))
    }
  }

  /**
   * Destroy session manager
   */
  destroy() {
    if (this.checkTimer) clearInterval(this.checkTimer)
    if (this.warningTimer) clearTimeout(this.warningTimer)
  }
}

// Export singleton instance
export const sessionManager = new SessionManager()

// Export configuration for reference
export { SESSION_CONFIG }
