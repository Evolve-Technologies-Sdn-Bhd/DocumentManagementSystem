const prisma = require('../config/database');
const fileStorageService = require('./fileStorageService');
const documentAssignmentService = require('./documentAssignmentService');
const folderPermissionService = require('./folderPermissionService')
const confidentialAccessService = require('./confidentialAccessService')
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/errors');
const DocumentNumbering = require('../utils/documentNumbering');
const path = require('path');
const { startTimer, getElapsedMs, roundMs } = require('../utils/timing');

class DocumentService {
  queueDocumentVersionEncryption(versionId, expectedFilePath = null) {
    setImmediate(async () => {
      const taskStart = startTimer()
      try {
        const result = await this.encryptStoredDocumentVersion(versionId, expectedFilePath)
        console.log('[document-version-encryption]', JSON.stringify({
          success: true,
          versionId,
          ...result,
          totalBackgroundMs: roundMs(getElapsedMs(taskStart))
        }))
      } catch (error) {
        console.error('[document-version-encryption]', JSON.stringify({
          success: false,
          versionId,
          error: { message: error.message, code: error.code || null },
          totalBackgroundMs: roundMs(getElapsedMs(taskStart))
        }))
      }
    })
  }

  async encryptStoredDocumentVersion(versionId, expectedFilePath = null) {
    const timings = {}

    const loadVersionStart = startTimer()
    const version = await prisma.documentVersion.findUnique({
      where: { id: versionId },
      select: { id: true, filePath: true, isEncrypted: true }
    })
    timings.loadVersionMs = roundMs(getElapsedMs(loadVersionStart))

    if (!version) {
      return { timings, skipped: 'VERSION_NOT_FOUND' }
    }

    if (version.isEncrypted) {
      return { timings, skipped: 'ALREADY_ENCRYPTED' }
    }

    if (expectedFilePath && version.filePath !== expectedFilePath) {
      return { timings, skipped: 'FILE_PATH_CHANGED' }
    }

    const encryptionService = require('./encryptionService')
    const encryptedPath = `${version.filePath}.enc`

    const encryptStart = startTimer()
    await encryptionService.encryptFile(version.filePath, encryptedPath)
    timings.encryptFileMs = roundMs(getElapsedMs(encryptStart))

    const updateVersionStart = startTimer()
    const updated = await prisma.documentVersion.updateMany({
      where: {
        id: versionId,
        isEncrypted: false,
        filePath: version.filePath
      },
      data: {
        filePath: encryptedPath,
        isEncrypted: true
      }
    })
    timings.updateVersionRowMs = roundMs(getElapsedMs(updateVersionStart))

    if (updated.count === 0) {
      await fileStorageService.deleteFile(encryptedPath)
      return { timings, skipped: 'VERSION_CHANGED_DURING_ENCRYPTION' }
    }

    const deleteOriginalStart = startTimer()
    const deletedOriginal = await fileStorageService.deleteFile(version.filePath)
    timings.deleteOriginalMs = roundMs(getElapsedMs(deleteOriginalStart))

    return {
      timings,
      encryptedPath,
      deletedOriginal
    }
  }

  getDateDigitsFromSettings(dateFormat) {
    switch (String(dateFormat || '').toUpperCase()) {
      case 'YYMMDD': return 6
      case 'YYYYMMDD': return 8
      case 'YYYYMM': return 6
      case 'YYMM': return 4
      case 'YYYY': return 4
      case 'NONE': return 0
      default: return 0
    }
  }

  buildCodeKey(projectCategoryId, documentTypeId, versionSegment = '') {
    const pc = parseInt(projectCategoryId, 10)
    const dt = parseInt(documentTypeId, 10)
    const v = String(versionSegment || '').toUpperCase()
    return `${pc}:${dt}:${v}`
  }

  buildNormalizedFileCode(parts, settings) {
    const sepOut = String(settings?.separator || '/')
    const segs = []
    if (settings?.includeProjectCategoryCode && parts.projectCategoryCode) {
      segs.push(String(parts.projectCategoryCode || ''))
    }
    segs.push(String(parts.prefix || ''))
    if (settings?.includeVersion) segs.push(String(parts.versionSegment || ''))
    if ((this.getDateDigitsFromSettings(settings?.dateFormat) || 0) > 0) segs.push(String(parts.dateSegment || ''))
    const counterDigits = Math.max(1, parseInt(settings?.counterDigits, 10) || 3)
    segs.push(String(parts.runningNumber || 0).padStart(counterDigits, '0'))
    return segs.join(sepOut)
  }

  parseAndNormalizeFileCodeStrict(raw, settings) {
    const input = String(raw || '').trim()
    if (!input) {
      const err = new BadRequestError('File code is required')
      err.code = 'EMPTY_FILE_CODE'
      throw err
    }
    if (!settings || typeof settings !== 'object') {
      const err = new BadRequestError('Document numbering settings not found')
      err.code = 'MISSING_NUMBERING_SETTINGS'
      throw err
    }

    const prefixLen = Math.max(1, String(settings.prefixPlaceholder || 'PFX').length)
    const includeProjectCategoryCode = Boolean(settings.includeProjectCategoryCode)
    const includeVersion = Boolean(settings.includeVersion)
    const versionDigits = includeVersion ? Math.max(1, parseInt(settings.versionDigits, 10) || 2) : 0
    const dateDigits = this.getDateDigitsFromSettings(settings.dateFormat)
    const counterDigits = Math.max(1, parseInt(settings.counterDigits, 10) || 3)

    const cleaned = input.replace(/\s+/g, '')
    const parts = cleaned.split(/[\/\-\._]+/).filter(Boolean)
    const expectedBaseCount = 1 + (includeVersion ? 1 : 0) + (dateDigits > 0 ? 1 : 0) + 1

    const fail = (code, message) => {
      const err = new BadRequestError(message)
      err.code = code
      throw err
    }

    const parseVersion = (seg) => {
      const m = String(seg || '').match(new RegExp(`^(\\d{${versionDigits}})([A-Za-z]?)$`))
      if (!m) return null
      return `${m[1]}${(m[2] || '').toUpperCase()}`
    }

    const parseStructuredParts = (arr, hasProjectCategoryCode = false) => {
      let idx = 0
      let projectCategoryCode = ''
      if (hasProjectCategoryCode) {
        projectCategoryCode = String(arr[idx++] || '')
        if (!/^[A-Za-z0-9]+$/.test(projectCategoryCode)) {
          fail('INVALID_PROJECT_CATEGORY_CODE', `Project category code is invalid for "${input}"`)
        }
      }

      const prefix = String(arr[idx++] || '')
      if (!new RegExp(`^[A-Za-z0-9]{1,${prefixLen}}$`).test(prefix)) {
        fail('INVALID_PREFIX', `Prefix is invalid for "${input}"`)
      }
      let versionSegment = ''
      if (includeVersion) {
        versionSegment = parseVersion(arr[idx++])
        if (!versionSegment) {
          fail('INVALID_VERSION_SEGMENT', `Version segment must be ${versionDigits} digit(s), optional suffix A-Z`)
        }
      }
      let dateSegment = ''
      if (dateDigits > 0) {
        dateSegment = String(arr[idx++] || '')
        if (!new RegExp(`^\\d{${dateDigits}}$`).test(dateSegment)) {
          fail('INVALID_DATE_SEGMENT', `Date segment must be ${dateDigits} digit(s)`)
        }
      }
      const counterSeg = String(arr[idx] || '')
      if (!new RegExp(`^\\d{${counterDigits}}$`).test(counterSeg)) {
        fail('INVALID_RUNNING_NUMBER', `Running number must be ${counterDigits} digit(s)`)
      }
      const runningNumber = parseInt(counterSeg, 10)
      return {
        projectCategoryCode,
        prefix,
        versionSegment,
        dateSegment,
        runningNumber,
        normalizedFileCode: this.buildNormalizedFileCode({
          projectCategoryCode,
          prefix,
          versionSegment,
          dateSegment,
          runningNumber
        }, settings)
      }
    }

    if (parts.length === expectedBaseCount) {
      return parseStructuredParts(parts, false)
    }

    if (includeProjectCategoryCode && parts.length === expectedBaseCount + 1) {
      return parseStructuredParts(parts, true)
    }

    const compactRegex = (() => {
      const prefix = `([A-Za-z0-9]{1,${prefixLen}})`
      const version = includeVersion ? `(\\d{${versionDigits}}[A-Za-z]?)` : ''
      const date = dateDigits > 0 ? `(\\d{${dateDigits}})` : ''
      const counter = `(\\d{${counterDigits}})`
      return new RegExp(`^${prefix}${version}${date}${counter}$`)
    })()
    const compact = cleaned.match(compactRegex)
    if (compact) {
      const arr = []
      let i = 1
      arr.push(compact[i++])
      if (includeVersion) arr.push(compact[i++])
      if (dateDigits > 0) arr.push(compact[i++])
      arr.push(compact[i++])
      return parseStructuredParts(arr, false)
    }

    if (includeProjectCategoryCode) {
      const suffixRegex = (() => {
        const version = includeVersion ? `(\\d{${versionDigits}}[A-Za-z]?)` : ''
        const date = dateDigits > 0 ? `(\\d{${dateDigits}})` : ''
        const counter = `(\\d{${counterDigits}})`
        return new RegExp(`^([A-Za-z0-9]+)${version}${date}${counter}$`)
      })()
      const compactWithCategory = cleaned.match(suffixRegex)
      if (compactWithCategory) {
        const leading = String(compactWithCategory[1] || '')
        const prefix = leading.slice(-prefixLen)
        const projectCategoryCode = leading.slice(0, -prefix.length)
        if (projectCategoryCode && prefix) {
          const arr = [projectCategoryCode, prefix]
          let i = 2
          if (includeVersion) arr.push(compactWithCategory[i++])
          if (dateDigits > 0) arr.push(compactWithCategory[i++])
          arr.push(compactWithCategory[i++])
          return parseStructuredParts(arr, true)
        }
      }
    }

    fail(
      'FORMAT_MISMATCH',
      `File code "${input}" does not match current numbering format`
    )
  }

