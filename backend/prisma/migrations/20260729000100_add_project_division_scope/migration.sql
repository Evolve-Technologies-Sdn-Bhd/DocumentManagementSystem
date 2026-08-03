-- AlterTable
ALTER TABLE `Project` ADD COLUMN `divisionId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `Project_divisionId_idx` ON `Project`(`divisionId`);

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_divisionId_fkey` FOREIGN KEY (`divisionId`) REFERENCES `Division`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

