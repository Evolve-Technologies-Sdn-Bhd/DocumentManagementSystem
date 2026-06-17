const http = require('http')
const fs = require('fs')
const path = require('path')

const session = 'project-tracking-linking'
const outdir = path.join(process.cwd(), '.dbg')
const logFile = path.join(outdir, `trae-debug-log-${session}.ndjson`)
const envFile = path.join(outdir, `${session}.env`)
const port = 7777

fs.mkdirSync(outdir, { recursive: true })
fs.writeFileSync(envFile, `DEBUG_SERVER_URL=http://127.0.0.1:${port}/event\nDEBUG_SESSION_ID=${session}\n`)
fs.writeFileSync(logFile, '')

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      fs.appendFileSync(logFile, `${body.trim()}\n`)
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
      res.end()
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ ok: true, session, port }))
    return
  }

  if (req.method === 'GET' && req.url.startsWith('/logs')) {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Access-Control-Allow-Origin': '*' })
    res.end(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '')
    return
  }

  if (req.method === 'DELETE' && req.url === '/logs') {
    fs.writeFileSync(logFile, '')
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
    res.end()
    return
  }

  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
  res.end('not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`debug-server ${session} http://127.0.0.1:${port}/event`)
})

setInterval(() => {}, 1 << 30)
