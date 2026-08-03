UPDATE `CrmFbEnquiryEntry`
SET `contact` = CONCAT('UNKNOWN-', `id`)
WHERE `contact` IS NULL OR TRIM(`contact`) = '';

UPDATE `CrmFbEnquiryEntry`
SET `status` = 'FOLLOW_UP'
WHERE `status` = 'QUALIFIED';

UPDATE `CrmFbEnquiryEntry`
SET `status` = 'QUOTATION_ISSUED'
WHERE `status` IN ('QUOTATION_PROVIDED', 'CONVERTED');

ALTER TABLE `CrmFbEnquiryEntry`
  MODIFY `name` VARCHAR(255) NULL,
  MODIFY `contact` VARCHAR(255) NOT NULL,
  MODIFY `status` ENUM('NEW', 'CONTACTED', 'FOLLOW_UP', 'NO_RESPONSE', 'QUOTATION_ISSUED') NOT NULL DEFAULT 'NEW',
  ADD COLUMN `state` VARCHAR(255) NULL,
  ADD COLUMN `nextFollowUpAt` DATETIME(3) NULL,
  ADD COLUMN `tenderEntryId` INTEGER NULL;

CREATE UNIQUE INDEX `CrmFbEnquiryEntry_contact_key` ON `CrmFbEnquiryEntry`(`contact`);
CREATE UNIQUE INDEX `CrmFbEnquiryEntry_tenderEntryId_key` ON `CrmFbEnquiryEntry`(`tenderEntryId`);

ALTER TABLE `CrmFbEnquiryEntry`
  ADD CONSTRAINT `CrmFbEnquiryEntry_tenderEntryId_fkey` FOREIGN KEY (`tenderEntryId`) REFERENCES `CrmTenderEntry`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `CrmFbEnquiryAssignee` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `enquiryId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `createdById` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `CrmFbEnquiryAssignee_enquiryId_userId_key`(`enquiryId`, `userId`),
  INDEX `CrmFbEnquiryAssignee_enquiryId_idx`(`enquiryId`),
  INDEX `CrmFbEnquiryAssignee_userId_idx`(`userId`),
  INDEX `CrmFbEnquiryAssignee_createdAt_idx`(`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CrmFbEnquiryAssignee`
  ADD CONSTRAINT `CrmFbEnquiryAssignee_enquiryId_fkey` FOREIGN KEY (`enquiryId`) REFERENCES `CrmFbEnquiryEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmFbEnquiryAssignee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmFbEnquiryAssignee_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `CrmFbEnquiryFollowUpLog` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `enquiryId` INTEGER NOT NULL,
  `followUpAt` DATETIME(3) NULL,
  `assignedToId` INTEGER NULL,
  `note` TEXT NULL,
  `createdById` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `CrmFbEnquiryFollowUpLog_enquiryId_idx`(`enquiryId`),
  INDEX `CrmFbEnquiryFollowUpLog_assignedToId_idx`(`assignedToId`),
  INDEX `CrmFbEnquiryFollowUpLog_followUpAt_idx`(`followUpAt`),
  INDEX `CrmFbEnquiryFollowUpLog_createdAt_idx`(`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CrmFbEnquiryFollowUpLog`
  ADD CONSTRAINT `CrmFbEnquiryFollowUpLog_enquiryId_fkey` FOREIGN KEY (`enquiryId`) REFERENCES `CrmFbEnquiryEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmFbEnquiryFollowUpLog_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmFbEnquiryFollowUpLog_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
