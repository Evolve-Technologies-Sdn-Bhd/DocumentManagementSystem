-- ============================================================
-- STANDALONE MIGRATION: Custom Header/Footer Image Mode
-- Target DB: dms_main on 127.0.0.1:3306
-- Run with:
--   mysql -u dms_main -p'fKiNCdEMYCa7kCM5' dms_main < add-custom-header-footer-fields.sql
-- Or copy-paste into phpMyAdmin / MySQL Workbench
-- ============================================================
-- Idempotent: setiap column ada INFORMATION_SCHEMA check,
-- jadi safe re-run walau column sudah wujud.
-- ============================================================

SET @dbname = DATABASE();

-- ============== HEADER: 3 fields ==============

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'headerUseCustomImage'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `headerUseCustomImage` BOOLEAN NOT NULL DEFAULT false',
  'SELECT ''SKIP: headerUseCustomImage already exists'' AS info'
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
  'SELECT ''SKIP: headerCustomImagePath already exists'' AS info'
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
  'SELECT ''SKIP: headerCustomImageWidthMm already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============== FOOTER: 3 fields ==============

SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = 'SmartDocumentStyleProfile'
    AND COLUMN_NAME = 'footerUseCustomImage'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `footerUseCustomImage` BOOLEAN NOT NULL DEFAULT false',
  'SELECT ''SKIP: footerUseCustomImage already exists'' AS info'
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
  'SELECT ''SKIP: footerCustomImagePath already exists'' AS info'
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
  'SELECT ''SKIP: footerCustomImageWidthMm already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============== VERIFY (run selepas) ==============
-- SHOW COLUMNS FROM SmartDocumentStyleProfile LIKE '%Custom%';
