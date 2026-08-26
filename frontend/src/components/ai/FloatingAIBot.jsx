import React, { useEffect, useRef, useState } from 'react'
import useAI from '../../hooks/useAI'

const STORAGE_KEY = 'dms_ai_bot_state_v1'
const HISTORY_KEY = 'dms_ai_bot_history_v1'

const QUICK_ACTIONS = [
  {
    label: 'Search Documents (AI)',
    icon: '🔍',
    prompt: '__AI_SEARCH__',
    description: 'Use Natural Language to find files — example: "approved leave letters from April 2025"',
  },
  {
    label: 'Rephrase / Summarize',
    icon: '✍️',
    prompt: '__AI_REPHRASE__',
    description: 'Rewrite text in 7 styles: Formal / Simple / Concise / Expand / Persuasive / Friendly / Grammar-only',
  },
  {
    label: 'Grammar & Spell Check',
    icon: '🧐',
    prompt: '__AI_GRAMMAR__',
    description: 'Check BM/English grammar, highlight errors, give 0-100 score and corrected text suggestion.',
  },
  {
    label: 'Suggest Workflow Routing',
    icon: '🔀',
    prompt: '__AI_WORKFLOW__',
    description: 'Paste document title/description, AI suggests next action: Approve / Review / HR / Finance / Legal / Compliance.',
  },
  {
    label: 'Generate Reviewer Remarks',
    icon: '✅',
    prompt: '__AI_REMARKS__',
    description: 'Generate professional APPROVE / REVISE / REJECT remarks with checklist + follow-up actions.',
  },
  {
    label: 'Ask About DMS',
    icon: '💬',
    prompt: 'What are the key features in this DMS that I can use to manage department documents more efficiently? Answer in 5 concise points.',
  },
]

function renderMarkdownLight(text) {
  if (!text) return ''
  let html = String(text)

  html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-gray-900 mt-3 mb-1.5">$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-sm font-bold text-gray-900 mt-3 mb-1.5">$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-base font-bold text-gray-900 mt-3 mb-1.5">$1</h1>')

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="font-semibold italic text-gray-900">$1</strong>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
  html = html.replace(/(^|\W)\*(?!\s)([^*\n]+)\*(?!\W)/g, '$1<em class="italic text-gray-700">$2</em>')

  html = html.replace(/`([^`\n]+?)`/g, '<code class="px-1 py-0.5 rounded bg-gray-100 border border-gray-200 text-[12px] font-mono text-slate-700">$1</code>')

  html = html.replace(/```([\s\S]*?)```/g, function (_, code) {
    const escaped = code
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre class="my-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-2.5 text-[11.5px] font-mono text-slate-800 leading-relaxed"><code>${escaped}</code></pre>`
  })

  html = html.replace(/^\s*[-*+]\s+(.*$)/gim, function (_, text) {
    return `<li class="ml-4 list-disc marker:text-[#003366] mb-0.5 text-[13px] leading-relaxed">${text}</li>`
  })
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, function (_, n, text) {
    return `<li class="ml-4 list-decimal marker:text-[#003366] mb-0.5 text-[13px] leading-relaxed">${text}</li>`
  })

  html = html.replace(/(<\/li>)\s*<li/g, '$1<li')
  html = html.replace(/(<li[^>]*>.*?<\/li>)/g, function (li) {
    const startsWithNumber = /<li class="ml-4 list-decimal/.test(li)
    const wrap = startsWithNumber ? `<ol class="space-y-0.5 my-2">${li}</ol>` : `<ul class="space-y-0.5 my-2">${li}</ul>`
    return wrap
  })

  html = html.replace(/(<\/(ul|ol)>)\s*<\1[^>]*>/g, function (_, tag) {
    return ''
  })
  html = html.replace(/(<(ul|ol)[^>]*>)\s*(<\1[^>]*>)/g, function (_, tagname, _t2, _t3) { return RegExp.$1 })
  html = html.replace(/\n\s*\n/g, '</p><p class="my-2 text-[13px] leading-relaxed text-gray-700">')
  html = html.replace(/\n/g, '<br/>')

  return `<p class="text-[13px] leading-relaxed text-gray-700">${html}</p>`
}

