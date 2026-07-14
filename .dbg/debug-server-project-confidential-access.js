const http = require('http')
const fs = require('fs')
const path = require('path')

const sessionId = 'project-confidential-access'
const outDir = path.resolve(process.cwd(), '.dbg')
const host = '127.0.0.1'
const basePort = 7777
const maxPorts = 10

fs.mkdirSync(outDir, { recursive: true })

const logFile = path.join(outDir, `trae-debug-log-${sessionId}.ndjson`)
const envFile = path.join(outDir, `${sessionId}.env`)
fs.writeFileSync(logFile, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const writeEnvFile = (port) => {
  const apiUrl = `http://${host}:${port}/event`
  fs.writeFileSync(envFile, `DEBUG_SERVER_URL=${apiUrl}\nDEBUG_SESSION_ID=${sessionId}\n`)
  return apiUrl
}

const startServer = (port, retries = 0) => {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      const body = JSON.stringify({ ok: true, sessionId, logFile })
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
      res.end(body)
      return
    }

    if (req.method === 'GET' && req.url.startsWith('/logs')) {
      const body = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/x-ndjson' })
      res.end(body)
      return
    }

    if (req.method === 'DELETE' && req.url === '/logs') {
      fs.writeFileSync(logFile, '')
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }

    if (req.method === 'POST' && req.url === '/event') {
      let raw = ''
      req.on('data', (chunk) => { raw += chunk })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(raw || '{}')
          if (!parsed.ts) parsed.ts = Date.now()
          fs.appendFileSync(logFile, `${JSON.stringify(parsed)}\n`)
          res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (error) {
          res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: error.message }))
        }
      })
      return
    }

    res.writeHead(404, corsHeaders)
    res.end()
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && retries < maxPorts - 1) {
      startServer(port + 1, retries + 1)
      return
    }
    throw error
  })

  server.listen(port, host, () => {
    const apiUrl = writeEnvFile(port)
    console.log('@@DEBUG_SERVER_INFO')
    console.log(JSON.stringify({
      api_url: apiUrl,
      session_id: sessionId,
      log_dir: outDir,
      log_file: logFile,
      env_file: envFile
    }, null, 2))
    console.log('@@END_DEBUG_SERVER_INFO')
  })
}

startServer(basePort)
