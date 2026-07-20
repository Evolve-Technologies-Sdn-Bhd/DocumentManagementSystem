const http = require('http')
const fs = require('fs')
const path = require('path')

const session = 'master-record-preview-link'
const host = '127.0.0.1'
const basePort = 7777
const maxPort = 7787
const idleMs = 1200 * 1000
const outdir = path.resolve(process.cwd(), '.dbg')
const logFile = path.join(outdir, `trae-debug-log-${session}.ndjson`)
const envFile = path.join(outdir, `${session}.env`)

fs.mkdirSync(outdir, { recursive: true })
fs.writeFileSync(logFile, '')

let lastSeenAt = Date.now()
let port = basePort

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const writeEnv = (actualPort) => {
  fs.writeFileSync(
    envFile,
    `DEBUG_SERVER_URL=http://${host}:${actualPort}/event\nDEBUG_SESSION_ID=${session}\n`
  )
}

const makeServer = () => http.createServer((req, res) => {
  cors(res)
  lastSeenAt = Date.now()

  if (req.method === 'OPTIONS' && req.url === '/event') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    let logCount = 0
    try {
      logCount = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).length
    } catch {}
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'ok', sessionId: session, port, logCount }))
    return
  }

  if (req.method === 'GET' && req.url.startsWith('/logs')) {
    let events = []
    try {
      events = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    } catch {}
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(events))
    return
  }

  if (req.method === 'DELETE' && req.url === '/logs') {
    fs.writeFileSync(logFile, '')
    res.end('ok')
    return
  }

  if (req.method === 'POST' && req.url === '/event') {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try {
        const event = JSON.parse(raw || '{}')
        if (!event.ts) event.ts = Date.now()
        fs.appendFileSync(logFile, `${JSON.stringify(event)}\n`)
        res.end('ok')
      } catch {
        res.statusCode = 400
        res.end('bad json')
      }
    })
    return
  }

  res.statusCode = 404
  res.end('not found')
})

const start = () => {
  const server = makeServer()
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < maxPort) {
      port += 1
      start()
      return
    }
    console.error(err)
    process.exit(1)
  })

  server.listen(port, host, () => {
    writeEnv(port)
    console.log('@@DEBUG_SERVER_INFO')
    console.log(JSON.stringify({
      api_url: `http://${host}:${port}/event`,
      session_id: session,
      log_dir: outdir,
      log_file: logFile,
      env_file: envFile
    }, null, 2))
    console.log('@@END_DEBUG_SERVER_INFO')

    setInterval(() => {
      if (Date.now() - lastSeenAt > idleMs) {
        server.close(() => process.exit(0))
      }
    }, 5000)
  })
}

start()
