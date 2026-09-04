let state = {
  active: false,
  label: '',
  count: 0
}

const listeners = new Set()
let activeCount = 0
let showTimer = null
let hideTimer = null

const emit = () => {
  for (const fn of listeners) fn(state)
}

export const getGlobalLoading = () => state

export const subscribeGlobalLoading = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const startGlobalLoading = (label) => {
  activeCount += 1
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  const nextLabel = label || state.label || 'Working...'

  state = {
    ...state,
    label: nextLabel,
    count: activeCount
  }
  emit()

  if (!state.active && !showTimer) {
    showTimer = setTimeout(() => {
      state = { ...state, active: activeCount > 0, count: activeCount }
      emit()
      showTimer = null
    }, 200)
  }
}

export const finishGlobalLoading = () => {
  activeCount = Math.max(0, activeCount - 1)
  state = { ...state, count: activeCount }
  emit()

  if (activeCount > 0) return

  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    state = {
      active: false,
      label: '',
      count: 0
    }
    emit()
    hideTimer = null
  }, 150)
}

export const failGlobalLoading = () => {
  finishGlobalLoading()
}

