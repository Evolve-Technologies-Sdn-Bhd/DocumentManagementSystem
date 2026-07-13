const http = require('http')
const fs = require('fs')
const path = require('path')

const session = 'tour-stuck-project-tracking'
const outdir = path.resolve(__dirname)
const logfile = path.join(outdir, `trae-debug-log-${session}.ndjson`)
const envfile = path.join(outdir, `${session}.env`)
const port = 7777

fs.mkdirSync(outdir, { recursive: true })
try {
  fs.unlinkSync(logfile)
} catch {}

fs.writeFileSync(envfile, `DEBUG_SERVER_URL=http://127.0.0.1:${port}/event\nDEBUG_SESSION_ID=${session}\n`)

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    })
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
        const parsed = JSON.parse(body || '{}')
        if (!parsed.ts) parsed.ts = Date.now()
        fs.appendFileSync(logfile, `${JSON.stringify(parsed)}\n`)
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify({ ok: false, error: error.message }))
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    const content = fs.existsSync(logfile) ? fs.readFileSync(logfile, 'utf8').trim() : ''
    const count = content ? content.split('\n').length : 0
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ ok: true, session, port, count }))
    return
  }

  if (req.method === 'GET' && req.url.startsWith('/logs')) {
    const content = fs.existsSync(logfile) ? fs.readFileSync(logfile, 'utf8') : ''
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
    res.end(content)
    return
  }

  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
  res.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`@@DEBUG_SERVER_INFO\n`)
  process.stdout.write(
    JSON.stringify(
      {
        api_url: `http://127.0.0.1:${port}/event`,
        session_id: session,
        log_dir: outdir,
        log_file: logfile,
        env_file: envfile
      },
      null,
      2
    )
  )
  process.stdout.write(`\n@@END_DEBUG_SERVER_INFO\n`)
})

