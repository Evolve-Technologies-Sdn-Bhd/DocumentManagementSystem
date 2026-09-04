-- AlterTable
ALTER TABLE `Document` ADD COLUMN `contentData` JSON NULL;
ALTER TABLE `Document` ADD COLUMN `contentText` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `DocumentVersion` ADD COLUMN `contentData` JSON NULL;
ALTER TABLE `DocumentVersion` ADD COLUMN `contentText` LONGTEXT NULL;
