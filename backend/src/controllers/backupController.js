const prisma = require('../config/database')
const fs = require('fs').promises
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)
const auditLogService = require('../services/auditLogService')
const asyncHandler = require('../utils/asyncHandler')
const ResponseFormatter = require('../utils/responseFormatter')

// Directory for storing backups
const BACKUP_DIR = path.join(__dirname, '../../backups')

// Ensure backup directory exists
async function ensureBackupDir() {
  try {
    await fs.access(BACKUP_DIR)
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true })
  }
}

// Get database connection details from environment
function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL
  
  // Parse MySQL connection string
  // Format: mysql://user:password@host:port/database
  const match = databaseUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
  
  if (!match) {
    throw new Error('Invalid DATABASE_URL format')
  }
  
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: match[4],
    database: match[5]
  }
}

// Create a new backup
exports.createBackup = asyncHandler(async (req, res) => {
  try {
    const { name, description } = req.body
    const userId = req.user.id

    if (!name) {
      return ResponseFormatter.validationError(res, [
        { field: 'name', message: 'Backup name is required' }
      ])
    }

    await ensureBackupDir()

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `backup_${timestamp}.sql`
    const filePath = path.join(BACKUP_DIR, fileName)

    const dbConfig = getDatabaseConfig()

    const isWindows = process.platform === 'win32'
    const escapedFilePath = isWindows ? filePath : filePath.replace(/"/g, '\\"')

    const command = `mysqldump -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} --result-file="${escapedFilePath}"`

    await execAsync(command, {
      timeout: 120000,
      windowsHide: true,
      shell: isWindows ? 'cmd.exe' : '/bin/sh'
    })

    const stats = await fs.stat(filePath)

    const backup = await prisma.backup.create({
      data: {
        name,
        description: description || '',
        fileName,
        filePath,
        size: stats.size,
        status: 'completed',
        createdById: userId
      }
    })

    const backupResponse = {
      ...backup,
      size: backup.size.toString()
    }

    try {
      await auditLogService.log({
        userId,
        action: 'backup.created',
        entity: 'Backup',
        entityId: backup.id,
        description: `Created backup: ${name}`,
        metadata: { fileName, size: stats.size },
        ipAddress: auditLogService.getClientIP ? auditLogService.getClientIP(req) : null,
        userAgent: req.get('user-agent')
      })
    } catch (_auditErr) { /* non-blocking */ }

    return ResponseFormatter.success(res, { backup: backupResponse }, 'Backup created successfully')
  } catch (error) {
    console.error('Backup creation error:', error)
    return ResponseFormatter.error(res, `Failed to create backup: ${error.message || 'unknown error'}`, 500)
  }
})

// List all backups
exports.listBackups = asyncHandler(async (req, res) => {
  try {
    const backups = await prisma.backup.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    })

    const backupsResponse = backups.map(b => ({
      ...b,
      size: b.size.toString()
    }))

    return ResponseFormatter.success(res, { backups: backupsResponse })
  } catch (error) {
    console.error('List backups error:', error)
    return ResponseFormatter.error(res, `Failed to list backups: ${error.message || 'unknown error'}`, 500)
  }
})

// Download a backup
exports.downloadBackup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params

    const backup = await prisma.backup.findUnique({
      where: { id: parseInt(id) }
    })

    if (!backup) {
      return ResponseFormatter.notFound(res, 'Backup')
    }

    try {
      await fs.access(backup.filePath)
    } catch {
      return ResponseFormatter.notFound(res, 'Backup file on disk')
    }

    return res.download(backup.filePath, backup.fileName)
  } catch (error) {
    console.error('Download backup error:', error)
    return ResponseFormatter.error(res, `Failed to download backup: ${error.message || 'unknown error'}`, 500)
  }
})

// Restore from a backup
exports.restoreBackup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const backup = await prisma.backup.findUnique({
      where: { id: parseInt(id) }
    })

    if (!backup) {
      return ResponseFormatter.notFound(res, 'Backup')
    }

    try {
      await fs.access(backup.filePath)
    } catch {
      return ResponseFormatter.notFound(res, 'Backup file on disk')
    }

    const dbConfig = getDatabaseConfig()
    const isWindows = process.platform === 'win32'

    let command
    if (isWindows) {
      const normalizedPath = backup.filePath.replace(/\\/g, '/')
      command = `mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} -e "source ${normalizedPath}"`
    } else {
      command = `mysql -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} < "${backup.filePath}"`
    }

    await execAsync(command, {
      timeout: 300000,
      windowsHide: true,
      shell: isWindows ? 'cmd.exe' : '/bin/sh'
    })

    try {
      await auditLogService.log({
        userId,
        action: 'backup.restored',
        entity: 'Backup',
        entityId: backup.id,
        description: `Restored backup: ${backup.name}`,
        metadata: { fileName: backup.fileName },
        ipAddress: auditLogService.getClientIP ? auditLogService.getClientIP(req) : null,
        userAgent: req.get('user-agent')
      })
    } catch (_auditErr) { /* non-blocking */ }

    return ResponseFormatter.success(res, null, 'Backup restored successfully')
  } catch (error) {
    console.error('Restore backup error:', error)
    return ResponseFormatter.error(res, `Failed to restore backup: ${error.message || 'unknown error'}`, 500)
  }
})

// Delete a backup
exports.deleteBackup = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params

    const backup = await prisma.backup.findUnique({
      where: { id: parseInt(id) }
    })

    if (!backup) {
      return ResponseFormatter.notFound(res, 'Backup')
    }

    try {
      await fs.unlink(backup.filePath)
    } catch (error) {
      console.error('Failed to delete backup file:', error)
    }

    await prisma.backup.delete({
      where: { id: parseInt(id) }
    })

    try {
      await auditLogService.log({
        userId: req.user.id,
        action: 'backup.deleted',
        entity: 'Backup',
        entityId: parseInt(id),
        description: `Deleted backup: ${backup.name}`,
        metadata: { fileName: backup.fileName },
        ipAddress: auditLogService.getClientIP ? auditLogService.getClientIP(req) : null,
        userAgent: req.get('user-agent')
      })
    } catch (_auditErr) { /* non-blocking */ }

    return ResponseFormatter.success(res, null, 'Backup deleted successfully')
  } catch (error) {
    console.error('Delete backup error:', error)
    return ResponseFormatter.error(res, `Failed to delete backup: ${error.message || 'unknown error'}`, 500)
  }
})
