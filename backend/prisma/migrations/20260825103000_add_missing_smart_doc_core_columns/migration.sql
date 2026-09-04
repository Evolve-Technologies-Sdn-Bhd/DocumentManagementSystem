-- ============================================
-- Add MISSING core columns + enums for Smart Document integration
-- that were added to schema.prisma via db push but never migrated as SQL.
-- Uses conditional INFORMATION_SCHEMA check for each column so it's idempotent.
-- Covers: Document, DocumentType, DocumentVersion tables
-- ============================================

SET @dbname = DATABASE();

-- ============================================
-- Document: contentFormat (ContentFormat enum - VARCHAR(191))
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Document' AND COLUMN_NAME = 'contentFormat'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `Document` ADD COLUMN `contentFormat` VARCHAR(191) NOT NULL DEFAULT ''FILE''',
  'SELECT ''Document.contentFormat exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- Document: creationMode (CreationMode enum - VARCHAR(191))
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Document' AND COLUMN_NAME = 'creationMode'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `Document` ADD COLUMN `creationMode` VARCHAR(191) NOT NULL DEFAULT ''FILE_BASED''',
  'SELECT ''Document.creationMode exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- Document: smartDocumentStyleProfileId (FK → SmartDocumentStyleProfile)
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Document' AND COLUMN_NAME = 'smartDocumentStyleProfileId'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `Document` ADD COLUMN `smartDocumentStyleProfileId` INT NULL',
  'SELECT ''Document.smartDocumentStyleProfileId exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Document' AND INDEX_NAME = 'Document_smartDocumentStyleProfileId_idx'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `Document` ADD INDEX `Document_smartDocumentStyleProfileId_idx` (`smartDocumentStyleProfileId`)',
  'SELECT ''Document_smartDocumentStyleProfileId_idx exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- DocumentType: creationMode
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentType' AND COLUMN_NAME = 'creationMode'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `DocumentType` ADD COLUMN `creationMode` VARCHAR(191) NOT NULL DEFAULT ''FILE_BASED''',
  'SELECT ''DocumentType.creationMode exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- DocumentType: smartTemplateId (FK → SmartTemplate default)
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentType' AND COLUMN_NAME = 'smartTemplateId'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `DocumentType` ADD COLUMN `smartTemplateId` INT NULL',
  'SELECT ''DocumentType.smartTemplateId exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentType' AND INDEX_NAME = 'DocumentType_smartTemplateId_idx'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `DocumentType` ADD INDEX `DocumentType_smartTemplateId_idx` (`smartTemplateId`)',
  'SELECT ''DocumentType_smartTemplateId_idx exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- DocumentVersion: smartTemplateVersionId (FK → SmartTemplateVersion)
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentVersion' AND COLUMN_NAME = 'smartTemplateVersionId'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `DocumentVersion` ADD COLUMN `smartTemplateVersionId` INT NULL',
  'SELECT ''DocumentVersion.smartTemplateVersionId exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentVersion' AND INDEX_NAME = 'DocumentVersion_smartTemplateVersionId_idx'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `DocumentVersion` ADD INDEX `DocumentVersion_smartTemplateVersionId_idx` (`smartTemplateVersionId`)',
  'SELECT ''DocumentVersion_smartTemplateVersionId_idx exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- DocumentVersion: smartContentIsLocked
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentVersion' AND COLUMN_NAME = 'smartContentIsLocked'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `DocumentVersion` ADD COLUMN `smartContentIsLocked` BOOLEAN NOT NULL DEFAULT false',
  'SELECT ''DocumentVersion.smartContentIsLocked exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- DocumentVersion: smartFinalPdfPath
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentVersion' AND COLUMN_NAME = 'smartFinalPdfPath'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `DocumentVersion` ADD COLUMN `smartFinalPdfPath` VARCHAR(191) NULL',
  'SELECT ''DocumentVersion.smartFinalPdfPath exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- DocumentVersion: smartFinalPdfFileSize
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentVersion' AND COLUMN_NAME = 'smartFinalPdfFileSize'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `DocumentVersion` ADD COLUMN `smartFinalPdfFileSize` INT NULL',
  'SELECT ''DocumentVersion.smartFinalPdfFileSize exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================
-- DocumentVersion: smartFinalPdfGeneratedAt
-- ============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'DocumentVersion' AND COLUMN_NAME = 'smartFinalPdfGeneratedAt'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `DocumentVersion` ADD COLUMN `smartFinalPdfGeneratedAt` DATETIME(3) NULL',
  'SELECT ''DocumentVersion.smartFinalPdfGeneratedAt exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
