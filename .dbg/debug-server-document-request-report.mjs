import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'

const sessionId = 'document-request-report'
const outdir = path.resolve('.dbg')
const port = 7777
const host = '127.0.0.1'
const logPath = path.join(outdir, `trae-debug-log-${sessionId}.ndjson`)
const envPath = path.join(outdir, `${sessionId}.env`)

fs.mkdirSync(outdir, { recursive: true })
fs.writeFileSync(logPath, '')
fs.writeFileSync(envPath, `DEBUG_SERVER_URL=http://${host}:${port}/event\nDEBUG_SESSION_ID=${sessionId}\n`)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { ...corsHeaders, 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS' && req.url === '/event') {
    res.writeHead(204, corsHeaders)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/event') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        const event = JSON.parse(body || '{}')
        if (!event.ts) event.ts = Date.now()
        fs.appendFileSync(logPath, `${JSON.stringify(event)}\n`)
        sendJson(res, 200, { ok: true })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message })
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/logs') {
    const content = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : ''
    sendJson(res, 200, { ok: true, logPath, lines: content.split('\n').filter(Boolean).map((line) => JSON.parse(line)) })
    return
  }

  if (req.method === 'DELETE' && req.url === '/logs') {
    fs.writeFileSync(logPath, '')
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, sessionId, port, logPath })
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not Found' })
})

server.listen(port, host, () => {
  process.stdout.write(`Debug server listening on http://${host}:${port}\n`)
})
