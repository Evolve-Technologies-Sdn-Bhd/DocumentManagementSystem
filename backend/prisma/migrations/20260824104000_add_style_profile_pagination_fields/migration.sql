-- AlterTable — add pagination fields to SmartDocumentStyleProfile
-- Using conditional ADD COLUMN (via INFORMATION_SCHEMA check) so it's idempotent
-- This covers both cases:
--   A) Table was created earlier with legacy db push (missing pagination cols)
--   B) Table was just created by 20260824103000 migration (cols already included)

SET @dbname = DATABASE();

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'firstPageNumber'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `firstPageNumber` INTEGER NOT NULL DEFAULT 1',
  'SELECT ''firstPageNumber already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'restartOnEachSection'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `restartOnEachSection` BOOLEAN NOT NULL DEFAULT false',
  'SELECT ''restartOnEachSection already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'useHybridPageNumbering'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `useHybridPageNumbering` BOOLEAN NOT NULL DEFAULT false',
  'SELECT ''useHybridPageNumbering already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'frontMatterThreshold'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `frontMatterThreshold` INTEGER NULL DEFAULT 4',
  'SELECT ''frontMatterThreshold already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'frontMatterFormat'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `frontMatterFormat` VARCHAR(191) NULL DEFAULT ''lowerRoman''',
  'SELECT ''frontMatterFormat already exists — skipping'''
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
