import { useEffect, useState } from 'react'

export default function useLoadingProgress(
  active,
  {
    start = 12,
    max = 92,
    stepMs = 220
  } = {}
) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!active) {
      setProgress(0)
      return undefined
    }

    setProgress((prev) => (prev > 0 ? prev : start))

    const intervalId = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= max) return prev
        const remaining = max - prev
        const step = Math.max(1, Math.ceil(remaining / 6))
        return Math.min(max, prev + step)
      })
    }, stepMs)

    return () => window.clearInterval(intervalId)
  }, [active, max, start, stepMs])

  return progress
}