export default function FloatingAIBot() {
  const ai = useAI()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [welcomeShown, setWelcomeShown] = useState(false)
  const [awaitingSearchQuery, setAwaitingSearchQuery] = useState(false)
  const [lastSearchResult, setLastSearchResult] = useState(null)
  const [openDocId, setOpenDocId] = useState(null)
  const [activeTool, setActiveTool] = useState(null) // 'rephrase' | 'grammar' | 'workflow' | 'remarks' | null
  const [rephraseState, setRephraseState] = useState({ style: 'formal', variants: 2 })

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const forceRefreshAIStatus = async () => {
    const results = await Promise.allSettled([ai.fetchConfig(), ai.checkHealth()])
    const [cfg, h] = results.map((r) => (r.status === 'fulfilled' ? r.value : null))
    return Boolean(cfg?.enabled || h?.status === 'online')
  }

  const extractRateLimitETA = (errMsg) => {
    if (!errMsg) return null
    const s = String(errMsg)
    if (!/429|rate.?limit|quota|retry/i.test(s)) return null
    const m = s.match(/retry\s+in\s+([0-9.]+)\s*s/i)
    if (m) return Math.ceil(Number(m[1]) || 0)
    const m2 = s.match(/retryAfterSec['"]?\s*[:=]\s*(\d+)/i)
    if (m2) return Number(m2[1]) || 0
    return 60
  }
  const rateLimitBanner = (sec) =>
    sec
      ? `\n\n**⏰ Rate Limit Reached (429)**\nGoogle Gemini free tier = **5 requests per minute**.\nNext slot available in ~ **${sec} seconds**.\nTips: Upgrade to pay-as-you-go in AI Studio for 15 RPM min or wait patiently.`
      : '\n\n*If this keeps happening, check backend rate limits or wait 1-2 minutes.*'


  const handleDisabledClick = async () => {
    const { config, health } = await ai.forceRefreshAIStatus({ deep: true })
    const enabled = Boolean(config?.enabled === true || health?.status === 'online')
    if (!enabled) {
      alert(
        'AI Assistant is not activated yet.\n\n' +
        'To activate:\n' +
        '1. Open backend/.env\n' +
        '2. Set AI_ENABLED=true\n' +
        '3. Enter your GEMINI_API_KEY\n' +
        '4. Restart the backend server (most important!)' +
        (health?.status === 'error' ? `\n\nLast health error: ${health.message?.slice?.(0, 140) || ''}` : '')
      )
    }
  }

  useEffect(() => {
    if (!ai.configLoaded) forceRefreshAIStatus()
  }, [ai.configLoaded])

  useEffect(() => {
    try {
      const rawState = localStorage.getItem(STORAGE_KEY)
      if (rawState) {
        const s = JSON.parse(rawState)
        if (typeof s?.isOpen === 'boolean') setIsOpen(s.isOpen)
      }
      const rawHistory = localStorage.getItem(HISTORY_KEY)
      if (rawHistory) {
        const h = JSON.parse(rawHistory)
        if (Array.isArray(h) && h.length > 0) {
          setMessages(h)
          setWelcomeShown(true)
        }
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ isOpen }))
    } catch { /* ignore */ }
  }, [isOpen])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-60)))
    } catch { /* ignore */ }
  }, [messages])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, ai.loading.chat, ai.loading.search, ai.loading.rephrase, ai.loading.grammar, ai.loading.workflow, ai.loading.remarks])

  const ensureWelcome = () => {
    if (welcomeShown && messages.length > 0) return
    setWelcomeShown(true)
    const welcomeMsg = {
      id: 'welcome_' + Date.now(),
      role: 'assistant',
      content:
        `👋 Hi! I'm **DMS Assistant**.\n\n` +
        `I can help you with:\n` +
        `- Answering questions about this DMS\n` +
        `- Summarizing and reviewing documents\n` +
        `- Writing official letters/emails\n` +
        `- Explaining the review/approval workflow\n` +
        `- Suggestions for Smart Form templates\n\n` +
        `Click a shortcut below or just type your question!`,
      timestamp: Date.now(),
    }
    setMessages((prev) => (prev.length === 0 ? [welcomeMsg] : prev))
  }

  const handleOpen = () => {
    ensureWelcome()
    setIsOpen(true)
    setUnreadCount(0)
    setTimeout(() => inputRef.current?.focus(), 200)
  }

  const handleMinimize = (e) => {
    e?.stopPropagation?.()
    setIsOpen(false)
  }

  const handleClearHistory = () => {
    if (!confirm('Clear all chat history with AI bot?')) return
    setMessages([])
    setWelcomeShown(false)
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* ignore */ }
    ensureWelcome()
  }

  const getPageContext = () => {
    try {
      const ctx = {
        pageKey: window.location.pathname,
        pageTitle: document.title,
        href: window.location.href,
      }
      const selectedTitle = document.querySelector('[data-document-title]')?.getAttribute('data-document-title') ||
        document.querySelector('.document-title')?.textContent?.trim()
      if (selectedTitle) ctx.selectedDocumentTitle = selectedTitle.substring(0, 200)

      return ctx
    } catch {
      return { pageKey: window.location.pathname, pageTitle: document.title }
    }
  }

  const pushMessage = (role, content, extras = {}) => {
    setMessages((prev) => [...prev, {
      id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      role,
      content,
      timestamp: Date.now(),
      ...extras,
    }])
  }

  const sendMessage = async (text) => {
    let msgText = (text || input).trim()
    if (!msgText) return

    ensureWelcome()
    setShowQuickActions(false)

    if (awaitingSearchQuery) {
      setAwaitingSearchQuery(false)
      pushMessage('user', '🔎 ' + msgText)
      setInput('')
      await runAISearch(msgText)
      return
    }

    const searchHint = /^(carian|cari|search|find|jumpa)\b[\s:,-]*/i
    if (searchHint.test(msgText)) {
      const q = msgText.replace(searchHint, '').trim()
      if (q.length >= 2) {
        pushMessage('user', '🔎 ' + q)
        setInput('')
        await runAISearch(q)
        return
      }
    }

    if (activeTool) {
      const { commands, cleanText } = parseCommandLines(msgText)
      setInput('')

      if (activeTool === 'rephrase') {
        pushMessage('user', msgText)
        if (!cleanText) {
          pushMessage('assistant',
            '⚠️ **Please paste the text to rephrase.**\n\nExample:\n```\n@style concise @variants 3\nI would like to inform you that our department will be conducting training…\n```'
          )
          return
        }
        const opts = {}
        if (commands.style) opts.style = commands.style
        if (commands.variants) {
          const v = parseInt(commands.variants, 10)
          if (Number.isFinite(v) && v >= 1 && v <= 5) opts.variants = v
        }
        if (commands.keep && commands.keep.length > 0) opts.preserveKeyTerms = commands.keep
        await runRephrase(cleanText, opts)
        return
      }

      if (activeTool === 'grammar') {
        pushMessage('user', msgText)
        if (!cleanText) {
          pushMessage('assistant',
            '⚠️ **Please paste the text to check grammar.**\n\n*(Optional: `@strict strict`, `@docType SOP`, `@lang ms / en`)*'
          )
          return
        }
        const gOpts = {}
        if (commands.strict) gOpts.strictness = commands.strict
        if (commands.doctype) gOpts.documentType = commands.doctype
        if (commands.lang) gOpts.language = commands.lang
        await runGrammarCheck(cleanText, gOpts)
        return
      }

      if (activeTool === 'workflow') {
        pushMessage('user', msgText)
        if (!cleanText && !commands.title && !commands.type) {
          pushMessage('assistant',
            '⚠️ **Please paste the document title/description for routing.\n\n*(Optional: `@amount RM120000`, `@type INVOICE`, `@category Finance`, `@dept HR`)*'
          )
          return
        }
        const ctx = { text: cleanText }
        if (commands.title) ctx.title = commands.title
        if (commands.type) ctx.documentType = commands.type
        if (commands.category) ctx.projectCategory = commands.category
        if (commands.dept) ctx.department = commands.dept
        if (commands.level) ctx.level = commands.level
        if (commands.amount) ctx.amount = commands.amount
        await runWorkflowRoute(ctx)
        return
      }

      if (activeTool === 'remarks') {
        pushMessage('user', msgText)
        const decisionRaw = (commands.decision || '').toUpperCase()
        if (!['APPROVE', 'REVISE', 'REJECT'].includes(decisionRaw)) {
          pushMessage('assistant',
            '❌ **Decision required!** Please add on the first line:\n```\n@decision APPROVE\n```\n\nSupported: `APPROVE` | `REVISE` | `REJECT`'
          )
          return
        }
        const doc = { decision: decisionRaw }
        if (commands.title) doc.title = commands.title
        if (commands.amount) doc.amount = commands.amount
        if (cleanText) doc.customConcerns = cleanText
        await runReviewRemarks(doc)
        return
      }
    }

    pushMessage('user', msgText)
    setInput('')

    try {
      const reply = await ai.chat({
        messages: [...messages, { role: 'user', content: msgText }].map((m) => ({
          role: m.role, content: m.content,
        })),
        pageContext: getPageContext(),
      })
      if (reply?.content) {
        pushMessage('assistant', reply.content, {
          model: reply.model,
          finishReason: reply.finishReason,
        })
        if (!isOpen) setUnreadCount((c) => c + 1)
      } else {
        pushMessage('assistant', 'Sorry, no response from AI. Please try again.')
      }
    } catch (err) {
      const eta = extractRateLimitETA(err?.message)
      pushMessage('assistant', `⚠️ **Error:** ${err.message}\n\nPlease ensure AI is enabled in backend settings (**AI_ENABLED=true** and **GEMINI_API_KEY** provided).${rateLimitBanner(eta)}`)
    }
  }

  const runAISearch = async (query) => {
    const loadingMsgId = 'search_load_' + Date.now()
    pushMessage('assistant', '__LOADING_SEARCH__', {
      id: loadingMsgId,
      searchLoading: true,
      searchQuery: query,
    })

    try {
      const result = await ai.searchDocuments({ query, limit: 15 })
      setMessages((prev) => prev.filter((m) => m.id !== loadingMsgId))
      setLastSearchResult(result)

      const hasResults = Array.isArray(result?.documents) && result.documents.length > 0
      const filters = result?.appliedFilters || {}
      const aiParsed = result?.aiParsed
      const explanation = aiParsed?.explain
      const total = result?.pagination?.total ?? 0

      let headerText = `🔍 **AI Search Results:** ${hasResults ? total : 'No'} document${total === 1 ? '' : 's'} found\n\n`
      if (explanation) headerText += `💡 ${explanation}\n\n`
      if (aiParsed) {
        const chips = []
        if (filters.search) chips.push(`🔎 "${filters.search}"`)
        if (filters.status) chips.push(`📌 Status: ${filters.status}`)
        if (filters.startDate || filters.endDate) chips.push(`📅 ${[filters.startDate, filters.endDate].filter(Boolean).join(' → ')}`)
        if (result?.resolvers?.documentType?.name) chips.push(`📄 Type: ${result.resolvers.documentType.name}`)
        if (result?.resolvers?.owner?.name) chips.push(`👤 Owner: ${result.resolvers.owner.name}`)
        if (result?.resolvers?.createdBy?.name) chips.push(`✍️ By: ${result.resolvers.createdBy.name}`)
        if (chips.length > 0) headerText += `**Applied:** ${chips.join('  •  ')}\n\n`
      }
      if (!hasResults) headerText += `No matches found. Try shortening keywords (e.g., remove adjectives), change status filter, or narrow the date range.`

      pushMessage('assistant', headerText.trim(), {
        kind: 'search-header',
        searchResultId: 'header_' + loadingMsgId,
      })
      if (hasResults) {
        pushMessage('assistant', '__SEARCH_RESULTS__', {
          kind: 'search-results',
          documents: result.documents.slice(0, 15),
          searchResultId: loadingMsgId,
          pagination: result.pagination,
          resolvers: result.resolvers,
          aiParsed,
        })
      }
      if (!isOpen) setUnreadCount((c) => c + 1)
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingMsgId))
      pushMessage('assistant',
        `⚠️ **Search Failed:** ${err.message}\n\n` +
        `How to resolve:\n` +
        `• Make sure backend is restarted after updating AI code\n` +
        `• Check backend console for error logs\n` +
        `• Try without AI: Use the regular search bar in Documents menu`
      )
    }
  }

  const runRephrase = async (text, options = {}) => {
    const loadingId = 'ai_rephrase_' + Math.random().toString(36).slice(2, 10)
    const style = options.style || rephraseState.style || 'formal'
    const variants = options.variants || rephraseState.variants || 2
    pushMessage('assistant', '__LOADING_REPHRASE__', { id: loadingId, kind: 'loading', loadingFor: 'rephrase' })
    try {
      const result = await ai.rephrase({ text, style, variants, preserveKeyTerms: options.preserveKeyTerms })
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      const styleLabels = { formal: 'Formal/Business', simple: 'Simple & Clear', concise: 'Concise', expand: 'Expanded', persuasive: 'Persuasive', friendly: 'Friendly', grammar: 'Grammar Fix Only' }
      let body = `### ✍️ Rephrased — ${styleLabels[style] || style} (${result.variants?.length || 0} variants)\n\n`
      result.variants?.forEach((v, i) => { body += `**${i + 1}.**\n> ${String(v).replace(/\n/g, '\n> ')}\n\n` })
      if (result.summary) body += `**Summary of changes:** ${result.summary}\n\n`
      if (result.wordCountOriginal) body += `*Word count: original ${result.wordCountOriginal} → ${(result.wordCountPerVariant || []).map((n, i) => `v${i + 1}=${n}`).join(', ') || ''}*\n`
      pushMessage('assistant', body.trim(), { kind: 'rephrase-result' })
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      pushMessage('assistant', `⚠️ **Rephrase failed:** ${err.message}\n*Please try again in a moment (free tier rate limit 5 RPM for gemini-3.6-flash).*`)
    }
  }

  const runGrammarCheck = async (text, opts = {}) => {
    const loadingId = 'ai_g_' + Math.random().toString(36).slice(2, 10)
    pushMessage('assistant', '__LOADING_REPHRASE__', { id: loadingId, kind: 'loading', loadingFor: 'grammar' })
    try {
      const result = await ai.checkGrammar({ text, documentType: opts.documentType || 'general', strictness: opts.strictness || 'normal', language: opts.language || 'auto' })
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      const score = Number(result.overallScore) || 0
      const scoreColor = score >= 85 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-red-700'
      const sevColor = { critical: 'bg-red-100 text-red-700 border-red-200', major: 'bg-amber-100 text-amber-700 border-amber-200', minor: 'bg-sky-100 text-sky-700 border-sky-200', info: 'bg-slate-100 text-slate-700 border-slate-200' }
      let body = `### 🧐 Grammar Check Result — Score **[${score}/100](color:${scoreColor})** (${result.languageDetected?.toUpperCase() || 'LANG'})\n\n`
      body += `**Language detected:** ${result.languageDetected || '—'}  |  **Errors:** ${result.errorsTotal ?? result.changes?.length ?? 0}${result.stats?.criticalErrors ? ` (${result.stats.criticalErrors} critical)` : ''}\n\n`
      if (result.readabilityGrade) body += `**Readability:** ${result.readabilityGrade}  `
      if (result.toneNotes) body += `  • **Tone notes:** ${result.toneNotes}\n\n`
      if ((result.changes || []).length === 0) {
        body += '✅ *No errors detected! Your text is already clean.*\n\n'
      } else {
        body += '#### Change details:\n'
        ;(result.changes || []).slice(0, 20).forEach((c, i) => {
          body += `**${i + 1}.** [${String(c.category).toUpperCase()}] `
          const clr = sevColor[c.severity] || sevColor.minor
          body += `<span style="display:inline-block;padding:1px 6px;border-radius:999px;font-size:10px;border:1px solid" class="${clr}">${String(c.severity || 'minor').toUpperCase()}</span>\n`
          body += `- ~~${String(c.original || '').replace(/[|#]/g, ' ')}~~ → **${String(c.suggested || '').replace(/[|#]/g, ' ')}**\n`
          if (c.reason) body += `- *${String(c.reason)}*\n`
          body += '\n'
        })
        if ((result.changes || []).length > 20) body += `*… and ${(result.changes || []).length - 20} more changes*\n\n`
      }
      if (result.correctedText && result.correctedText !== text) {
        body += '#### 🟢 Corrected Text (copy paste ready):\n'
        body += '```\n' + String(result.correctedText) + '\n```\n'
      }
      pushMessage('assistant', body.trim(), { kind: 'grammar-result' })
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      pushMessage('assistant', `⚠️ **Grammar check failed:** ${err.message}`)
    }
  }

  const runWorkflowRoute = async (docContext = {}) => {
    const loadingId = 'ai_wf_' + Math.random().toString(36).slice(2, 10)
    pushMessage('assistant', '__LOADING_REPHRASE__', { id: loadingId, kind: 'loading', loadingFor: 'workflow' })
    try {
      const result = await ai.suggestWorkflow(docContext)
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      const confPct = Math.round((Number(result.confidence) || 0) * 100)
      const actionColors = { APPROVE: 'bg-emerald-100 text-emerald-700 border-emerald-200', REVIEW: 'bg-amber-100 text-amber-700 border-amber-200', REVISE: 'bg-yellow-100 text-yellow-700 border-yellow-200', REJECT: 'bg-red-100 text-red-700 border-red-200', PUBLISH: 'bg-green-100 text-green-700 border-green-200', ESCLATE: 'bg-purple-100 text-purple-700 border-purple-200', ROUTE_TO_HR: 'bg-pink-100 text-pink-700 border-pink-200', ROUTE_TO_FINANCE: 'bg-sky-100 text-sky-700 border-sky-200', ROUTE_TO_LEGAL: 'bg-[#EBF4FF] text-[#002244] border-[#C9DCF7]', ROUTE_TO_COMPLIANCE: 'bg-teal-100 text-teal-700 border-teal-200', NO_ACTION: 'bg-gray-100 text-gray-700 border-gray-200' }
      const badge = `<span style="padding:2px 8px;border-radius:999px;border:1px solid;font-weight:700;font-size:10.5px" class="${actionColors[result.recommendedAction] || actionColors.REVIEW}">${result.recommendedAction}</span>`
      let body = `### 🔀 Workflow Routing Suggestion\n\n**Action:** ${badge}  |  **Confidence:** ${confPct}%  |  **Next Stage:** ${result.recommendedStage || '—'}\n\n`
      body += `- **Approval level needed:** **${result.requiredApprovalLevel || '—'}**\n`
      body += `- **Recommended role:** ${result.recommendedApproverRole || '—'}  |  **Reviewer name:** ${result.recommendedReviewerName || '—'}\n`
      if (result.estimatedSlaHours) body += `- **Estimated SLA:** ${result.estimatedSlaHours} hours\n`
      body += '\n**Reasoning:**\n'
      ;(result.reasoning || []).forEach((r, i) => { body += ` ${i + 1}. ${String(r)}\n` })
      if ((result.warningFlags || []).length > 0) {
        body += '\n**⚠️ Warning flags:**\n'
        result.warningFlags.forEach((w) => { body += ` • ${String(w)}\n` })
      }
      pushMessage('assistant', body.trim(), { kind: 'workflow-result' })
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      pushMessage('assistant', `⚠️ **Workflow routing failed:** ${err.message}`)
    }
  }

  const runReviewRemarks = async (doc = {}) => {
    const loadingId = 'ai_rm_' + Math.random().toString(36).slice(2, 10)
    pushMessage('assistant', '__LOADING_REPHRASE__', { id: loadingId, kind: 'loading', loadingFor: 'remarks' })
    try {
      const result = await ai.generateRemarks(doc)
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      let body = `### ✅ Review Remarks Generated — **${doc.decision || 'APPROVE'}**\n\n`
      ;(result.remarks || []).forEach((r, i) => {
        body += `**Variant ${i + 1}** — *${r.label || ''}*\n`
        body += '```\n' + String(r.text || '') + '\n```\n\n'
      })
      if ((result.checklistVerified || []).length > 0) {
        body += '**Checklist verified:**\n'
        result.checklistVerified.forEach((x) => { body += `  ☑️ ${String(x)}\n` })
        body += '\n'
      }
      if ((result.followUpActions || []).length > 0) {
        body += '**Follow-up actions:**\n'
        result.followUpActions.forEach((x, i) => { body += `  ${i + 1}. ➡️ ${String(x)}\n` })
        body += '\n'
      }
      if (result.summaryShort) body += `**Activity feed summary:** *${result.summaryShort}*\n`
      pushMessage('assistant', body.trim(), { kind: 'remarks-result' })
    } catch (err) {
      const eta = extractRateLimitETA(err?.message)
      setMessages((prev) => prev.filter((m) => m.id !== loadingId))
      pushMessage('assistant', `⚠️ **Remarks generator failed:** ${err.message}${rateLimitBanner(eta)}`)
    }
  }

  const parseCommandLines = (rawText) => {
    const lines = String(rawText || '').split(/\r?\n/)
    const commands = {}
    const keptLines = []
    const cmdRegex = /^@(\w+)(?:\s+(.*))?$/

    for (const line of lines) {
      const m = line.trim().match(cmdRegex)
      if (m) {
        const key = String(m[1] || '').toLowerCase()
        const val = (m[2] || '').trim()
        if (key === 'keep') {
          if (!Array.isArray(commands.keep)) commands.keep = []
          val.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => commands.keep.push(s))
        } else {
          commands[key] = val
        }
      } else {
        keptLines.push(line)
      }
    }

    return { commands, cleanText: keptLines.join('\n').trim() }
  }

  const runQuickAction = (action) => {
    setShowQuickActions(false)
    if (action.prompt === '__AI_SEARCH__') {
      ensureWelcome()
      setAwaitingSearchQuery(true)
      setActiveTool(null)
      pushMessage('assistant',
        '🔍 **AI Document Search (Natural Language)**\n\n' +
        'Type what you want to search for in Malay or English.\n\n' +
        '**Search examples:**\n' +
        '• *approved leave letters from April 2025*\n' +
        '• *SOP drafts I created last week*\n' +
        '• *published INVOICE, this year, from Finance category*\n' +
        '• *documents about salary increment by Mr Ahmad*\n' +
        '• *all internal memos Q1 2026*\n\n' +
        'I will extract keywords, status, dates, type, owner, run the search, and show the results!',
        { system: true }
      )
      setTimeout(() => inputRef.current?.focus(), 80)
      return
    }
    if (action.prompt === '__AI_REPHRASE__') {
      ensureWelcome()
      setActiveTool('rephrase')
      setAwaitingSearchQuery(false)
      pushMessage('assistant',
        '### ✍️ AI Rephrase Mode — Active\n\n' +
        'Paste or type any text below and I will rewrite it.\n\n' +
        '**Default style:** `' + (rephraseState.style || 'formal') + '`, 2 variants.\n\n' +
        '*To change style, type commands on the first line before your text:*\n' +
        '- `@style formal` / `simple` / `concise` / `expand` / `persuasive` / `friendly` / `grammar`\n' +
        '- `@variants 3` (1–5)\n' +
        '- `@keep SOP`, `@keep HR` (terms that MUST NOT be changed)\n\n' +
        'Example:\n' +
        '```\n@style concise @variants 3\nI would like to inform you that our department will be conducting training…\n```'
      )
      setTimeout(() => inputRef.current?.focus(), 80)
      return
    }
    if (action.prompt === '__AI_GRAMMAR__') {
      ensureWelcome()
      setActiveTool('grammar')
      setAwaitingSearchQuery(false)
      pushMessage('assistant',
        '### 🧐 Grammar & Spelling Checker — Active\n\n' +
        'Paste any text (BM / English) below.\n\n' +
        'I will return:\n' +
        ' • Score **0–100** (overall quality)\n' +
        ' • Each change: category + severity + reason\n' +
        ' • **Corrected text** version ready to copy paste\n\n' +
        '*(Optional: before the text, write `@strict strict` / `@docType SOP` / `@lang ms`)*'
      )
      setTimeout(() => inputRef.current?.focus(), 80)
      return
    }
    if (action.prompt === '__AI_WORKFLOW__') {
      ensureWelcome()
      setActiveTool('workflow')
      setAwaitingSearchQuery(false)
      pushMessage('assistant',
        '### 🔀 Workflow Routing — Active\n\n' +
        'Paste a title / description / any document snippet.\n\n' +
        'I will suggest a routing action (REVIEW / APPROVE / HR / FINANCE / LEGAL / COMPLIANCE), approval level, reviewer name, plus reasoning + warning flags.\n\n' +
        '*(Optional: add metadata on the first line such as `@amount RM120000`, `@type INVOICE`, `@category Finance`, `@dept HR`)*'
      )
      setTimeout(() => inputRef.current?.focus(), 80)
      return
    }
    if (action.prompt === '__AI_REMARKS__') {
      ensureWelcome()
      setActiveTool('remarks')
      setAwaitingSearchQuery(false)
      pushMessage('assistant',
        '### ✅ Review Remarks Generator — Active\n\n' +
        'Input format — the first line must contain a decision:\n' +
        '```\n@decision APPROVE\n@title Annual Leave Letter Ahmad Zainuddin\n@amount RM5000\n(any notes / concerns you have, optional)\n```\n\n' +
        'Supported decisions: `APPROVE` | `REVISE` | `REJECT`\n\n' +
        'I will generate 2 remark variants, verified checklist, follow-up actions, and an activity-feed summary!'
      )
      setTimeout(() => inputRef.current?.focus(), 80)
      return
    }
    sendMessage(action.prompt)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const checkingAI = ai.aiEnabled === null || ai.loading.config || ai.loading.health
  const disabledAI = ai.aiEnabled === false

  if (!ai.aiEnabled || checkingAI) {
    const spinner = checkingAI
    const gradient = checkingAI
      ? 'from-amber-400 via-orange-400 to-amber-500'
      : 'from-slate-400 to-slate-500'
    const title = checkingAI
      ? 'AI status is being checked… (click to retry check)'
      : 'AI Assistant - disabled (click to retry config)'
    return (
      <div className="fixed bottom-5 right-5 z-[70]">
        <button
          type="button"
          onClick={handleDisabledClick}
          className={`relative w-12 h-12 rounded-full shadow-lg bg-gradient-to-br ${gradient} text-white hover:scale-105 active:scale-95 transition-transform flex items-center justify-center group ${checkingAI ? 'animate-pulse' : ''}`}
          title={title}
        >
          {spinner ? (
            <svg className="w-5 h-5 animate-spin opacity-90" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-6 h-6 opacity-80 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.88 9.88a3 3 0 104.24 4.24M9.88 9.88L5.2 5.2M9.88 9.88l4.24 4.24M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {checkingAI && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-white border-2 border-amber-400 shadow animate-ping" />
          )}
          {disabledAI && !checkingAI && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow" />
          )}
        </button>
      </div>
    )
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-5 right-5 z-[70]">
        <button
          type="button"
          onClick={handleOpen}
          className="relative w-14 h-14 rounded-full shadow-xl bg-gradient-to-br from-[#003366] via-[#004080] to-[#0055aa] text-white hover:scale-105 active:scale-95 transition-all flex items-center justify-center group"
          title="Open DMS Assistant"
        >
          <span className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white shadow-sm animate-pulse" />
          <svg className="w-7 h-7 drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold border-2 border-white flex items-center justify-center shadow">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-2">
      <div className="w-[380px] max-w-[calc(100vw-2.5rem)] h-[580px] max-h-[calc(100vh-120px)] rounded-2xl shadow-2xl bg-white border border-gray-200 overflow-hidden flex flex-col animate-[fadeInUp_.18s_ease-out]">
        <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

        {/* Header */}
        <div className="relative px-4 py-3 bg-gradient-to-r from-[#003366] via-[#004080] to-[#0055aa] text-white flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center shrink-0">
            <span className="text-xl">🤖</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm leading-tight">DMS Assistant</div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/85">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <span>Online · {ai.config?.model || 'gemini-3.6-flash'}</span>
            </div>
            {activeTool && (
              <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-white/20 border border-white/30 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {activeTool === 'rephrase' && '✍️ AI Rephrase Mode'}
                  {activeTool === 'grammar' && '🧐 Grammar Check Mode'}
                  {activeTool === 'workflow' && '🔀 Workflow Routing Mode'}
                  {activeTool === 'remarks' && '✅ Review Remarks Mode'}
                  <button
                    type="button"
                    onClick={() => setActiveTool(null)}
                    className="ml-1 opacity-80 hover:opacity-100"
                    title="Exit tool mode"
                  >
                    ✕
                  </button>
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title="Clear chat history"
              onClick={handleClearHistory}
              className="w-8 h-8 rounded-lg hover:bg-white/15 active:bg-white/25 transition-colors flex items-center justify-center text-white/90"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3" />
              </svg>
            </button>
            <button
              type="button"
              title="Minimize"
              onClick={handleMinimize}
              className="w-8 h-8 rounded-lg hover:bg-white/15 active:bg-white/25 transition-colors flex items-center justify-center text-white/90"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        {showQuickActions && messages.length <= 1 && (
          <div className="px-3 pt-2.5 pb-1 bg-white border-b border-gray-100 shrink-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 px-0.5">Shortcuts</div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.slice(0, 6).map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  onClick={() => runQuickAction(qa)}
                  className="text-left rounded-lg px-2.5 py-2 bg-gradient-to-br from-[#F5F9FF] to-[#EBF4FF] hover:from-[#EBF4FF] hover:to-[#E0ECFD] border border-[#E6EFFC] active:scale-[.98] transition-all group"
                >
                  <div className="text-[15px] leading-none mb-0.5">{qa.icon}</div>
                  <div className="text-[11.5px] font-medium text-gray-700 group-hover:text-[#002244] leading-tight">
                    {qa.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5 bg-gradient-to-b from-gray-50 to-white">
          {messages.map((m) => {
            if (m.kind === 'loading' || m.content === '__LOADING_REPHRASE__') {
              const toolLabels = { rephrase: 'Rephrasing text', grammar: 'Checking grammar & spelling', workflow: 'Analysing workflow route', remarks: 'Generating reviewer remarks' }
              const label = toolLabels[m.loadingFor] || 'Running AI tool'
              const icons = { rephrase: '✍️', grammar: '🧐', workflow: '🔀', remarks: '✅' }
              return (
                <div key={m.id} className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-50 to-[#EBF4FF] border border-[#C9DCF7] flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-white border border-[#E6EFFC] px-3.5 py-3 shadow-sm max-w-[83%]">
                    <div className="flex items-center gap-2.5">
                      <svg className="animate-spin h-4 w-4 text-[#003366]" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[#001a33]">
                          {icons[m.loadingFor] || '⚙️'} {label}…
                        </div>
                        <div className="text-[10.5px] text-gray-400 mt-0.5">
                          Calling AI {ai.config?.model || 'gemini-3.6-flash'}…
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }
            if (m.content === '__LOADING_SEARCH__' || m.searchLoading) {
              return (
                <div key={m.id} className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-50 to-[#EBF4FF] border border-[#C9DCF7] flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="rounded-2xl rounded-bl-md bg-white border border-[#E6EFFC] px-3.5 py-3 shadow-sm max-w-[83%]">
                    <div className="flex items-center gap-2.5">
                      <svg className="animate-spin h-4 w-4 text-[#003366]" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[#001a33]">Running AI search…</div>
                        <div className="text-[11px] text-gray-500 truncate max-w-[230px]">
                          "{m.searchQuery?.substring(0, 80)}{(m.searchQuery?.length || 0) > 80 ? '…' : ''}"
                        </div>
                        <div className="text-[10.5px] text-gray-400 mt-0.5">
                          Converting NL → filters → resolve names → search DB…
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }
            if (m.content === '__SEARCH_RESULTS__' && m.kind === 'search-results') {
              const docs = Array.isArray(m.documents) ? m.documents : []
              return (
                <div key={m.id} className="flex justify-start w-full">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-50 to-[#EBF4FF] border border-[#C9DCF7] flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="max-w-[83%] w-full space-y-2">
                    <div className="rounded-xl border border-[#E6EFFC] bg-white overflow-hidden shadow-sm">
                      <div className="px-2.5 py-1.5 bg-gradient-to-r from-[#F5F9FF] to-[#F0F8FF] border-b border-[#E6EFFC] flex items-center justify-between">
                        <div className="text-[11px] font-semibold text-[#001a33]">
                          {docs.length} Result{docs.length === 1 ? '' : 's'}
                          {m.pagination?.total && m.pagination.total > docs.length
                            ? ` of ${m.pagination.total}`
                            : ''}
                        </div>
                        <button
                          type="button"
                          className="text-[10.5px] font-medium text-[#003366] hover:text-[#002244]"
                          onClick={() => window.location.assign('/documents/my-documents')}
                        >
                          Open Documents →
                        </button>
                      </div>
                      <div className="divide-y divide-[#E6EFFC] max-h-[320px] overflow-y-auto">
                        {docs.map((d) => {
                          const dmy = (s) => {
                            try { return s ? new Date(s).toLocaleDateString() : '' } catch { return '' }
                          }
                          const statusColor = (() => {
                            const s = String(d.status || '').toUpperCase()
                            if (s.includes('PUBLISH')) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            if (s.includes('APPROV')) return 'bg-green-50 text-green-700 border-green-200'
                            if (s.includes('REVIEW')) return 'bg-amber-50 text-amber-700 border-amber-200'
                            if (s.includes('DRAF')) return 'bg-slate-50 text-slate-700 border-slate-200'
                            if (s.includes('REJECT') || s.includes('OBSOLETE') || s.includes('SUPERSE')) return 'bg-red-50 text-red-700 border-red-200'
                            return 'bg-gray-50 text-gray-700 border-gray-200'
                          })()
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => window.location.assign(`/documents/${d.id}`)}
                              className={`w-full text-left px-3 py-2.5 hover:bg-[#F5F9FF]/60 active:bg-[#EBF4FF]/60 transition-colors ${openDocId === d.id ? 'bg-[#F5F9FF]' : ''}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                  <span className="text-[13px]">
                                    {d.isSmartDocument ? '🧠' : d.documentType?.toUpperCase().includes('MEMO') ? '📝' : d.documentType?.toUpperCase().includes('INVOIC') || d.documentType?.toUpperCase().includes('PO') ? '🧾' : '📄'}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[12.5px] font-semibold text-gray-900 truncate max-w-[180px]">
                                      {d.title || '(Untitled)'}
                                    </span>
                                    <span className={`text-[9.5px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${statusColor}`}>
                                      {d.status || 'DRAFT'}
                                    </span>
                                    {d.isConfidential && <span className="text-[9.5px] bg-red-100 text-red-700 border border-red-200 rounded px-1 font-bold">CONF</span>}
                                  </div>
                                  <div className="text-[10.5px] text-gray-500 mt-0.5 truncate">
                                    {[d.fileCode, d.documentType, d.projectCategory, d.folder].filter(Boolean).join(' • ') || '-'}
                                  </div>
                                  <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                    {d.createdAt && <span>📅 {dmy(d.createdAt)}</span>}
                                    {d.createdBy?.name && <span>✍️ {d.createdBy.name}</span>}
                                    {d.owner?.name && d.owner?.name !== d.createdBy?.name && <span>👤 {d.owner.name}</span>}
                                  </div>
                                </div>
                                <svg className="w-3.5 h-3.5 text-[#3d7cc9] shrink-0 mt-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-0.5">
                      <button
                        type="button"
                        onClick={() => setAwaitingSearchQuery(true)}
                        className="text-[10.5px] font-medium text-[#003366] hover:text-[#002244]"
                      >
                        🔎 Search again
                      </button>
                      <div className="text-[10px] text-gray-400">
                        Click result to open document
                      </div>
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role !== 'user' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-50 to-[#EBF4FF] border border-[#C9DCF7] flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <span className="text-sm">🤖</span>
                  </div>
                )}
                <div className={`max-w-[83%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-[#003366] to-[#004d99] text-white rounded-br-md'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                }`}>
                  <div
                    className={m.role === 'user' ? 'prose prose-sm text-[13px] leading-relaxed whitespace-pre-wrap break-words' : 'prose prose-sm max-w-none break-words'}
                    style={m.role !== 'user' ? {} : undefined}
                    dangerouslySetInnerHTML={m.role !== 'user' ? { __html: renderMarkdownLight(m.content) } : undefined}
                  >
                    {m.role === 'user' ? undefined : null}
                  </div>
                  {m.role === 'user' && <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</div>}
                </div>
              </div>
            )
          })}

          {ai.loading.chat && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-50 to-[#EBF4FF] border border-[#C9DCF7] flex items-center justify-center shrink-0 mr-2 mt-0.5">
                <span className="text-sm">🤖</span>
              </div>
              <div className="rounded-2xl rounded-bl-md bg-white border border-gray-200 px-3.5 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#3d7cc9] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#3d7cc9] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-[#3d7cc9] animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="ml-2 text-[11px] text-gray-500 italic">DMS Assistant is typing...</span>
                </div>
              </div>
            </div>
          )}

          {ai.errors?.chat && messages.length > 0 && (
            <div className="text-[11.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
              ⚠️ {ai.errors.chat}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white px-3 py-2.5 shrink-0">
          <div className="relative rounded-xl border border-gray-300 bg-gray-50 focus-within:border-[#3d7cc9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#EBF4FF] transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={awaitingSearchQuery
                ? '🔎 Enter your natural language search… (e.g. approved leave letters from April 2025)'
                : activeTool === 'rephrase'
                  ? '✍️ Paste text @style formal / concise / expand… (e.g. first line: @style concise @variants 3)'
                  : activeTool === 'grammar'
                    ? '🧐 Paste text to check grammar… (@strict strict / @docType SOP / @lang en)'
                    : activeTool === 'workflow'
                      ? '🔀 Paste title/description… (@amount RM120k / @type INVOICE / @category Finance)'
                      : activeTool === 'remarks'
                        ? '✅ Line 1: @decision APPROVE | REVISE | REJECT, then @title / @amount…'
                        : 'Ask anything / 🔍 type "search …" for AI document search…'}
              className="w-full resize-none bg-transparent outline-none px-3 py-2.5 pr-11 text-[13px] leading-relaxed max-h-28 placeholder:text-gray-400"
              style={{ minHeight: '40px' }}
              disabled={ai.loading.chat || ai.loading.search || ai.loading.rephrase || ai.loading.grammar || ai.loading.workflow || ai.loading.remarks}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!input.trim() || ai.loading.chat || ai.loading.search || ai.loading.rephrase || ai.loading.grammar || ai.loading.workflow || ai.loading.remarks}
              className="absolute right-1.5 bottom-1.5 w-8 h-8 rounded-lg bg-gradient-to-br from-[#003366] to-[#004d99] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all flex items-center justify-center shadow-sm"
              title="Send"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14-7-7 14-2.5-6.5L5 12z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <div className="text-[10px] text-gray-400">
              AI can make mistakes. Verify important information before use.
            </div>
            <button
              type="button"
              onClick={() => setShowQuickActions((v) => !v)}
              className="text-[10.5px] font-medium text-[#003366] hover:text-[#002244]"
            >
              {showQuickActions ? 'Hide shortcuts' : 'Show shortcuts'}
            </button>
          </div>
        </div>
      </div>

      {/* Drag handle hint + Mini FAB for minimize re-entry */}
      <button
        type="button"
        onClick={handleMinimize}
        className="w-11 h-11 rounded-full shadow-lg bg-white border border-gray-200 text-[#003366] hover:bg-[#F5F9FF] active:scale-95 transition-all flex items-center justify-center shrink-0"
        title="Minimize chat"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </button>
    </div>
  )
}
