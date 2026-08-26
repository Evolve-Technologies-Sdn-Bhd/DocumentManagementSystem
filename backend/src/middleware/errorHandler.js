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
  const meta = err.meta || {};
  switch (err.code) {
    case 'P2002':
      // Unique constraint violation
      const field = meta.target?.[0] || 'field';
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
      return ResponseFormatter.notFound(res, meta.modelName || 'Record');

    case 'P2003':
      // Foreign key constraint violation
      return ResponseFormatter.error(
        res,
        'Related record not found' + (meta.field_name ? ` (${meta.field_name})` : ''),
        400
      );

    case 'P2014':
      // Required field missing
      return ResponseFormatter.error(
        res,
        'Required field is missing' + (meta.field_name ? `: ${meta.field_name}` : ''),
        400
      );

    case 'P2022':
      // Column does not exist - common when migrations are pending
      const missingColumn = meta.column || 'a column';
      return ResponseFormatter.error(
        res,
        `Database schema is out of date (missing ${missingColumn}). Please run the latest migrations on the server. Code: P2022`,
        500
      );

    case 'P2009':
      // Required value validation error
      return ResponseFormatter.error(
        res,
        `Validation error: ${meta.message || 'invalid input'}. Code: P2009`,
        400
      );

    case 'P2010':
      // Raw query failed
      return ResponseFormatter.error(
        res,
        `Database query error. Code: P2010`,
        500
      );

    case 'P2012':
      // Missing a required value
      const missingReq = meta.path || 'value';
      return ResponseFormatter.error(
        res,
        `Missing required value: ${missingReq}. Code: P2012`,
        400
      );

    case 'P2013':
      // Missing the required argument
      const missingArg = meta.argument || 'argument';
      return ResponseFormatter.error(
        res,
        `Missing required argument: ${missingArg}. Code: P2013`,
        400
      );

    case 'P2015':
      // A related record could not be found
      return ResponseFormatter.error(
        res,
        `Related record could not be found. Code: P2015`,
        404
      );

    case 'P2019':
      // Input error
      return ResponseFormatter.error(
        res,
        `Invalid input: ${meta.message || 'validation failed'}. Code: P2019`,
        400
      );

    case 'P2020':
      // Value out of range for the column type
      return ResponseFormatter.error(
        res,
        `Value out of range for database column. Code: P2020`,
        400
      );

    case 'P2021':
      // Table does not exist
      const missingTable = meta.table || 'table';
      return ResponseFormatter.error(
        res,
        `Database is missing required table (${missingTable}). Please run migrations first. Code: P2021`,
        500
      );

    case 'P2026':
      // Provider error / Database connection error
      return ResponseFormatter.error(
        res,
        `Database connection or provider error. Please try again. Code: P2026`,
        500
      );

    default:
      // Generic Prisma error with code hint for debugging
      const errMsg = err.message ? String(err.message).slice(0, 120) : '';
      return ResponseFormatter.error(
        res,
        `Database operation failed (Prisma code: ${err.code}). ${process.env.NODE_ENV !== 'production' ? errMsg : ''}`,
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
