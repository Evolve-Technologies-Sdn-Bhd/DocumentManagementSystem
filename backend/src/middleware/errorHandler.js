const { AppError, ValidationError } = require('../utils/errors');
const ResponseFormatter = require('../utils/responseFormatter');

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log full error detail including stack for debugging
  const errorLabel =
    (err && err.isOperational ? 'OPERATIONAL' :
      (err && err.code && err.code.startsWith('P') ? 'PRISMA' :
        (err && err.name ? err.name : 'UNKNOWN'))) +
    ' ERROR';
  console.error(`[${errorLabel}] ${req.method} ${req.originalUrl}`);
  if (err && err.stack) {
    console.error(err.stack);
  } else {
    console.error('Error:', err);
  }

  // Handle operational errors
  if (err.isOperational) {
    if (err instanceof ValidationError) {
      return ResponseFormatter.validationError(res, err.errors, err.message);
    }
    return ResponseFormatter.error(res, err.message, err.statusCode, err.errors || null);
  }

  // Handle Prisma errors
  if (err.code && err.code.startsWith('P')) {
    return handlePrismaError(err, res);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ResponseFormatter.unauthorized(res, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return ResponseFormatter.unauthorized(res, 'Token expired');
  }

  // Handle multer errors
  if (err.name === 'MulterError') {
    return handleMulterError(err, res);
  }

  // Handle file filter errors (from multer fileFilter callbacks)
  if (err.message && err.message.includes('Invalid file type')) {
    return ResponseFormatter.error(res, err.message, 400);
  }

  // Handle unknown errors
  const rawMessage = (err && err.message) ? String(err.message) : '';
  const shortHint = rawMessage.length > 80
    ? rawMessage.slice(0, 80) + '...'
    : rawMessage;

  return ResponseFormatter.error(
    res,
    process.env.NODE_ENV === 'production'
      ? (shortHint
          ? `An unexpected error occurred (${shortHint})`
          : 'An unexpected error occurred')
      : err.message,
    500
  );
};

/**
 * Handle Prisma-specific errors
 */
const handlePrismaError = (err, res) => {
  switch (err.code) {
    case 'P2002':
      // Unique constraint violation
      const field = err.meta?.target?.[0] || 'field';
      if (field === 'prefix') {
        return ResponseFormatter.error(
          res,
          'This prefix is already in use. Please choose a different prefix.',
          409
        );
      }
      return ResponseFormatter.error(
        res,
        `A record with this ${field} already exists`,
        409
      );

    case 'P2025':
      // Record not found
      return ResponseFormatter.notFound(res, 'Record');

    case 'P2003':
      // Foreign key constraint violation
      return ResponseFormatter.error(
        res,
        'Related record not found',
        400
      );

    case 'P2014':
      // Required field missing
      return ResponseFormatter.error(
        res,
        'Required field is missing',
        400
      );

    default:
      return ResponseFormatter.error(
        res,
        'Database operation failed',
        500
      );
  }
};

/**
 * Handle Multer-specific errors
 */
const handleMulterError = (err, res) => {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return ResponseFormatter.error(res, 'File too large', 413);

    case 'LIMIT_FILE_COUNT':
      return ResponseFormatter.error(res, 'Too many files', 400);

    case 'LIMIT_UNEXPECTED_FILE':
      return ResponseFormatter.error(res, 'Unexpected file field', 400);

    default:
      return ResponseFormatter.error(res, 'File upload error', 500);
  }
};

/**
 * Handle 404 not found
 */
const notFoundHandler = (req, res) => {
  ResponseFormatter.error(
    res,
    `Cannot ${req.method} ${req.path}`,
    404
  );
};

module.exports = {
  errorHandler,
  notFoundHandler
};
