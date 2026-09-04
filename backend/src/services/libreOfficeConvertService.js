const { spawn, exec } = require('child_process')
const fs = require('fs').promises
const path = require('path')
const os = require('os')
const config = require('../config/app')
const { BadRequestError } = require('../utils/errors')

const COMMON_WIN_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com'
]

class LibreOfficeConvertService {
  _getProfileDir() {
    return path.join(config.uploadDir, 'tmp', 'libreoffice-profile')
  }

  _toFileUrl(dirPath) {
    const normalized = dirPath.split(path.sep).join('/')
    if (process.platform === 'win32') {
      const driveUp = normalized.replace(/^([A-Za-z]):\//, (_m, drive) => `${drive.toUpperCase()}:/`)
      return 'file:///' + driveUp
    }
    return 'file://' + normalized
  }

  async _findBinary() {
    const fromEnv = String(process.env.LIBREOFFICE_BIN || '').trim()
    if (fromEnv) {
      try {
        await fs.access(fromEnv)
        return fromEnv
      } catch {}
    }
    if (process.platform === 'win32') {
      for (const p of COMMON_WIN_PATHS) {
        try {
          await fs.access(p)
          return p
        } catch {}
      }
      return 'soffice.exe'
    }
    return 'soffice'
  }

  async getBinary() {
    return this._findBinary()
  }

  async ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true })
  }

  async _killExistingSoffice() {
    if (process.platform !== 'win32') return
    return new Promise((resolve) => {
      exec('taskkill /F /IM soffice.exe /T 2>nul', () => {
        setTimeout(resolve, 800)
      })
    })
  }

  _buildArgs({ inputPath, outputDir, useCustomProfile = true }) {
    const args = [
      '--headless',
      '--nologo',
      '--nodefault',
      '--norestore',
      '--nofirststartwizard',
      '--nolockcheck',
      '--convert-to',
      'pdf:writer_pdf_Export',
      '--outdir',
      outputDir
    ]
    if (useCustomProfile) {
      const profileDir = this._getProfileDir()
      args.unshift(`-env:UserInstallation=${this._toFileUrl(profileDir)}`)
    }
    args.push(inputPath)
    return args
  }

  async run(args, options = {}) {
    const bin = await this.getBinary()
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
      })

      let stderr = ''
      let stdout = ''
      child.stdout.on('data', (d) => { stdout += String(d || '') })
      child.stderr.on('data', (d) => { stderr += String(d || '') })
      child.on('error', (err) => {
        if (err && err.code === 'ENOENT') {
          reject(new Error(
            `LibreOffice (soffice) not found on this system. Tried: ${Array.isArray(bin) ? bin : bin}. ` +
            `Install LibreOffice (minimal install is sufficient), then either (a) add it to your system PATH, ` +
            `or (b) set environment variable LIBREOFFICE_BIN to the full path of soffice.exe/soffice. ` +
            `Windows common paths: ${COMMON_WIN_PATHS.join(', ')}.`
          ))
        } else {
          reject(err)
        }
      })
      child.on('exit', (code) => {
        if (code === 0) return resolve()
        reject(new Error(stderr || stdout || `LibreOffice exited with code ${code}`))
      })
    })
  }

  async convertToPdf({ inputPath, outputDir }) {
    const src = String(inputPath || '').trim()
    const out = String(outputDir || '').trim()
    if (!src) throw new BadRequestError('Missing inputPath')
    if (!out) throw new BadRequestError('Missing outputDir')

    await this.ensureDir(out)
    await this.ensureDir(this._getProfileDir())
    await this._killExistingSoffice()

    const attempts = [
      { useCustomProfile: true },
      { useCustomProfile: false }
    ]

    let lastErr = null
    let success = false
    for (let i = 0; i < attempts.length; i++) {
      try {
        const args = this._buildArgs({ inputPath: src, outputDir: out, useCustomProfile: attempts[i].useCustomProfile })
        await this.run(args, { cwd: config.uploadDir })
        success = true
        break
      } catch (err) {
        lastErr = err
        await this._killExistingSoffice()
      }
    }

    const base = path.basename(src, path.extname(src))
    const candidate = path.join(out, `${base}.pdf`)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      if (!success && lastErr) {
        throw lastErr
      }
      throw new Error(`DOCX buffer to PDF conversion failed: output PDF was not produced.`)
    }
  }
}

module.exports = new LibreOfficeConvertService()