  async getCurrentMaxRunningNumber(projectCategoryId, documentTypeId, settings, scope = {}) {
    const versionSegment = scope?.versionSegment ? String(scope.versionSegment).toUpperCase() : ''
    const codeKey = this.buildCodeKey(projectCategoryId, documentTypeId, versionSegment)
    const registryAgg = await prisma.codeRegistry.aggregate({
      where: {
        projectCategoryId: parseInt(projectCategoryId, 10),
        codeKey
      },
      _max: { runningNumber: true }
    })

    let maxFromRegistryParsed = 0
    const registryRows = await prisma.codeRegistry.findMany({
      where: {
        projectCategoryId: parseInt(projectCategoryId, 10),
        documentTypeId: parseInt(documentTypeId, 10)
      },
      select: { fileCode: true, runningNumber: true }
    })
    for (const row of registryRows) {
      try {
        const parsed = this.parseAndNormalizeFileCodeStrict(row.fileCode, settings)
        if (versionSegment && parsed.versionSegment !== versionSegment) continue
        if (parsed.runningNumber > maxFromRegistryParsed) {
          maxFromRegistryParsed = parsed.runningNumber
        }
      } catch (_) {
      }
    }

    const documents = await prisma.document.findMany({
      where: {
        projectCategoryId: parseInt(projectCategoryId, 10),
        documentTypeId: parseInt(documentTypeId, 10),
        fileCode: {
          not: {
            startsWith: 'PENDING-'
          }
        }
      },
      select: { fileCode: true }
    })

    let maxFromDocuments = 0
    for (const doc of documents) {
      try {
        const parsed = this.parseAndNormalizeFileCodeStrict(doc.fileCode, settings)
        if (versionSegment && parsed.versionSegment !== versionSegment) continue
        if (parsed.runningNumber > maxFromDocuments) {
          maxFromDocuments = parsed.runningNumber
        }
      } catch (_) {
        // Ignore legacy codes that don't match current format
      }
    }

    return Math.max(registryAgg?._max?.runningNumber || 0, maxFromRegistryParsed, maxFromDocuments)
  }

  async registerFileCodeLedger({
    fileCode,
    projectCategoryId,
    documentTypeId,
    runningNumber,
    source = 'SYSTEM',
    sourceRefId = null
  }) {
    if (!projectCategoryId || !documentTypeId || !runningNumber) return null
    const normalized = String(fileCode || '').trim()
    if (!normalized) return null
    let codeKey = this.buildCodeKey(projectCategoryId, documentTypeId)
    try {
      const settings = await DocumentNumbering.loadSettings()
      const parsed = this.parseAndNormalizeFileCodeStrict(normalized, settings)
      codeKey = this.buildCodeKey(projectCategoryId, documentTypeId, parsed.versionSegment)
    } catch (_) {
    }

    const pc = parseInt(projectCategoryId, 10)
    await prisma.codeRegistry.upsert({
      where: { fileCode_projectCategoryId: { fileCode: normalized, projectCategoryId: pc } },
      update: {
        normalizedFileCode: normalized,
        projectCategoryId: pc,
        documentTypeId: parseInt(documentTypeId, 10),
        codeKey,
        runningNumber: parseInt(runningNumber, 10),
        source,
        sourceRefId: sourceRefId ? parseInt(sourceRefId, 10) : null
      },
      create: {
        fileCode: normalized,
        normalizedFileCode: normalized,
        projectCategoryId: pc,
        documentTypeId: parseInt(documentTypeId, 10),
        codeKey,
        runningNumber: parseInt(runningNumber, 10),
        source,
        sourceRefId: sourceRefId ? parseInt(sourceRefId, 10) : null
      }
    })

    return true
  }

  normalizeFileCodeBySettings(raw, settings) {
    const input = String(raw || '').trim()
    if (!input) return ''
    if (!settings || typeof settings !== 'object') return input

    const prefixLen = Math.max(1, String(settings.prefixPlaceholder || 'PFX').length)
    const includeProjectCategoryCode = Boolean(settings.includeProjectCategoryCode)
    const includeVersion = Boolean(settings.includeVersion)
    const versionDigits = includeVersion ? Math.max(1, parseInt(settings.versionDigits, 10) || 2) : 0
    const dateFormat = String(settings.dateFormat || 'YYMMDD').toUpperCase()
    const counterDigits = Math.max(1, parseInt(settings.counterDigits, 10) || 3)
    const sepOut = String(settings.separator || '/')

    const dateDigits = (() => {
      switch (dateFormat) {
        case 'YYMMDD': return 6
        case 'YYYYMMDD': return 8
        case 'YYYYMM': return 6
        case 'YYMM': return 4
        case 'YYYY': return 4
        case 'NONE': return 0
        default: return 0
      }
    })()

    const cleaned = input.replace(/\s+/g, '')
    const parts = cleaned.split(/[\/\-\._]+/).filter(Boolean)

    const build = (projectCategoryCode, prefix, version, date, counter) => {
      const p = String(prefix || '').substring(0, prefixLen)
      const segs = []
      if (includeProjectCategoryCode && projectCategoryCode) {
        segs.push(String(projectCategoryCode || ''))
      }
      segs.push(p)
      if (includeVersion) segs.push(String(version || '').padStart(versionDigits, '0'))
      if (dateDigits > 0) segs.push(String(date || '').padStart(dateDigits, '0'))
      segs.push(String(counter || '').padStart(counterDigits, '0'))
      return segs.join(sepOut)
    }

    const isDigits = (s, len) => new RegExp(`^\\d{${len}}$`).test(String(s || ''))
    const isProjectCategoryOk = (s) => /^[A-Za-z0-9]+$/.test(String(s || ''))
    const isPrefixOk = (s) => new RegExp(`^[A-Za-z0-9]{1,${prefixLen}}$`).test(String(s || ''))

    const basePartCount = 1 + (includeVersion ? 1 : 0) + (dateDigits > 0 ? 1 : 0) + 1

    if (parts.length === basePartCount || (includeProjectCategoryCode && parts.length === basePartCount + 1)) {
      let idx = 0
      let projectCategoryCode = ''
      if (includeProjectCategoryCode && parts.length === basePartCount + 1) {
        projectCategoryCode = parts[idx++]
      }
      const prefix = parts[idx++]
      const version = includeVersion ? parts[idx++] : ''
      const date = dateDigits > 0 ? parts[idx++] : ''
      const counter = parts[idx++]

      if (
        (!projectCategoryCode || isProjectCategoryOk(projectCategoryCode)) &&
        isPrefixOk(prefix) &&
        (!includeVersion || isDigits(version, versionDigits)) &&
        (dateDigits === 0 || isDigits(date, dateDigits)) &&
        isDigits(counter, counterDigits)
      ) {
        return build(projectCategoryCode, prefix, version, date, counter)
      }
    }

    const m = cleaned.match(new RegExp(`^([A-Za-z0-9]{1,${prefixLen}})(\\d+)$`))
    if (m) {
      const prefix = m[1]
      const digits = m[2]
      const expected = versionDigits + dateDigits + counterDigits
      if (digits.length === expected) {
        let offset = 0
        const version = includeVersion ? digits.slice(offset, offset + versionDigits) : ''
        offset += versionDigits
        const date = dateDigits > 0 ? digits.slice(offset, offset + dateDigits) : ''
        offset += dateDigits
        const counter = digits.slice(offset, offset + counterDigits)
        return build('', prefix, version, date, counter)
      }
    }

    if (includeProjectCategoryCode) {
      const suffixLength = versionDigits + dateDigits + counterDigits
      const match = cleaned.match(new RegExp(`^([A-Za-z0-9]+?)(\\d{${suffixLength}})$`))
      if (match) {
        const leading = match[1]
        const digits = match[2]
        if (leading.length > prefixLen) {
          const prefix = leading.slice(-prefixLen)
          const projectCategoryCode = leading.slice(0, -prefix.length)
          if (projectCategoryCode && isProjectCategoryOk(projectCategoryCode) && isPrefixOk(prefix)) {
            let offset = 0
            const version = includeVersion ? digits.slice(offset, offset + versionDigits) : ''
            offset += versionDigits
            const date = dateDigits > 0 ? digits.slice(offset, offset + dateDigits) : ''
            offset += dateDigits
            const counter = digits.slice(offset, offset + counterDigits)
            return build(projectCategoryCode, prefix, version, date, counter)
          }
        }
      }
    }

    return input
  }

