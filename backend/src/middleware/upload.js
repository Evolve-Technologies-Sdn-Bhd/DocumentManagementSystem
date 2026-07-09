const multer = require('multer');
const path = require('path');
const config = require('../config/app');
const fileStorageService = require('../services/fileStorageService');
const configService = require('../services/configService');
const { startTimer, getElapsedMs, roundMs } = require('../utils/timing');

/**
 * Cache for file upload settings to avoid frequent DB queries
 */
let cachedFileUploadSettings = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60000; // 1 minute

function updateFileUploadSettingsCache(nextSettings) {
  cachedFileUploadSettings = nextSettings || null;
  cacheTimestamp = nextSettings ? Date.now() : 0;
}

function recordUploadMiddlewareTiming(req, fieldName, fileCount, start) {
  req.uploadTiming = {
    ...(req.uploadTiming || {}),
    middleware: {
      fieldName,
      fileCount,
      multipartParseMs: roundMs(getElapsedMs(start))
    }
  };
}

/**
 * Get file upload settings from cache or database
 */
async function getFileUploadSettings() {
  const now = Date.now();
  if (cachedFileUploadSettings && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedFileUploadSettings;
  }

  cachedFileUploadSettings = await configService.getFileUploadSettings();
  cacheTimestamp = now;
  return cachedFileUploadSettings;
}

/**
 * Storage configuration for document uploads
 */
const documentStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(config.uploadDir, 'temp');
    try {
      const fs = require('fs').promises;
      await fs.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueFileName = fileStorageService.generateUniqueFileName(file.originalname);
    cb(null, uniqueFileName);
  }
});

/**
 * File filter for document uploads - dynamically checks allowed types from settings
 */
