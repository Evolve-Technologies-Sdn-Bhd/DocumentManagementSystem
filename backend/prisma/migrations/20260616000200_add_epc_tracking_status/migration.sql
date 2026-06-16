-- AlterTable
ALTER TABLE `DocumentEpcRegistryRecord`
  ADD COLUMN `trackingStatus` ENUM('REGISTER', 'CHECK_IN', 'CHECK_OUT', 'ARCHIVE') NOT NULL DEFAULT 'REGISTER',
  ADD COLUMN `trackingUpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `trackingUpdatedById` INTEGER NULL;

-- Backfill trackingUpdatedAt to match generatedAt for existing rows
UPDATE `DocumentEpcRegistryRecord` SET `trackingUpdatedAt` = `generatedAt`;

-- CreateIndex
CREATE INDEX `DocumentEpcRegistryRecord_trackingStatus_idx` ON `DocumentEpcRegistryRecord`(`trackingStatus`);

-- AddForeignKey
ALTER TABLE `DocumentEpcRegistryRecord`
  ADD CONSTRAINT `DocumentEpcRegistryRecord_trackingUpdatedById_fkey`
  FOREIGN KEY (`trackingUpdatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

