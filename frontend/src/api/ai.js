import api from './axios'

const AI_BASE = '/ai'

const aiApi = {
  healthCheck: (options = {}) => {
    const query = []
    if (options?.deep) query.push('deep=true')
    if (options?.force) query.push('force=true')
    const qs = query.length ? `?${query.join('&')}` : ''
    return api.get(`${AI_BASE}/health${qs}`).then((r) => r.data?.data ?? r.data)
  },

  getConfig: () =>
    api.get(`${AI_BASE}/config`).then((r) => r.data?.data ?? r.data),

  summarizeDocument: (payload) => {
    const { file, documentText, format, maxSentences, language, includeKeyPoints } = payload || {}

    if (file) {
      const fd = new FormData()
      fd.append('file', file)
      if (format) fd.append('format', format)
      if (maxSentences) fd.append('maxSentences', String(maxSentences))
      if (language) fd.append('language', language)
      if (includeKeyPoints != null) fd.append('includeKeyPoints', String(includeKeyPoints))
      return api
        .post(`${AI_BASE}/summarize`, fd, { skipGlobalLoading: true })
        .then((r) => r.data?.data ?? r.data)
    }

    return api
      .post(
        `${AI_BASE}/summarize`,
        { documentText, format, maxSentences, language, includeKeyPoints },
        { skipGlobalLoading: true }
      )
      .then((r) => r.data?.data ?? r.data)
  },

  autofillFormFields: (payload) => {
    const { file, fields, fieldDefinitions, contextText, language, strict } = payload || {}

    if (file) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('fields', JSON.stringify(fields || fieldDefinitions || []))
      if (language) fd.append('language', language)
      if (strict != null) fd.append('strict', String(strict))
      return api
        .post(`${AI_BASE}/autofill`, fd, { skipGlobalLoading: true })
        .then((r) => r.data?.data ?? r.data)
    }

    return api
      .post(
        `${AI_BASE}/autofill`,
        { fields: fields || fieldDefinitions, contextText, language, strict },
        { skipGlobalLoading: true }
      )
      .then((r) => r.data?.data ?? r.data)
  },

  classifyDocument: (payload) => {
    const { file, documentText, categories, language } = payload || {}

    if (file) {
      const fd = new FormData()
      fd.append('file', file)
      if (categories) fd.append('categories', JSON.stringify(categories))
      if (language) fd.append('language', language)
      return api
        .post(`${AI_BASE}/classify`, fd, { skipGlobalLoading: true })
        .then((r) => r.data?.data ?? r.data)
    }

    return api
      .post(
        `${AI_BASE}/classify`,
        { documentText, categories, language },
        { skipGlobalLoading: true }
      )
      .then((r) => r.data?.data ?? r.data)
  },

  suggestTemplateFields: (payload) =>
    api
      .post(`${AI_BASE}/suggest-fields`, payload || {}, { skipGlobalLoading: true })
      .then((r) => r.data?.data ?? r.data),

  chat: (payload) =>
    api
      .post(`${AI_BASE}/chat`, payload || {}, { skipGlobalLoading: true })
      .then((r) => r.data?.data ?? r.data),

  searchDocumentsNL: (payload) => {
    if (typeof payload === 'string') {
      return api
        .get(`${AI_BASE}/search-documents?query=${encodeURIComponent(payload)}`, { skipGlobalLoading: true })
        .then((r) => r.data?.data ?? r.data)
    }
    return api
      .post(`${AI_BASE}/search-documents`, payload || {}, { skipGlobalLoading: true })
      .then((r) => r.data?.data ?? r.data)
  },

  rephraseText: (payload) =>
    api
      .post(`${AI_BASE}/rephrase`, payload || {}, { skipGlobalLoading: true })
      .then((r) => r.data?.data ?? r.data),

  suggestWorkflowRoute: (payload) =>
    api
      .post(`${AI_BASE}/workflow/route`, payload || {}, { skipGlobalLoading: true })
      .then((r) => r.data?.data ?? r.data),

  generateReviewerRemarks: (payload) =>
    api
      .post(`${AI_BASE}/review/remarks`, payload || {}, { skipGlobalLoading: true })
      .then((r) => r.data?.data ?? r.data),

  checkGrammarSpelling: (payload) => {
    const { file, text, content, language, documentType, strictness } = payload || {}
    if (file) {
      const fd = new FormData()
      fd.append('file', file)
      if (language) fd.append('language', language)
      if (documentType) fd.append('documentType', documentType)
      if (strictness) fd.append('strictness', strictness)
      return api
        .post(`${AI_BASE}/grammar-check`, fd, { skipGlobalLoading: true })
        .then((r) => r.data?.data ?? r.data)
    }
    return api
      .post(`${AI_BASE}/grammar-check`, { text: text || content, language, documentType, strictness }, { skipGlobalLoading: true })
      .then((r) => r.data?.data ?? r.data)
  },
}

export default aiApi