const documentFileFilter = async (req, file, cb) => {
  try {
    const settings = await getFileUploadSettings();
    const ext = path.extname(file.originalname).toUpperCase().replace('.', '');
    
    if (settings.allowedTypes.includes(ext) || fileStorageService.isValidFileType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${settings.allowedTypes.join(', ')} files are allowed`), false);
    }
  } catch (error) {
    // Fallback to default validation if settings unavailable
    if (fileStorageService.isValidFileType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, and TXT files are allowed'), false);
    }
  }
};

/**
 * Dynamic limits function that loads from database settings
 */
const getDynamicLimits = async () => {
  try {
    const settings = await getFileUploadSettings();
    return {
      fileSize: settings.maxFileSize * 1024 * 1024, // Convert MB to bytes
      files: 1
    };
  } catch (error) {
    // Fallback to config file or default
    return {
      fileSize: config.maxFileSize || 10 * 1024 * 1024,
      files: 1
    };
  }
};

/**
 * Multer upload configuration for documents with dynamic limits
 * This returns a middleware function that creates the multer instance dynamically
 */
const createUploadMiddleware = (fieldName = 'file') => {
  return async (req, res, next) => {
    const middlewareStart = startTimer();
    try {
      const limits = await getDynamicLimits();
      const upload = multer({
        storage: documentStorage,
        limits: limits,
        fileFilter: documentFileFilter
      }).single(fieldName);  // Use the provided fieldName
      
      upload(req, res, (error) => {
        recordUploadMiddlewareTiming(req, fieldName, req.file ? 1 : 0, middlewareStart);
        next(error);
      });
    } catch (error) {
      recordUploadMiddlewareTiming(req, fieldName, req.file ? 1 : 0, middlewareStart);
      next(error);
    }
  };
};

const createUploadArrayMiddleware = (fieldName = 'files', maxCount) => {
  return async (req, res, next) => {
    const middlewareStart = startTimer();
    try {
      const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
      const parsedMaxCount = Number.isFinite(maxCount) ? maxCount : parseInt(maxCount, 10)
      let resolvedMaxCount = parsedMaxCount

      if (!Number.isFinite(resolvedMaxCount) || resolvedMaxCount <= 0) {
        try {
          const settings = await getFileUploadSettings()
          resolvedMaxCount = clamp(parseInt(settings?.bulkUploadLimit, 10) || 10, 1, 100)
        } catch (_) {
          resolvedMaxCount = 10
        }
      } else {
        resolvedMaxCount = clamp(parseInt(resolvedMaxCount, 10) || 10, 1, 100)
      }

      const limits = await getDynamicLimits();
      const upload = multer({
        storage: documentStorage,
        limits: { ...limits, files: resolvedMaxCount },
        fileFilter: documentFileFilter
      }).array(fieldName, resolvedMaxCount);
      upload(req, res, (error) => {
        recordUploadMiddlewareTiming(req, fieldName, Array.isArray(req.files) ? req.files.length : 0, middlewareStart);
        next(error);
      });
    } catch (error) {
      recordUploadMiddlewareTiming(req, fieldName, Array.isArray(req.files) ? req.files.length : 0, middlewareStart);
      next(error);
    }
  };
};

/**
 * For backward compatibility, provide a multer-like interface
 * This allows using uploadDocument.single('file') in routes
 */
const uploadDocument = {
  single: (fieldName = 'file') => createUploadMiddleware(fieldName),
  array: (fieldName = 'files', maxCount) => createUploadArrayMiddleware(fieldName, maxCount),
  // Direct use as middleware with default 'file' fieldname
  middleware: createUploadMiddleware('file')
};

/**
 * Storage configuration for template uploads
 */
const templateStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(config.uploadDir, 'templates');
    try {
      const fs = require('fs').promises;
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueFileName = fileStorageService.generateUniqueFileName(file.originalname);
    cb(null, uniqueFileName);
  }
});

/**
 * File filter for template uploads - only Office formats
 */
const templateFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Word documents
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.wordprocessingml.template', // .dotx
    // Excel documents
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template', // .xltx
    'text/csv', // .csv
    'application/csv', // .csv alternate
    // PowerPoint documents
    'application/vnd.openxmlformats-officedocument.presentationml.presentation' // .pptx
  ];

  // Also check by file extension as a fallback
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.docx', '.dotx', '.xlsx', '.xltx', '.csv', '.pptx'];

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only DOCX, DOTX, XLSX, XLTX, CSV, and PPTX files are allowed for templates'), false);
  }
};

/**
 * Multer upload configuration for templates
 */
const uploadTemplate = multer({
  storage: templateStorage,
  limits: {
    fileSize: config.maxFileSize,
    files: 1
  },
  fileFilter: templateFileFilter
});

/**
 * Storage configuration for profile images
 */
const profileImageStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(config.uploadDir, 'profiles', req.user.id.toString());
    try {
      const fs = require('fs').promises;
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `profile-${timestamp}${ext}`);
  }
});

/**
 * File filter for profile images
 */
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and GIF images are allowed'), false);
  }
};

/**
 * Multer upload configuration for profile images
 */
const uploadProfileImage = multer({
  storage: profileImageStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1
  },
  fileFilter: imageFileFilter
});

const landingPdfStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(config.uploadDir, 'landing');
    try {
      const fs = require('fs').promises;
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueFileName = fileStorageService.generateUniqueFileName(file.originalname);
    cb(null, uniqueFileName);
  }
});

const landingPdfFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === 'application/pdf' || ext === '.pdf') {
    cb(null, true);
    return;
  }
  cb(new Error('Invalid file type. Only PDF files are allowed'), false);
};

const uploadLandingPdf = async (req, res, next) => {
  try {
    const settings = await getFileUploadSettings();
    const upload = multer({
      storage: landingPdfStorage,
      limits: { fileSize: settings.maxFileSize * 1024 * 1024, files: 1 },
      fileFilter: landingPdfFileFilter
    }).single('file');
    upload(req, res, next);
  } catch (error) {
    const upload = multer({
      storage: landingPdfStorage,
      limits: { fileSize: config.maxFileSize || 10 * 1024 * 1024, files: 1 },
      fileFilter: landingPdfFileFilter
    }).single('file');
    upload(req, res, next);
  }
};

module.exports = {
  uploadDocument,
  uploadTemplate,
  uploadProfileImage,
  uploadLandingPdf,
  updateFileUploadSettingsCache
};
