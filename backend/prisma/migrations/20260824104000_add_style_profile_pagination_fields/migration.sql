-- AlterTable
ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `firstPageNumber` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `restartOnEachSection` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `useHybridPageNumbering` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `frontMatterThreshold` INTEGER NULL DEFAULT 4;
ALTER TABLE `SmartDocumentStyleProfile` ADD COLUMN `frontMatterFormat` VARCHAR(191) NULL DEFAULT 'lowerRoman';