  normalizeFileCodePrefix(fileCode, preferredPrefix = '') {
    const input = String(fileCode || '').trim()
    if (!input) return input
    const pref = String(preferredPrefix || '').trim()
    if (!pref) return input
    const m = input.match(/^[A-Za-z]{1,}$/)
    if (m) {
      const rest = input.slice(m[0].length)
      return `${pref}${rest}`
    }
    const prefixMatch = input.match(/^[A-Za-z]{1,}/)
    if (!prefixMatch) return input
    const rest = input.slice(prefixMatch[0].length)
    return `${pref}${rest}`
  }

  async normalizeFileCodeFromSystemSettings(raw) {
    const input = String(raw || '').trim()
    if (!input) return ''
    try {
      const configService = require('./configService')
      const settings = await configService.getDocumentNumberingSettings()
      return this.normalizeFileCodeBySettings(input, settings)
    } catch {
      return input
    }
  }

  /**
   * Generate unique file code for document
   * Uses DocumentNumbering utility to format based on system settings
   * Sequence is unique per Document Type + Project Category combination
   * @param {number} documentTypeId - Document type ID
   * @param {number} projectCategoryId - Project category ID
   * @param {string} version - Document version (default: '1')
   * @param {Date} documentDate - Optional document date (defaults to current date)
   */
  async generateFileCode(documentTypeId, projectCategoryId, version = '1', documentDate = null) {
    const documentType = await prisma.documentType.findUnique({
      where: { id: documentTypeId }
    });

    if (!documentType) {
      throw new NotFoundError('Document type');
    }

    const dateToUse = documentDate || new Date();
    const prefix = documentType.prefix;
    const settings = await DocumentNumbering.loadSettings()
    let projectCategoryCode = ''

    if (settings?.includeProjectCategoryCode && projectCategoryId) {
      const projectCategory = await prisma.projectCategory.findUnique({
        where: { id: parseInt(projectCategoryId, 10) },
        select: { code: true }
      })
      projectCategoryCode = String(projectCategory?.code || '').trim()
    }

    let sequence = 1
    if (projectCategoryId) {
      const template = await DocumentNumbering.generateFileCode(prefix, 1, {
        date: dateToUse,
        version,
        settings,
        projectCategoryCode
      })
      const parsedTemplate = this.parseAndNormalizeFileCodeStrict(template, settings)
      const maxRunning = await this.getCurrentMaxRunningNumber(projectCategoryId, documentTypeId, settings, {
        versionSegment: parsedTemplate.versionSegment
      })
      const startingNumber = Math.max(1, parseInt(settings?.startingNumber, 10) || 1)
      sequence = Math.max(maxRunning + 1, startingNumber)
    }

    // Use DocumentNumbering utility to generate file code based on system settings
    let fileCode = await DocumentNumbering.generateFileCode(prefix, sequence, {
      date: dateToUse,
      version: version,
      settings,
      projectCategoryCode
    })

    // Guard against collisions in existing records
    let retries = 0
    while (retries < 30) {
      const pcId = projectCategoryId ? parseInt(projectCategoryId, 10) : null
      const [existingDoc, existingReg] = await Promise.all([
        pcId
          ? prisma.document.findFirst({ where: { fileCode, projectCategoryId: pcId } })
          : prisma.document.findFirst({ where: { fileCode } }),
        pcId
          ? prisma.codeRegistry.findFirst({ where: { fileCode, projectCategoryId: pcId } })
          : Promise.resolve(null)
      ])
      if (!existingDoc && !existingReg) break
      sequence += 1
      fileCode = await DocumentNumbering.generateFileCode(prefix, sequence, {
        date: dateToUse,
        version,
        settings,
        projectCategoryCode
      })
      retries += 1
    }

    return fileCode;
  }

