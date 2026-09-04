-- AlterTable — add Custom Header/Footer Image Mode fields to SmartDocumentStyleProfile
-- Using conditional ADD COLUMN (via INFORMATION_SCHEMA check) so it's idempotent
-- 6 new fields per SmartDocumentStyleProfile (bool + path + width for each side)

SET @dbname = DATABASE();

-- === HEADER fields ===
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'headerUseCustomImage'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `headerUseCustomImage` BOOLEAN NOT NULL DEFAULT false',
  'SELECT ''headerUseCustomImage already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'headerCustomImagePath'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `headerCustomImagePath` VARCHAR(191) NULL',
  'SELECT ''headerCustomImagePath already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'headerCustomImageWidthMm'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `headerCustomImageWidthMm` DECIMAL(10,2) NULL',
  'SELECT ''headerCustomImageWidthMm already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- === FOOTER fields ===
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'footerUseCustomImage'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `footerUseCustomImage` BOOLEAN NOT NULL DEFAULT false',
  'SELECT ''footerUseCustomImage already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'footerCustomImagePath'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `footerCustomImagePath` VARCHAR(191) NULL',
  'SELECT ''footerCustomImagePath already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'footerCustomImageWidthMm'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `footerCustomImageWidthMm` DECIMAL(10,2) NULL',
  'SELECT ''footerCustomImageWidthMm already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
