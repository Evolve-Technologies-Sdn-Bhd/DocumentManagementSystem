const { spawn } = require('child_process')
const fs = require('fs').promises
const path = require('path')
const config = require('../config/app')
const { BadRequestError } = require('../utils/errors')

class LibreOfficeConvertService {
  getBinary() {
    const fromEnv = String(process.env.LIBREOFFICE_BIN || '').trim()
    if (fromEnv) return fromEnv
    return process.platform === 'win32' ? 'soffice.exe' : 'soffice'
  }

  async ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true })
  }

  run(args, options = {}) {
    const bin = this.getBinary()
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
      })

      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d || '')
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) return resolve()
        reject(new Error(stderr || `LibreOffice exited with code ${code}`))
      })
    })
  }

  async convertToPdf({ inputPath, outputDir }) {
    const src = String(inputPath || '').trim()
    const out = String(outputDir || '').trim()
    if (!src) throw new BadRequestError('Missing inputPath')
    if (!out) throw new BadRequestError('Missing outputDir')

    await this.ensureDir(out)

    const args = [
      '--headless',
      '--nologo',
      '--nodefault',
      '--norestore',
      '--nofirststartwizard',
      '--convert-to',
      'pdf',
      '--outdir',
      out,
      src
    ]

    await this.run(args, { cwd: config.uploadDir })

    const base = path.basename(src, path.extname(src))
    const candidate = path.join(out, `${base}.pdf`)
    return candidate
  }
}

module.exports = new LibreOfficeConvertService()