  /**
   * Create new document
   */
  async createDocument(data, creatorId) {
    const { title, description, documentTypeId, projectCategoryId, folderId, isConfidential } = data;

    // Generate file code
    const fileCode = await this.generateFileCode(documentTypeId, projectCategoryId || null);

    // Create document
    const document = await prisma.document.create({
      data: {
        fileCode,
        isConfidential: Boolean(isConfidential),
        title,
        description,
        documentTypeId,
        projectCategoryId: projectCategoryId || null,
        folderId: folderId ? parseInt(folderId) : null,
        createdById: creatorId,
        ownerId: creatorId,
        status: 'DRAFT',
        stage: 'DRAFT',
        version: '1.0'
      },
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Create document directory
    await fileStorageService.createDocumentDirectory(fileCode, projectCategoryId || null);

    // Create document register entry
    const pcId = projectCategoryId ? parseInt(projectCategoryId, 10) : null
    if (pcId) {
      await prisma.documentRegister.upsert({
        where: { fileCode_projectCategoryId: { fileCode, projectCategoryId: pcId } },
        update: {
          documentTitle: title,
          documentType: document.documentType.name,
          version: '1.0',
          owner: `${document.owner.firstName} ${document.owner.lastName}`,
          department: document.owner.department || '',
          status: 'DRAFT'
        },
        create: {
          fileCode,
          projectCategoryId: pcId,
          documentTitle: title,
          documentType: document.documentType.name,
          version: '1.0',
          owner: `${document.owner.firstName} ${document.owner.lastName}`,
          department: document.owner.department || '',
          status: 'DRAFT'
        }
      });
    } else {
      await prisma.documentRegister.create({
        data: {
          fileCode,
          projectCategoryId: null,
          documentTitle: title,
          documentType: document.documentType.name,
          version: '1.0',
          owner: `${document.owner.firstName} ${document.owner.lastName}`,
          department: document.owner.department || '',
          status: 'DRAFT'
        }
      })
    }
    

    try {
      const settings = await DocumentNumbering.loadSettings()
      const parsed = this.parseAndNormalizeFileCodeStrict(fileCode, settings)
      await this.registerFileCodeLedger({
        fileCode,
        projectCategoryId,
        documentTypeId,
        runningNumber: parsed.runningNumber,
        source: 'CREATE_DOCUMENT',
        sourceRefId: document.id
      })
    } catch (_) {
      // Keep create flow backward compatible even if code doesn't match current format
    }

    return document;
  }

  async createDocumentWithFileCode(data, creatorId, options = {}) {
    const { fileCode, title, description, documentTypeId, projectCategoryId, folderId } = data
    const normalizedFileCode = await this.normalizeFileCodeFromSystemSettings(fileCode)
    if (!normalizedFileCode) {
      throw new BadRequestError('File code is required')
    }

    const pcId = projectCategoryId ? parseInt(projectCategoryId, 10) : null
    if (pcId) {
      const allocation = await this.resolveImportedPublishedFileCode({
        fileCode: normalizedFileCode,
        documentTypeId,
        projectCategoryId: pcId
      })
      if (allocation.suggestedFileCode !== allocation.normalizedRequested) {
        const err = new BadRequestError('Running number conflicts with existing registry')
        err.code = 'RUNNING_NUMBER_CONFLICT'
        err.errors = [{
          requestedFileCode: allocation.normalizedRequested,
          suggestedFileCode: allocation.suggestedFileCode,
          reasonCode: 'RUNNING_NUMBER_TAKEN'
        }]
        throw err
      }
    }

    const existing = pcId
      ? await prisma.document.findFirst({ where: { fileCode: normalizedFileCode, projectCategoryId: pcId } })
      : await prisma.document.findFirst({ where: { fileCode: normalizedFileCode } })
    if (existing) {
      const err = new BadRequestError('File code already exists')
      err.code = 'FILE_CODE_EXISTS'
      throw err
    }

    const status = options.status || 'DRAFT'
    const stage = options.stage || 'DRAFT'
    const version = options.version || '1.0'

    const document = await prisma.document.create({
      data: {
        fileCode: normalizedFileCode,
        title,
        description,
        documentTypeId,
        projectCategoryId: pcId,
        folderId: folderId ? parseInt(folderId, 10) : null,
        createdById: creatorId,
        ownerId: creatorId,
        status,
        stage,
        version
      },
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    })

    await fileStorageService.createDocumentDirectory(normalizedFileCode, pcId)

    const existingRegister = await prisma.documentRegister.findFirst({
      where: { fileCode: normalizedFileCode, projectCategoryId: pcId }
    })

    const registerData = {
      documentTitle: title,
      documentType: document.documentType.name,
      version,
      owner: `${document.owner.firstName} ${document.owner.lastName}`,
      department: document.owner.department || '',
      status
    }

    if (existingRegister) {
      await prisma.documentRegister.update({
        where: { id: existingRegister.id },
        data: registerData
      })
    } else {
      await prisma.documentRegister.create({
        data: {
          fileCode: normalizedFileCode,
          projectCategoryId: pcId,
          ...registerData
        }
      })
    }

    try {
      const settings = await DocumentNumbering.loadSettings()
      const parsed = this.parseAndNormalizeFileCodeStrict(normalizedFileCode, settings)
      await this.registerFileCodeLedger({
        fileCode: normalizedFileCode,
        projectCategoryId: pcId,
        documentTypeId,
        runningNumber: parsed.runningNumber,
        source: 'CREATE_DOCUMENT_WITH_FILE_CODE',
        sourceRefId: document.id
      })
    } catch (_) {
    }

    return document
  }

  async resolveImportedPublishedFileCode(data, reserved = null) {
    const { fileCode, documentTypeId, projectCategoryId } = data
    const categoryId = projectCategoryId ? parseInt(projectCategoryId, 10) : null
    const settings = await DocumentNumbering.loadSettings()
    const parsed = this.parseAndNormalizeFileCodeStrict(String(fileCode).trim(), settings)
    const codeKey = this.buildCodeKey(categoryId, documentTypeId, parsed.versionSegment)
    const normalizedRequested = parsed.normalizedFileCode
    const requestedRunningNumber = parsed.runningNumber

    const buildWithRunning = (runningNumber) => this.buildNormalizedFileCode({
      prefix: parsed.prefix,
      versionSegment: parsed.versionSegment,
      dateSegment: parsed.dateSegment,
      runningNumber
    }, settings)

    const reservedFileCodes = reserved?.fileCodes instanceof Set ? reserved.fileCodes : null
    const reservedRunningByKey = reserved?.runningByCodeKey instanceof Map ? reserved.runningByCodeKey : null

    const isReserved = (fileCodeCandidate, runningCandidate) => {
      if (reservedFileCodes && reservedFileCodes.has(fileCodeCandidate)) return true
      if (reservedRunningByKey) {
        const set = reservedRunningByKey.get(codeKey)
        if (set && set.has(runningCandidate)) return true
      }
      return false
    }

    const hasConflictForRunning = async (runningCandidate) => {
      const fc = buildWithRunning(runningCandidate)
      if (isReserved(fc, runningCandidate)) return true
      const [existingDocument, existingRegistryByFile, existingRegistryByRunning, legacyRegistryByRunning] = await Promise.all([
        prisma.document.findFirst({ where: { fileCode: fc, projectCategoryId: categoryId } }),
        prisma.codeRegistry.findFirst({ where: { fileCode: fc, projectCategoryId: categoryId } }),
        prisma.codeRegistry.findFirst({ where: { projectCategoryId: categoryId, codeKey, runningNumber: runningCandidate } }),
        prisma.codeRegistry.findMany({
          where: {
            projectCategoryId: categoryId,
            documentTypeId: documentTypeId,
            runningNumber: runningCandidate
          },
          select: { fileCode: true }
        })
      ])
      if (existingDocument || existingRegistryByFile || existingRegistryByRunning) return true
      if (legacyRegistryByRunning && legacyRegistryByRunning.length > 0) {
        for (const row of legacyRegistryByRunning) {
          try {
            const parsedRow = this.parseAndNormalizeFileCodeStrict(row.fileCode, settings)
            if (parsedRow.versionSegment === parsed.versionSegment) return true
          } catch (_) {
          }
        }
      }
      return false
    }

    const requestedTaken = await hasConflictForRunning(requestedRunningNumber)
    if (!requestedTaken) {
      return {
        codeKey,
        normalizedRequested,
        requestedRunningNumber,
        suggestedFileCode: normalizedRequested,
        suggestedRunningNumber: requestedRunningNumber
      }
    }

    const startingNumber = Math.max(1, parseInt(settings?.startingNumber, 10) || 1)
    const maxRunning = await this.getCurrentMaxRunningNumber(categoryId, documentTypeId, settings, {
      versionSegment: parsed.versionSegment
    })
    let nextRunning = Math.max(maxRunning + 1, startingNumber)
    let attempts = 0
    while (attempts < 2000) {
      const taken = await hasConflictForRunning(nextRunning)
      if (!taken) {
        return {
          codeKey,
          normalizedRequested,
          requestedRunningNumber,
          suggestedFileCode: buildWithRunning(nextRunning),
          suggestedRunningNumber: nextRunning
        }
      }
      nextRunning += 1
      attempts += 1
    }

    const err = new BadRequestError('Unable to allocate a unique file code for this project category')
    err.code = 'FILE_CODE_ALLOCATION_FAILED'
    throw err
  }

  async createImportedPublishedDocument(data, creatorId) {
    const {
      fileCode,
      title,
      description,
      documentTypeId,
      projectCategoryId,
      folderId,
      isClientDocument,
      allowReassign,
      resolvedFinalFileCode,
      resolvedRunningNumber,
      skipProjectCategoryValidation
    } = data
    const clientDoc = Boolean(isClientDocument)

    const categoryId = projectCategoryId ? parseInt(projectCategoryId, 10) : null
    if (!categoryId) {
      const err = new BadRequestError('Project category is required')
      err.code = 'PROJECT_CATEGORY_REQUIRED'
      throw err
    }

    if (!skipProjectCategoryValidation) {
      const category = await prisma.projectCategory.findUnique({
        where: { id: categoryId }
      })
      if (!category) {
        const err = new BadRequestError('Project category not found')
        err.code = 'PROJECT_CATEGORY_NOT_FOUND'
        throw err
      }
    }

    let finalFileCode = ''
    let nextRunning = null
    let normalizedRequested = ''
    let wasReassigned = false

    if (clientDoc) {
      const base = `CLT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      finalFileCode = base
    } else {
      if (resolvedFinalFileCode && String(resolvedFinalFileCode).trim()) {
        finalFileCode = String(resolvedFinalFileCode).trim()
        nextRunning = Number.isFinite(Number(resolvedRunningNumber)) ? parseInt(resolvedRunningNumber, 10) : null
      } else {
        if (!fileCode || !String(fileCode).trim()) {
          throw new BadRequestError('File code is required')
        }
        const allocation = await this.resolveImportedPublishedFileCode({
          fileCode,
          documentTypeId,
          projectCategoryId: categoryId
        })

        normalizedRequested = allocation.normalizedRequested
        if (allocation.suggestedFileCode !== normalizedRequested) {
          if (!allowReassign) {
            const { ConflictError } = require('../utils/errors')
            const err = new ConflictError('File code is redundant. Confirmation required to reassign.')
            err.code = 'FILE_CODE_REASSIGN_REQUIRED'
            err.errors = [{
              requestedFileCode: normalizedRequested,
              suggestedFileCode: allocation.suggestedFileCode,
              reasonCode: 'RUNNING_NUMBER_TAKEN'
            }]
            throw err
          }
          wasReassigned = true
        }

        finalFileCode = allowReassign ? allocation.suggestedFileCode : normalizedRequested
        nextRunning = allowReassign ? allocation.suggestedRunningNumber : allocation.requestedRunningNumber
      }
    }

    if (!clientDoc && !finalFileCode) {
      throw new BadRequestError('Resolved file code is required')
    }

    const document = await prisma.document.create({
      data: {
        fileCode: finalFileCode,
        isClientDocument: clientDoc,
        title,
        description,
        documentTypeId,
        projectCategoryId: categoryId,
        folderId: folderId ? parseInt(folderId) : null,
        createdById: creatorId,
        ownerId: creatorId,
        status: 'DRAFT',
        stage: 'DRAFT',
        version: '1.0'
      },
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    })

    await fileStorageService.createDocumentDirectory(finalFileCode, categoryId)

    if (!clientDoc) {
      await prisma.documentRegister.upsert({
        where: { fileCode_projectCategoryId: { fileCode: finalFileCode, projectCategoryId: categoryId } },
        update: {
          documentTitle: title,
          documentType: document.documentType.name,
          version: '1.0',
          owner: `${document.owner.firstName} ${document.owner.lastName}`,
          department: document.owner.department || '',
          status: 'DRAFT'
        },
        create: {
          fileCode: finalFileCode,
          projectCategoryId: categoryId,
          documentTitle: title,
          documentType: document.documentType.name,
          version: '1.0',
          owner: `${document.owner.firstName} ${document.owner.lastName}`,
          department: document.owner.department || '',
          status: 'DRAFT'
        }
      })

      await this.registerFileCodeLedger({
        fileCode: finalFileCode,
        projectCategoryId: categoryId,
        documentTypeId,
        runningNumber: nextRunning,
        source: 'BULK_IMPORT',
        sourceRefId: document.id
      })
    }

    return document
  }

  /**
   * Upload document file version
   */
  async uploadDocumentVersion(documentId, file, uploaderId, options = {}) {
    const overallStart = startTimer()
    const onTiming = typeof options?.onTiming === 'function' ? options.onTiming : null
    const timing = {}

    const finishTiming = (extra = {}) => {
      const payload = {
        ...timing,
        ...extra,
        totalServiceMs: roundMs(getElapsedMs(overallStart))
      }
      if (onTiming) onTiming(payload)
    }

    try {
      const loadDocumentStart = startTimer()
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
          documentType: true,
          versions: {
            orderBy: { uploadedAt: 'asc' }
          }
        }
      });
      timing.loadDocumentMs = roundMs(getElapsedMs(loadDocumentStart))

      if (!document) {
        throw new NotFoundError('Document');
      }

      // Get version control settings
      const configService = require('./configService');
      const settingsStart = startTimer()
      const versionSettings = await configService.getVersionControlSettings();
      timing.loadVersionSettingsMs = roundMs(getElapsedMs(settingsStart))

      // Check if we need to enforce version limit
      if (versionSettings.maxVersions && document.versions.length >= versionSettings.maxVersions) {
        // Delete the oldest version(s) to make room
        const versionsToDelete = document.versions.slice(0, document.versions.length - versionSettings.maxVersions + 1);
        const cleanupStart = startTimer()

        for (const oldVersion of versionsToDelete) {
          // Delete file from storage
          try {
            await fileStorageService.deleteFile(oldVersion.filePath);
          } catch (error) {
            console.error(`Failed to delete old version file: ${oldVersion.filePath}`, error);
          }

          // Delete version record
          await prisma.documentVersion.delete({
            where: { id: oldVersion.id }
          });
        }

        timing.oldVersionCleanupMs = roundMs(getElapsedMs(cleanupStart))
        timing.oldVersionsDeleted = versionsToDelete.length
      }

      // Move file from temp to document directory
      const { absolutePath } = fileStorageService.getDocumentPath(document.fileCode, document.projectCategoryId || null);
      const fileName = fileStorageService.generateUniqueFileName(file.originalname);
      const saveFileStart = startTimer()
      let finalPath = await fileStorageService.saveFile(file, absolutePath, fileName);
      timing.moveToStorageMs = roundMs(getElapsedMs(saveFileStart))

      // Check if encryption is enabled
      const encryptionService = require('./encryptionService');
      const encryptionSettingStart = startTimer()
      const isEncryptionEnabled = await encryptionService.isEncryptionEnabled();
      timing.checkEncryptionSettingMs = roundMs(getElapsedMs(encryptionSettingStart))

      // Create document version record
      const createVersionStart = startTimer()
      const version = await prisma.documentVersion.create({
        data: {
          documentId,
          version: document.version,
          filePath: finalPath,
          fileName: file.displayName || file.originalname,
          mimeType: file.mimetype,
          fileSize: file.size,
          uploadedById: uploaderId,
          isPublished: false,
          isEncrypted: false
        }
      });
      timing.createVersionRowMs = roundMs(getElapsedMs(createVersionStart))
      timing.encryptionDeferred = Boolean(isEncryptionEnabled)

      if (isEncryptionEnabled) {
        const queueEncryptionStart = startTimer()
        this.queueDocumentVersionEncryption(version.id, finalPath)
        timing.queueEncryptionMs = roundMs(getElapsedMs(queueEncryptionStart))
      }

      finishTiming()
      return version;
    } catch (error) {
      finishTiming({ error: error.message })
      throw error
    }
  }

  /**
   * Get document by ID
   * Enforces assignment-based access control
   */
  async getDocumentById(documentId, userOrUserId = null) {
    const user = typeof userOrUserId === 'object' && userOrUserId ? userOrUserId : null
    const userId = user ? user.id : userOrUserId

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        versions: {
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        },
        approvalHistory: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        comments: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Enforce access control if userId is provided
    if (userId) {
      const hasAccess = await documentAssignmentService.canAccessDocument(documentId, user || userId);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this document');
      }
    }

    if (document.isConfidential) {
      if (user) {
        const ok = await confidentialAccessService.canUserViewDocument(document, user)
        if (!ok) throw new ForbiddenError('You do not have access to this confidential document')
      } else if (userId) {
        if (document.ownerId !== userId && document.createdById !== userId) {
          const count = await prisma.documentConfidentialAccess.count({
            where: { documentId: document.id, userId, canView: true }
          })
          if (count === 0) throw new ForbiddenError('You do not have access to this confidential document')
        }
      } else {
        throw new ForbiddenError('You do not have access to this confidential document')
      }
    }

    return document;
  }

  /**
   * Get document by file code
   */
  async getDocumentByFileCode(fileCode, projectCategoryId = null) {
    const fc = String(fileCode || '').trim()
    if (!fc) throw new BadRequestError('File code is required')

    const pcId = projectCategoryId ? parseInt(projectCategoryId, 10) : null
    const where = pcId ? { fileCode: fc, projectCategoryId: pcId } : { fileCode: fc }

    const documents = await prisma.document.findMany({
      where,
      include: {
        documentType: true,
        versions: {
          orderBy: { uploadedAt: 'desc' }
        }
      },
      take: 2
    })

    if (!documents || documents.length === 0) {
      throw new NotFoundError('Document')
    }

    if (!pcId && documents.length > 1) {
      const err = new BadRequestError('Multiple documents share this file code. Please specify projectCategoryId.')
      err.code = 'FILE_CODE_AMBIGUOUS'
      throw err
    }

    return documents[0]
  }

  /**
   * List documents with filters and pagination
   * Enforces assignment-based access control
   */
  async listDocuments(filters = {}, pagination = {}, userOrUserId = null) {
    const user = typeof userOrUserId === 'object' && userOrUserId ? userOrUserId : null
    const userId = user ? user.id : userOrUserId

    const {
      status,
      statusIn,
      stage,
      documentTypeId,
      createdById,
      ownerId,
      folderId,
      folderIds,
      search,
      startDate,
      endDate
    } = filters;

    const {
      page = 1,
      limit = 15,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = pagination;

    const skip = (page - 1) * limit;

    const where = {}

    if (userId && user) {
      const roleIds = await folderPermissionService.getRoleIdsByNames(user.roles || [])
      where.AND = [...(where.AND || []), confidentialAccessService.buildConfidentialWhereClause(user, roleIds)]
    } else if (userId) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { isConfidential: false },
            {
              AND: [
                { isConfidential: true },
                {
                  OR: [
                    { ownerId: userId },
                    { createdById: userId },
                    { confidentialAccess: { some: { userId, canView: true } } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    } else {
      where.AND = [...(where.AND || []), { isConfidential: false }]
    }

    // Enforce assignment-based access control
    if (userId) {
      const roleIds = user ? await folderPermissionService.getRoleIdsByNames(user.roles || []) : []
      const accessClause = documentAssignmentService.buildAccessWhereClause(userId, roleIds);
      if (accessClause?.AND) {
        where.AND = [...(where.AND || []), ...accessClause.AND]
      } else {
        Object.assign(where, accessClause)
      }
    }

    if (status) where.status = status;
    if (statusIn) where.status = { in: statusIn };
    if (stage) where.stage = stage;
    if (documentTypeId) where.documentTypeId = documentTypeId;
    if (createdById) where.createdById = createdById;
    if (ownerId) where.ownerId = ownerId;
    if (Array.isArray(folderIds) && folderIds.length > 0) {
      where.folderId = { in: folderIds };
    } else if (folderId !== undefined) {
      where.folderId = folderId;
    }

    if (search) {
      where.OR = [
        { fileCode: { contains: search } },
        { title: { contains: search } },
        { description: { contains: search } },
        {
          versions: {
            some: {
              fileName: { contains: search }
            }
          }
        }
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get total count
    const total = await prisma.document.count({ where });

    // Get documents
    const documents = await prisma.document.findMany({
      where,
      include: {
        documentType: true,
        projectCategory: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        reviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        firstApprover: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        secondApprover: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        approvalHistory: {
          where: {
            action: {
              in: ['REVIEWED', 'FIRST_APPROVED', 'SECOND_APPROVED', 'PUBLISHED', 'ACKNOWLEDGED']
            }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        versions: {
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        },
        expiryProfile: {
          select: {
            trackingEnabled: true,
            startDate: true,
            expiryDate: true,
            expiryStatus: true,
            renewalStatus: true,
            remarks: true,
            expiringSoonDays: true,
            reminder1Days: true,
            reminder2Days: true,
            reminder3Days: true,
            reminder4Days: true
          }
        }
      },
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder }
    });

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get user's draft documents
   * Includes documents with status='DRAFT', 'ACKNOWLEDGED' (displayed as "Drafting")
   * and status='RETURNED' (returned for amendments)
   */
  async getUserDrafts(userId, pagination = {}) {
    const { page = 1, limit = 15, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * limit;

    // Get documents in DRAFT stage with various statuses
    const where = {
      ownerId: userId,
      stage: 'DRAFT',
      status: {
        in: ['DRAFT', 'ACKNOWLEDGED', 'RETURNED']
      }
    };

    const total = await prisma.document.count({ where });

    const documents = await prisma.document.findMany({
      where,
      include: {
        documentType: true,
        projectCategory: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        approvalHistory: {
          where: {
            action: 'RETURNED'
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        versions: {
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        }
      },
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder }
    });

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update document
   */
  async updateDocument(documentId, updateData, userId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if user is owner or has permission
    if (document.ownerId !== userId && document.createdById !== userId) {
      throw new ForbiddenError('You do not have permission to update this document');
    }

    // Only allow updates if document is in DRAFT stage (includes ACKNOWLEDGED and RETURNED statuses)
    if (document.stage !== 'DRAFT') {
      throw new BadRequestError('Can only update documents in DRAFT stage');
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: updateData,
      include: {
        documentType: true,
        owner: true
      }
    });

    return updated;
  }

  async bulkMoveDocuments(documentIds, destinationFolderId) {
    const normalizedIds = Array.isArray(documentIds)
      ? Array.from(new Set(documentIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id))))
      : []

    if (normalizedIds.length === 0) {
      throw new BadRequestError('At least one document is required')
    }

    const documents = await prisma.document.findMany({
      where: { id: { in: normalizedIds } },
      select: { id: true, folderId: true, title: true, fileCode: true, status: true }
    })

    if (documents.length !== normalizedIds.length) {
      throw new NotFoundError('One or more documents were not found')
    }

    await prisma.document.updateMany({
      where: { id: { in: normalizedIds } },
      data: { folderId: destinationFolderId }
    })

    return {
      movedIds: normalizedIds,
      documents
    }
  }

  /**
   * Delete document (soft delete by moving to archived)
   * @param {number} documentId - Document ID to delete
   * @param {number} userId - User ID requesting deletion
   * @param {boolean} isAdmin - Whether user is an admin
   */
  async deleteDocument(documentId, userId, isAdmin = false) {
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Admins can delete any document
    if (!isAdmin) {
      // Non-admins: check if user is owner or creator
      if (document.ownerId !== userId && document.createdById !== userId) {
        throw new ForbiddenError('You do not have permission to delete this document');
      }

      // Non-admins: only allow deletion if document is in DRAFT stage or draft-related statuses
      const draftStatuses = ['DRAFT', 'Draft', 'Drafting', 'Draft Saved', 'ACKNOWLEDGED', 'Return for Amendments'];
      if (document.stage !== 'DRAFT' && !draftStatuses.includes(document.status)) {
        throw new BadRequestError('Can only delete documents in DRAFT status');
      }
    }

    // Update status to ARCHIVED instead of hard delete
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'ARCHIVED'
      }
    });

    return true;
  }

  async purgeDocument(documentId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, fileCode: true, projectCategoryId: true }
    })

    if (!document) {
      throw new NotFoundError('Document not found')
    }

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
      select: { filePath: true }
    })

    const filePaths = (versions || []).map(v => v.filePath).filter(Boolean)

    const deletedRegisters = await prisma.$transaction(async (tx) => {
      const archive = await tx.archiveRegister.deleteMany({ where: { fileCode: document.fileCode } })
      const obsolete = await tx.obsoleteRegister.deleteMany({ where: { fileCode: document.fileCode } })
      const version = await tx.versionRegister.deleteMany({ where: { fileCode: document.fileCode } })
      const docReg = await tx.documentRegister.deleteMany({
        where: { fileCode: document.fileCode, projectCategoryId: document.projectCategoryId ?? null }
      })
      const codeReg = document.projectCategoryId
        ? await tx.codeRegistry.deleteMany({
          where: { fileCode: document.fileCode, projectCategoryId: document.projectCategoryId }
        })
        : { count: 0 }

      const assignments = await tx.documentAssignment.deleteMany({ where: { documentId: document.id } })
      const comments = await tx.documentComment.deleteMany({ where: { documentId: document.id } })
      const metadata = await tx.documentMetadata.deleteMany({ where: { documentId: document.id } })
      const history = await tx.approvalHistory.deleteMany({ where: { documentId: document.id } })
      const docVersions = await tx.documentVersion.deleteMany({ where: { documentId: document.id } })
      const supersedeReq = await tx.supersedeObsoleteRequest.deleteMany({ where: { documentId: document.id } })
      const versionReq = await tx.versionRequest.deleteMany({ where: { documentId: document.id } })
      const audit = await tx.auditLog.deleteMany({ where: { entityId: document.id } })

      await tx.document.delete({ where: { id: document.id } })

      return {
        archive: archive.count,
        obsolete: obsolete.count,
        version: version.count,
        documentRegister: docReg.count,
        codeRegistry: codeReg.count,
        documentAssignment: assignments.count,
        documentComment: comments.count,
        documentMetadata: metadata.count,
        approvalHistory: history.count,
        documentVersion: docVersions.count,
        supersedeObsoleteRequest: supersedeReq.count,
        versionRequest: versionReq.count,
        auditLog: audit.count,
        document: 1
      }
    })

    let deletedFiles = 0
    for (const fp of filePaths) {
      const ok = await fileStorageService.deleteFile(fp)
      if (ok) deletedFiles += 1
    }

    return {
      deletedRegisters,
      deletedFiles,
      deletedDirectory: false
    }
  }

  async purgeByFileCode(fileCode) {
    const normalized = String(fileCode || '').trim()
    if (!normalized) {
      throw new BadRequestError('File code is required')
    }

    const docs = await prisma.document.findMany({
      where: { fileCode: normalized },
      select: {
        id: true,
        fileCode: true,
        projectCategoryId: true,
        versions: { select: { filePath: true } }
      }
    })

    const documentIds = docs.map(d => d.id)
    const filePaths = docs.flatMap(d => (d.versions || []).map(v => v.filePath).filter(Boolean))

    const deletedRegisters = await prisma.$transaction(async (tx) => {
      const archive = await tx.archiveRegister.deleteMany({ where: { fileCode: normalized } })
      const obsolete = await tx.obsoleteRegister.deleteMany({ where: { fileCode: normalized } })
      const version = await tx.versionRegister.deleteMany({ where: { fileCode: normalized } })
      const docReg = await tx.documentRegister.deleteMany({ where: { fileCode: normalized } })
      const codeReg = await tx.codeRegistry.deleteMany({ where: { fileCode: normalized } })

      const assignments = documentIds.length
        ? await tx.documentAssignment.deleteMany({ where: { documentId: { in: documentIds } } })
        : { count: 0 }
      const comments = documentIds.length
        ? await tx.documentComment.deleteMany({ where: { documentId: { in: documentIds } } })
        : { count: 0 }
      const metadata = documentIds.length
        ? await tx.documentMetadata.deleteMany({ where: { documentId: { in: documentIds } } })
        : { count: 0 }
      const history = documentIds.length
        ? await tx.approvalHistory.deleteMany({ where: { documentId: { in: documentIds } } })
        : { count: 0 }
      const docVersions = documentIds.length
        ? await tx.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } })
        : { count: 0 }
      const supersedeReq = documentIds.length
        ? await tx.supersedeObsoleteRequest.deleteMany({ where: { documentId: { in: documentIds } } })
        : { count: 0 }
      const versionReq = documentIds.length
        ? await tx.versionRequest.deleteMany({ where: { documentId: { in: documentIds } } })
        : { count: 0 }
      const audit = documentIds.length
        ? await tx.auditLog.deleteMany({ where: { entityId: { in: documentIds } } })
        : { count: 0 }
      const docsDeleted = documentIds.length
        ? await tx.document.deleteMany({ where: { id: { in: documentIds } } })
        : { count: 0 }

      return {
        archive: archive.count,
        obsolete: obsolete.count,
        version: version.count,
        documentRegister: docReg.count,
        codeRegistry: codeReg.count,
        documentAssignment: assignments.count,
        documentComment: comments.count,
        documentMetadata: metadata.count,
        approvalHistory: history.count,
        documentVersion: docVersions.count,
        supersedeObsoleteRequest: supersedeReq.count,
        versionRequest: versionReq.count,
        auditLog: audit.count,
        document: docsDeleted.count
      }
    })

    let deletedFiles = 0
    for (const fp of filePaths) {
      const ok = await fileStorageService.deleteFile(fp)
      if (ok) deletedFiles += 1
    }

    const deletedDirectory = await fileStorageService.deleteDocumentDirectory(normalized)

    return {
      deletedRegisters,
      deletedFiles,
      deletedDirectory
    }
  }

  /**
   * Get document version history
   */
  async getDocumentVersions(documentId) {
    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }]
    });

    return versions;
  }

  /**
   * Add comment to document
   */
  async addComment(documentId, userId, comment, commentType = 'GENERAL') {
    const newComment = await prisma.documentComment.create({
      data: {
        documentId,
        userId,
        comment,
        commentType
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return newComment;
  }

  /**
   * Get document comments
   */
  async getDocumentComments(documentId) {
    const comments = await prisma.documentComment.findMany({
      where: { documentId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return comments;
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(filters = {}) {
    const { ownerId, documentTypeId } = filters;
    const where = {};
    
    if (ownerId) where.ownerId = ownerId;
    if (documentTypeId) where.documentTypeId = documentTypeId;

    const [
      totalDocuments,
      draftCount,
      publishedCount,
      inReviewCount,
      inApprovalCount
    ] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.count({ where: { ...where, status: 'DRAFT' } }),
      prisma.document.count({ where: { ...where, status: 'PUBLISHED' } }),
      prisma.document.count({ where: { ...where, stage: 'REVIEW' } }),
      prisma.document.count({ where: { ...where, stage: 'APPROVAL' } })
    ]);

    return {
      totalDocuments,
      draftCount,
      publishedCount,
      inReviewCount,
      inApprovalCount
    };
  }

  /**
   * Get document type by name
   */
  async getDocumentTypeByName(name) {
    // MySQL doesn't support mode: 'insensitive', but is case-insensitive by default
    // Try exact match first
    let docType = await prisma.documentType.findFirst({
      where: { name: name }
    });

    // If not found, try partial match
    if (!docType) {
      docType = await prisma.documentType.findFirst({
        where: { name: { contains: name } }
      });
    }

    return docType;
  }

  /**
   * Get project category by name
   */
  async getProjectCategoryByName(name) {
    // MySQL doesn't support mode: 'insensitive', but is case-insensitive by default
    // Try exact match first
    let category = await prisma.projectCategory.findFirst({
      where: { name: name }
    });

    // If not found, try partial match
    if (!category) {
      category = await prisma.projectCategory.findFirst({
        where: { name: { contains: name } }
      });
    }

    return category;
  }

  /**
   * Create document request (NDR)
   * Documents are created in PENDING_ACKNOWLEDGMENT status without file code
   */
  async createDocumentRequest(data, creatorId) {
    const { title, description, documentTypeId, projectCategoryId, dateOfDocument } = data;

    // Check for pending request with same title and document type
    const existingRequest = await prisma.document.findFirst({
      where: {
        title,
        documentTypeId,
        status: 'PENDING_ACKNOWLEDGMENT',
        createdById: creatorId
      }
    });

    if (existingRequest) {
      throw new BadRequestError(
        'You already have a pending document request with this title. Please wait for acknowledgment or use a different title.'
      );
    }

    // Generate temporary file code (will be replaced on acknowledgment)
    // Add more entropy to avoid collisions
    const tempFileCode = `PENDING-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${creatorId}`;

    // Create document request
    const document = await prisma.document.create({
      data: {
        fileCode: tempFileCode,
        title,
        description,
        documentTypeId,
        projectCategoryId: projectCategoryId || null,
        folderId: null,
        createdById: creatorId,
        ownerId: creatorId,
        status: 'PENDING_ACKNOWLEDGMENT',
        stage: 'ACKNOWLEDGMENT',
        version: '1.0',
        dateOfDocument: dateOfDocument ? new Date(dateOfDocument) : null
      },
      include: {
        documentType: true,
        projectCategory: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Create document directory
    await fileStorageService.createDocumentDirectory(tempFileCode, projectCategoryId || null);
    try {
      const notificationService = require('./notificationService')
      await notificationService.notifyAcknowledgmentRequired(document.id, document)
    } catch (error) {
      console.error('Failed to send acknowledgment required notification:', error)
    }

    return document;
  }

  /**
   * Reject document request
   * This should only be called by Document Controller
   */
  async rejectDocumentRequest(documentId, rejectedById, reason) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, createdBy: true }
    });

    if (!document) {
      throw new NotFoundError('Document request');
    }

    if (document.status !== 'PENDING_ACKNOWLEDGMENT') {
      throw new BadRequestError('Only pending document requests can be rejected');
    }

    // Update document status to REJECTED
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'REJECTED',
        stage: 'DRAFT',
        obsoleteReason: reason,
        obsoleteDate: new Date()
      },
      include: {
        documentType: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Add rejection comment
    if (reason) {
      await this.addComment(documentId, rejectedById, `Request rejected: ${reason}`, 'REJECTION');
    }

    // Send notification to document creator about rejection
    try {
      const notificationService = require('./notificationService');
      await notificationService.notifyOwnerDocumentRejected(documentId, updated, rejectedById, reason);
      console.log(`[DocumentService] NDR rejection notification sent to owner ${updated.ownerId}`);
    } catch (error) {
      console.error('Failed to send NDR rejection notification:', error);
    }

    return updated;
  }

  async deleteRejectedDocumentRequest(documentId, userId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        fileCode: true,
        status: true,
        createdById: true,
        ownerId: true
      }
    });

    if (!document) {
      throw new NotFoundError('Document request');
    }

    if (document.status !== 'REJECTED') {
      throw new BadRequestError('Only rejected document requests can be deleted');
    }

    if (document.createdById !== userId && document.ownerId !== userId) {
      throw new ForbiddenError('Only the requester can delete this rejected request');
    }

    await prisma.$transaction(async (tx) => {
      await tx.documentAssignment.deleteMany({ where: { documentId } });
      await tx.documentComment.deleteMany({ where: { documentId } });
      await tx.documentMetadata.deleteMany({ where: { documentId } });
      await tx.approvalHistory.deleteMany({ where: { documentId } });
      await tx.documentVersion.deleteMany({ where: { documentId } });
      await tx.auditLog.deleteMany({ where: { entityId: documentId } });
      await tx.document.delete({ where: { id: documentId } });
    });

    let deletedDirectory = false;
    if (document.fileCode) {
      deletedDirectory = await fileStorageService.deleteDocumentDirectory(document.fileCode);
    }

    return { deleted: true, deletedDirectory };
  }

  /**
   * Acknowledge document request and assign proper file code
   * This should only be called by Document Controller
   * Users cannot acknowledge their own requests (separation of duties)
   */
  async acknowledgeDocumentRequest(documentId, acknowledgerId, remarks) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true }
    });

    if (!document) {
      throw new NotFoundError('Document request');
    }

    if (document.status !== 'PENDING_ACKNOWLEDGMENT') {
      throw new BadRequestError('Document request has already been acknowledged or is not pending');
    }

    // Prevent self-acknowledgment - user cannot acknowledge their own request
    if (document.createdById === acknowledgerId || document.ownerId === acknowledgerId) {
      throw new ForbiddenError('You cannot acknowledge your own document request. Another acknowledger must process this request.');
    }

    // Generate proper file code using the stored dateOfDocument and projectCategoryId
    const fileCode = await this.generateFileCode(document.documentTypeId, document.projectCategoryId, '01', document.dateOfDocument);

    // Update document with file code and acknowledged status
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        fileCode,
        status: 'ACKNOWLEDGED',
        stage: 'DRAFT',  // Move to DRAFT stage after acknowledgment
        acknowledgedById: acknowledgerId,
        acknowledgedAt: new Date()
      },
      include: {
        documentType: true,
        projectCategory: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        owner: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Rename document directory from temp to proper file code
    try {
      await fileStorageService.renameDocumentDirectory(document.fileCode, fileCode, document.projectCategoryId || null);
    } catch (error) {
      console.error('Failed to rename document directory:', error);
    }

    // Update document register
    await prisma.documentRegister.upsert({
      where: { fileCode_projectCategoryId: { fileCode, projectCategoryId: updated.projectCategoryId } },
      update: {
        documentTitle: document.title,
        documentType: document.documentType.name,
        version: '1.0',
        owner: `${updated.owner.firstName} ${updated.owner.lastName}`,
        department: updated.owner.department || '',
        status: 'ACKNOWLEDGED'
      },
      create: {
        fileCode,
        projectCategoryId: updated.projectCategoryId,
        documentTitle: document.title,
        documentType: document.documentType.name,
        version: '1.0',
        owner: `${updated.owner.firstName} ${updated.owner.lastName}`,
        department: updated.owner.department || '',
        status: 'ACKNOWLEDGED'
      }
    });

    try {
      const settings = await DocumentNumbering.loadSettings()
      const parsed = this.parseAndNormalizeFileCodeStrict(fileCode, settings)
      await this.registerFileCodeLedger({
        fileCode,
        projectCategoryId: updated.projectCategoryId,
        documentTypeId: updated.documentTypeId,
        runningNumber: parsed.runningNumber,
        source: 'NDR_ACKNOWLEDGE',
        sourceRefId: updated.id
      })
    } catch (_) {
      // keep acknowledgment flow backward compatible
    }

    // Add acknowledgment comment if remarks provided
    if (remarks) {
      await this.addComment(documentId, acknowledgerId, remarks, 'GENERAL');
    }

    // Send notification to document owner (the user who created the request)
    try {
      const notificationService = require('./notificationService');
      await notificationService.notifyNDRAcknowledged(documentId, updated, acknowledgerId);
      console.log(`[DocumentService] NDR acknowledgment notification sent to owner ${updated.ownerId}`);
    } catch (error) {
      console.error('Failed to send NDR acknowledgment notification:', error);
    }

    return updated;
  }

  /**
   * Submit draft document for review
   * Requires file to be uploaded and reviewers to be assigned
   */
  async submitDraftForReview(documentId, reviewerIds, userId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: {
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        }
      }
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Check if user is owner
    if (document.ownerId !== userId) {
      throw new ForbiddenError('Only document owner can submit for review');
    }

    // Check if document is in DRAFT stage (accepts both new drafts and returned documents)
    if (document.stage !== 'DRAFT') {
      throw new BadRequestError('Document must be in draft stage to submit for review');
    }
    
    // Accept documents with DRAFT, DRAFTING, ACKNOWLEDGED (new drafts) or RETURNED (resubmission) status
    if (!['DRAFT', 'DRAFTING', 'ACKNOWLEDGED', 'RETURNED'].includes(document.status)) {
      throw new BadRequestError('Can only submit documents with DRAFT, DRAFTING, ACKNOWLEDGED or RETURNED status');
    }

    // Check if file is uploaded
    if (!document.versions || document.versions.length === 0) {
      throw new BadRequestError('Please upload document file before submitting for review');
    }

    // Check if reviewers are assigned
    if (!reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
      throw new BadRequestError('Please assign at least one reviewer');
    }

    // Ensure all reviewer IDs are integers
    const parsedReviewerIds = reviewerIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    if (parsedReviewerIds.length === 0) {
      throw new BadRequestError('Invalid reviewer IDs provided');
    }

    // Update document status to PENDING_REVIEW
    // Set the first reviewer as the assigned reviewer (for single reviewer workflow)
    const updated = await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'PENDING_REVIEW',
        stage: 'REVIEW',
        submittedAt: new Date(),
        reviewerId: parsedReviewerIds[0] // Assign the first/primary reviewer
      },
      include: {
        documentType: true,
        owner: true,
        versions: {
          orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
          take: 1
        }
      }
    });

    // Create approval history records for reviewers
    const approvalRecords = parsedReviewerIds.map(reviewerId => ({
      documentId,
      userId: reviewerId,
      action: 'SUBMITTED',
      stage: 'REVIEW'
    }));

    await prisma.approvalHistory.createMany({
      data: approvalRecords
    });

    // Create document assignments for reviewers (for access control)
    const documentAssignmentService = require('./documentAssignmentService');
    for (const reviewerId of parsedReviewerIds) {
      await documentAssignmentService.assignDocument(
        documentId,
        reviewerId,
        'REVIEW',
        userId // assigned by owner
      );
    }
    console.log(`[DocumentService] Created assignments for ${parsedReviewerIds.length} reviewers`);

    // Update document register
    await prisma.documentRegister.updateMany({
      where: { fileCode: document.fileCode },
      data: {
        status: 'PENDING_REVIEW'
      }
    });
    try {
      const notificationService = require('./notificationService')
      const title = 'Document Assigned for Review'
      const message = `Document "${updated.title}" (${updated.fileCode}) has been assigned to you for review`
      const link = `/documents/${documentId}`
      const emailData = {
        title: updated.title,
        fileCode: updated.fileCode,
        assignedBy: updated.owner ? `${updated.owner.firstName} ${updated.owner.lastName}` : 'Unknown',
        link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}${link}`
      }
      await notificationService.sendBulkNotifications(parsedReviewerIds, 'reviewAssigned', title, message, link, emailData)
    } catch (error) {
      console.error('Failed to send reviewer assignment notifications:', error)
    }

    return updated;
  }
}

module.exports = new DocumentService();
