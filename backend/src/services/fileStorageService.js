const fs = require('fs').promises;
const path = require('path');
const config = require('../config/app');
const { BadRequestError } = require('../utils/errors');

class FileStorageService {
  /**
   * Initialize storage directories
   */
  async initializeStorage() {
    const directories = [
      config.uploadDir,
      path.join(config.uploadDir, 'documents'),
      path.join(config.uploadDir, 'profiles'),
      path.join(config.uploadDir, 'templates'),
      path.join(config.uploadDir, 'temp')
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Get document storage path by year/month/fileCode
   * @param {string} fileCode - Document file code (e.g., "DOC-2025-001")
   */
  getDocumentPath(fileCode, projectCategoryId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const catSegment = projectCategoryId ? `pc_${projectCategoryId}` : null
    const relativePath = catSegment
      ? path.join('documents', String(year), month, catSegment, fileCode)
      : path.join('documents', String(year), month, fileCode);
    return {
      relativePath,
      absolutePath: path.join(config.uploadDir, relativePath)
    };
  }

  /**
   * Create directory for document storage
   * @param {string} fileCode - Document file code
   */
  async createDocumentDirectory(fileCode, projectCategoryId) {
    const { absolutePath } = this.getDocumentPath(fileCode, projectCategoryId);
    await fs.mkdir(absolutePath, { recursive: true });
    return absolutePath;
  }

  /**
   * Rename document directory (used when assigning file code)
   * @param {string} oldFileCode - Old file code (temporary)
   * @param {string} newFileCode - New file code (permanent)
   */
  async renameDocumentDirectory(oldFileCode, newFileCode, projectCategoryId) {
    const { absolutePath: oldPath } = this.getDocumentPath(oldFileCode, projectCategoryId);
    const { absolutePath: newPath } = this.getDocumentPath(newFileCode, projectCategoryId);
    
    // Check if old directory exists
    const oldExists = await this.fileExists(oldPath);
    if (!oldExists) {
      console.warn(`Old directory not found: ${oldPath}`);
      return;
    }
    
    // Create parent directory for new path
    const newParentDir = path.dirname(newPath);
    await fs.mkdir(newParentDir, { recursive: true });
    
    // Rename directory
    await fs.rename(oldPath, newPath);
    return newPath;
  }

  async findDocumentDirectories(fileCode, projectCategoryId) {
    const baseDir = path.join(config.uploadDir, 'documents')
    let years = []
    try {
      years = await fs.readdir(baseDir, { withFileTypes: true })
    } catch {
      years = []
    }

    const matches = new Set()
    const pcSegment = projectCategoryId ? `pc_${projectCategoryId}` : null

    for (const yearEnt of years) {
      if (!yearEnt.isDirectory()) continue
      const yearPath = path.join(baseDir, yearEnt.name)
      let months = []
      try {
        months = await fs.readdir(yearPath, { withFileTypes: true })
      } catch {
        months = []
      }

      for (const monthEnt of months) {
        if (!monthEnt.isDirectory()) continue
        const monthPath = path.join(yearPath, monthEnt.name)

        const directCandidate = path.join(monthPath, fileCode)
        if (await this.fileExists(directCandidate)) {
          matches.add(directCandidate)
        }

        if (pcSegment) {
          const pcCandidate = path.join(monthPath, pcSegment, fileCode)
          if (await this.fileExists(pcCandidate)) {
            matches.add(pcCandidate)
          }
        } else {
          let entries = []
          try {
            entries = await fs.readdir(monthPath, { withFileTypes: true })
          } catch {
            entries = []
          }
          for (const ent of entries) {
            if (!ent.isDirectory()) continue
            if (!String(ent.name).startsWith('pc_')) continue
            const pcCandidate = path.join(monthPath, ent.name, fileCode)
            if (await this.fileExists(pcCandidate)) {
              matches.add(pcCandidate)
            }
          }
        }
      }
    }

    return Array.from(matches)
  }

  async renameDocumentDirectories(oldFileCode, newFileCode, projectCategoryId) {
    const directories = await this.findDocumentDirectories(oldFileCode, projectCategoryId)
    const moved = []

    for (const oldPath of directories) {
      const newPath = path.join(path.dirname(oldPath), newFileCode)
      const oldExists = await this.fileExists(oldPath)
      if (!oldExists) continue

      const newExists = await this.fileExists(newPath)
      if (newExists) {
        throw new BadRequestError('Destination directory already exists')
      }

      const newParentDir = path.dirname(newPath)
      await fs.mkdir(newParentDir, { recursive: true })
      await fs.rename(oldPath, newPath)
      moved.push({ oldPath, newPath })
    }

    return moved
  }

  async deleteDocumentDirectory(fileCode) {
    const baseDir = path.join(config.uploadDir, 'documents');
    let years = [];
    try {
      years = await fs.readdir(baseDir, { withFileTypes: true });
    } catch {
      return false;
    }

    let deleted = false;
    for (const yearEnt of years) {
      if (!yearEnt.isDirectory()) continue;
      const yearPath = path.join(baseDir, yearEnt.name);
      let months = [];
      try {
        months = await fs.readdir(yearPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const monthEnt of months) {
        if (!monthEnt.isDirectory()) continue;
        const monthPath = path.join(yearPath, monthEnt.name)
        const directCandidate = path.join(monthPath, fileCode);
        if (await this.fileExists(directCandidate)) {
          const ok = await this.deleteDirectory(directCandidate);
          if (ok) deleted = true;
        }

        let entries = []
        try {
          entries = await fs.readdir(monthPath, { withFileTypes: true })
        } catch {
          entries = []
        }
        for (const ent of entries) {
          if (!ent.isDirectory()) continue
          if (!String(ent.name).startsWith('pc_')) continue
          const catCandidate = path.join(monthPath, ent.name, fileCode)
          if (await this.fileExists(catCandidate)) {
            const ok = await this.deleteDirectory(catCandidate)
            if (ok) deleted = true
          }
        }
      }
    }

    return deleted;
  }

  /**
   * Save uploaded file
   * @param {Object} file - Multer file object
   * @param {string} destinationPath - Destination directory path
   * @param {string} fileName - New file name
   */
  async saveFile(file, destinationPath, fileName) {
    await fs.mkdir(destinationPath, { recursive: true });
    
    const filePath = path.join(destinationPath, fileName);
    await fs.rename(file.path, filePath);
    
    return filePath;
  }

  /**
   * Delete file
   * @param {string} filePath - Absolute file path
   */
  async deleteFile(filePath) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Delete directory and all its contents
   * @param {string} dirPath - Directory path
   */
  async deleteDirectory(dirPath) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.error('Error deleting directory:', error);
      return false;
    }
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file stats
   * @param {string} filePath - File path
   */
  async getFileStats(filePath) {
    try {
      return await fs.stat(filePath);
    } catch (error) {
      throw new BadRequestError('File not found');
    }
  }

  /**
   * Copy file to new location
   * @param {string} sourcePath - Source file path
   * @param {string} destinationPath - Destination file path
   */
  async copyFile(sourcePath, destinationPath) {
    const destDir = path.dirname(destinationPath);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
  }

  /**
   * Move file to new location
   * @param {string} sourcePath - Source file path
   * @param {string} destinationPath - Destination file path
   */
  async moveFile(sourcePath, destinationPath) {
    const destDir = path.dirname(destinationPath);
    await fs.mkdir(destDir, { recursive: true });
    await fs.rename(sourcePath, destinationPath);
  }

  /**
   * Get file size in bytes
   * @param {string} filePath - File path
   */
  async getFileSize(filePath) {
    const stats = await this.getFileStats(filePath);
    return stats.size;
  }

  /**
   * Format file size to human readable
   * @param {number} bytes - File size in bytes
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Validate file type
   * @param {string} mimetype - File MIME type
   * @param {string[]} allowedTypes - Allowed MIME types
   */
  isValidFileType(mimetype, allowedTypes = null) {
    const allowed = allowedTypes || [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
      'text/css',
      'text/html',
      'text/javascript',
      'application/javascript',
      'application/json',
      'text/xml',
      'application/xml',
      'text/yaml',
      'application/x-yaml',
      'image/png',
      'image/jpeg',
      'image/gif'
    ];

    return allowed.includes(mimetype);
  }

  /**
   * Validate file size
   * @param {number} size - File size in bytes
   * @param {number} maxSize - Maximum allowed size in bytes
   */
  isValidFileSize(size, maxSize = null) {
    const max = maxSize || config.maxFileSize;
    return size <= max;
  }

  /**
   * Get file extension from filename
   * @param {string} filename - File name
   */
  getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
  }

  /**
   * Generate unique filename
   * @param {string} originalName - Original file name
   */
  generateUniqueFileName(originalName) {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const ext = this.getFileExtension(originalName);
    const nameWithoutExt = path.basename(originalName, ext);
    
    // Sanitize filename
    const sanitizedName = nameWithoutExt
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);

    return `${sanitizedName}_${timestamp}_${random}${ext}`;
  }

  /**
   * Clean up old temporary files
   * @param {number} maxAgeHours - Maximum age in hours
   */
  async cleanupTempFiles(maxAgeHours = 24) {
    const tempDir = path.join(config.uploadDir, 'temp');
    
    try {
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await this.deleteFile(filePath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }
}

module.exports = new FileStorageService();
