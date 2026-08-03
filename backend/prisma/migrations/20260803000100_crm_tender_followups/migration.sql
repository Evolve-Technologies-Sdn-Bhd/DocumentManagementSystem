ALTER TABLE `CrmTenderEntry`
  ADD COLUMN `nextFollowUpAt` DATETIME(3) NULL;

CREATE TABLE `CrmTenderAssignee` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tenderId` INTEGER NOT NULL,
  `userId` INTEGER NOT NULL,
  `createdById` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `CrmTenderAssignee_tenderId_userId_key`(`tenderId`, `userId`),
  INDEX `CrmTenderAssignee_tenderId_idx`(`tenderId`),
  INDEX `CrmTenderAssignee_userId_idx`(`userId`),
  INDEX `CrmTenderAssignee_createdAt_idx`(`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CrmTenderAssignee`
  ADD CONSTRAINT `CrmTenderAssignee_tenderId_fkey` FOREIGN KEY (`tenderId`) REFERENCES `CrmTenderEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmTenderAssignee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmTenderAssignee_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `CrmTenderFollowUpLog` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `tenderId` INTEGER NOT NULL,
  `followUpAt` DATETIME(3) NULL,
  `assignedToId` INTEGER NULL,
  `note` TEXT NULL,
  `createdById` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `CrmTenderFollowUpLog_tenderId_idx`(`tenderId`),
  INDEX `CrmTenderFollowUpLog_assignedToId_idx`(`assignedToId`),
  INDEX `CrmTenderFollowUpLog_followUpAt_idx`(`followUpAt`),
  INDEX `CrmTenderFollowUpLog_createdAt_idx`(`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CrmTenderFollowUpLog`
  ADD CONSTRAINT `CrmTenderFollowUpLog_tenderId_fkey` FOREIGN KEY (`tenderId`) REFERENCES `CrmTenderEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmTenderFollowUpLog_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `CrmTenderFollowUpLog_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
