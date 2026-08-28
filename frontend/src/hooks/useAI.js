import { useCallback, useEffect, useState } from 'react'
import aiApi from '../api/ai'

export function useAI() {
  const [config, setConfig] = useState(null)
  const [health, setHealth] = useState(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [loading, setLoading] = useState({
    health: false,
    config: false,
    summarize: false,
    autofill: false,
    classify: false,
    suggestFields: false,
    chat: false,
    search: false,
    rephrase: false,
    workflow: false,
    remarks: false,
    grammar: false,
  })
  const [errors, setErrors] = useState({})

  const setLoadingState = (key, value) =>
    setLoading((prev) => ({ ...prev, [key]: value }))

  const setError = (key, msg) =>
    setErrors((prev) => ({ ...prev, [key]: msg || null }))

  const fetchConfig = useCallback(async () => {
    setLoadingState('config', true)
    setError('config', null)
    try {
      const data = await aiApi.getConfig()
      setConfig(data)
      setConfigLoaded(true)
      return data
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to load AI config'
      setError('config', msg)
      return null
    } finally {
      setLoadingState('config', false)
    }
  }, [])

  const checkHealth = useCallback(async (options = {}) => {
    setLoadingState('health', true)
    setError('health', null)
    try {
      const data = await aiApi.healthCheck(options)
      setHealth(data)
      if (data?.configured && (data?.enabled != null || data?.status === 'online' || data?.status === 'disabled')) {
        setConfig((prev) => prev || {
          enabled: data?.enabled ?? data?.status === 'online',
          provider: data?.provider || null,
          model: data?.model,
        })
        setConfigLoaded(true)
      }
      return data
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'AI health check failed'
      setError('health', msg)
      return null
    } finally {
      setLoadingState('health', false)
    }
  }, [])

  const summarize = useCallback(async (payload) => {
    setLoadingState('summarize', true)
    setError('summarize', null)
    try {
      return await aiApi.summarizeDocument(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to summarize document'
      setError('summarize', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('summarize', false)
    }
  }, [])

  const autofill = useCallback(async (payload) => {
    setLoadingState('autofill', true)
    setError('autofill', null)
    try {
      return await aiApi.autofillFormFields(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to autofill fields'
      setError('autofill', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('autofill', false)
    }
  }, [])

  const classify = useCallback(async (payload) => {
    setLoadingState('classify', true)
    setError('classify', null)
    try {
      return await aiApi.classifyDocument(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to classify document'
      setError('classify', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('classify', false)
    }
  }, [])

  const suggestFields = useCallback(async (payload) => {
    setLoadingState('suggestFields', true)
    setError('suggestFields', null)
    try {
      return await aiApi.suggestTemplateFields(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to suggest template fields'
      setError('suggestFields', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('suggestFields', false)
    }
  }, [])

  const chat = useCallback(async (payload) => {
    setLoadingState('chat', true)
    setError('chat', null)
    try {
      return await aiApi.chat(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'AI chat failed'
      setError('chat', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('chat', false)
    }
  }, [])

  const searchDocuments = useCallback(async (payload) => {
    setLoadingState('search', true)
    setError('search', null)
    try {
      return await aiApi.searchDocumentsNL(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'AI search failed'
      setError('search', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('search', false)
    }
  }, [])

  const rephrase = useCallback(async (payload) => {
    setLoadingState('rephrase', true)
    setError('rephrase', null)
    try {
      return await aiApi.rephraseText(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'AI rephrase failed'
      setError('rephrase', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('rephrase', false)
    }
  }, [])

  const suggestWorkflow = useCallback(async (payload) => {
    setLoadingState('workflow', true)
    setError('workflow', null)
    try {
      return await aiApi.suggestWorkflowRoute(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'AI workflow suggestion failed'
      setError('workflow', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('workflow', false)
    }
  }, [])

  const generateRemarks = useCallback(async (payload) => {
    setLoadingState('remarks', true)
    setError('remarks', null)
    try {
      return await aiApi.generateReviewerRemarks(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'AI remarks generator failed'
      setError('remarks', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('remarks', false)
    }
  }, [])

  const checkGrammar = useCallback(async (payload) => {
    setLoadingState('grammar', true)
    setError('grammar', null)
    try {
      return await aiApi.checkGrammarSpelling(payload)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'AI grammar check failed'
      setError('grammar', msg)
      throw new Error(msg)
    } finally {
      setLoadingState('grammar', false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let attempt = 0
    const MAX_ATTEMPTS = 3
    const POLL_INTERVAL_MS = 7000
    let internalLoaded = false
    const tryLoad = async () => {
      attempt += 1
      if (cancelled || internalLoaded) return
      // Call fetchConfig only (cheap, no Google API hit); checkHealth ONLY if config failed.
      const cfgRes = await fetchConfig()
      let hRes = null
      if (!cancelled && !internalLoaded && (!cfgRes || cfgRes.enabled == null)) {
        hRes = await checkHealth({ deep: false })
      }
      if (cancelled) return
      if (!internalLoaded && (cfgRes || hRes)) {
        const enabledKnown =
          (cfgRes && (cfgRes.enabled != null || cfgRes.provider)) ||
          (hRes && hRes.status && (hRes.status === 'online' || hRes.status === 'disabled'))
        if (enabledKnown) {
          internalLoaded = true
          setConfigLoaded(true)
          if (hRes?.status === 'online' || hRes?.enabled === true || cfgRes?.enabled === true) {
            setConfig((prev) => prev || {
              enabled: true,
              provider: cfgRes?.provider || hRes?.provider || null,
              model: hRes?.model || cfgRes?.model || null,
            })
          } else if (cfgRes?.enabled === false || hRes?.status === 'disabled') {
            setConfig((prev) => prev || { enabled: false, provider: null, model: null })
          }
        }
      }
      if (!internalLoaded && attempt >= MAX_ATTEMPTS) {
        internalLoaded = true
        setConfigLoaded(true)
        setConfig((prev) => prev || { enabled: false, provider: null, model: null })
      }
    }
    tryLoad()
    const t = setInterval(() => {
      if (cancelled || internalLoaded || attempt >= MAX_ATTEMPTS) {
        clearInterval(t)
        return
      }
      tryLoad()
    }, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aiEnabled = configLoaded ? Boolean(config?.enabled) : null

  const forceRefreshAIStatus = useCallback(async ({ deep = false } = {}) => {
    const [cfgRes, hRes] = await Promise.allSettled([fetchConfig(), checkHealth({ deep })])
    const cfg = cfgRes.status === 'fulfilled' ? cfgRes.value : null
    const h = hRes.status === 'fulfilled' ? hRes.value : null
    return { config: cfg, health: h }
  }, [fetchConfig, checkHealth])

  return {
    // config + health
    config,
    health,
    configLoaded,
    aiEnabled,
    loading,
    errors,
    fetchConfig,
    checkHealth,
    forceRefreshAIStatus,
    // features
    summarize,
    autofill,
    classify,
    suggestFields,
    chat,
    searchDocuments,
    rephrase,
    suggestWorkflow,
    generateRemarks,
    checkGrammar,
  }
}

export default useAI
