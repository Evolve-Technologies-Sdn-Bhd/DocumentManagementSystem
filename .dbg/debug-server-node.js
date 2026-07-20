const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')

const readArgValue = (name) => {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return null
  const next = process.argv[idx + 1]
  return next && !next.startsWith('--') ? next : ''
}

const hasFlag = (name) => process.argv.includes(name)

const sessionId = readArgValue('--session')
if (!sessionId) {
  process.stderr.write('Missing --session\n')
  process.exit(1)
}

const outdirRaw = readArgValue('--outdir') || '.dbg'
const startPortRaw = readArgValue('--port')
const idleSecondsRaw = readArgValue('--idle')
const shouldClean = hasFlag('--clean')

const outdir = path.resolve(process.cwd(), outdirRaw)
fs.mkdirSync(outdir, { recursive: true })

const logFile = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`)
if (shouldClean) {
  try {
    fs.writeFileSync(logFile, '')
  } catch {}
}

const idleSeconds = idleSecondsRaw ? Number(idleSecondsRaw) : 0
const startPort = startPortRaw ? Number(startPortRaw) : 7777

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type'
}

let lastActivity = Date.now()

const safeJson = (value) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const writeEnvFile = (apiUrl) => {
  const envPath = path.join(outdir, `${sessionId}.env`)
  const body = `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`
  fs.writeFileSync(envPath, body, 'utf8')
  return envPath
}

const getLocalApiHost = () => {
  const candidates = Object.values(os.networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address)
  return candidates[0] || '127.0.0.1'
}

const appendLog = (event) => {
  const line = `${JSON.stringify(event)}\n`
  fs.appendFileSync(logFile, line, 'utf8')
}

const respond = (res, statusCode, payload, headers = {}) => {
  res.writeHead(statusCode, { ...corsHeaders, ...headers })
  if (payload === undefined || payload === null) {
    res.end()
    return
  }
  if (typeof payload === 'string') {
    res.end(payload)
    return
  }
  res.end(JSON.stringify(payload))
}

const createServer = () =>
  http.createServer((req, res) => {
    lastActivity = Date.now()
    if (req.method === 'OPTIONS' && req.url === '/event') {
      respond(res, 204)
      return
    }

    if (req.method === 'POST' && req.url === '/event') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 2_000_000) {
          respond(res, 413, { ok: false, error: 'payload too large' })
          req.destroy()
        }
      })
      req.on('end', () => {
        const parsed = safeJson(body)
        if (!parsed) {
          respond(res, 400, { ok: false, error: 'invalid json' })
          return
        }
        const ts = Number.isFinite(parsed.ts) ? parsed.ts : Date.now()
        const normalized = { ...parsed, sessionId: parsed.sessionId || sessionId, ts }
        try {
          appendLog(normalized)
        } catch (e) {
          respond(res, 500, { ok: false, error: 'failed to write log' })
          return
        }
        respond(res, 200, { ok: true })
      })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/health')) {
      let count = 0
      try {
        const content = fs.readFileSync(logFile, 'utf8')
        count = content.trim() ? content.trim().split('\n').length : 0
      } catch {}
      respond(res, 200, { ok: true, sessionId, uptimeMs: Date.now() - startedAt, logCount: count })
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/logs')) {
      let content = ''
      try {
        content = fs.readFileSync(logFile, 'utf8')
      } catch {
        content = ''
      }
      respond(res, 200, { ok: true, logs: content })
      return
    }

    if (req.method === 'DELETE' && req.url?.startsWith('/logs')) {
      try {
        fs.writeFileSync(logFile, '')
      } catch {}
      respond(res, 200, { ok: true })
      return
    }

    respond(res, 404, { ok: false, error: 'not found' })
  })

const startedAt = Date.now()

const listenWithProbe = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = startPort + attempt
    const server = createServer()
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => resolve())
      })

      const apiUrl = `http://127.0.0.1:${port}/event`
      const envPath = writeEnvFile(apiUrl)

      process.stdout.write('@@DEBUG_SERVER_INFO\n')
      process.stdout.write(
        `${JSON.stringify({
          api_url: apiUrl,
          session_id: sessionId,
          log_dir: outdir,
          log_file: logFile,
          env_file: envPath
        }, null, 2)}\n`
      )
      process.stdout.write('@@END_DEBUG_SERVER_INFO\n')

      if (idleSeconds > 0) {
        setInterval(() => {
          const idleFor = Date.now() - lastActivity
          if (idleFor > idleSeconds * 1000) {
            server.close(() => process.exit(0))
          }
        }, 1000).unref()
      }

      return
    } catch (error) {
      try {
        server.close()
      } catch {}
    }
  }

  process.stderr.write('Unable to bind to any port\n')
  process.exit(1)
}

listenWithProbe()
