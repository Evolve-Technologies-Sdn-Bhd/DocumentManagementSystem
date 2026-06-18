CREATE TABLE `DocumentConfidentialAccess` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `documentId` INTEGER NOT NULL,
  `subjectType` VARCHAR(191) NOT NULL,
  `userId` INTEGER NULL,
  `roleId` INTEGER NULL,
  `canView` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `DocumentConfidentialAccess_documentId_userId_key`(`documentId`, `userId`),
  UNIQUE INDEX `DocumentConfidentialAccess_documentId_roleId_key`(`documentId`, `roleId`),
  INDEX `DocumentConfidentialAccess_documentId_idx`(`documentId`),
  INDEX `DocumentConfidentialAccess_userId_idx`(`userId`),
  INDEX `DocumentConfidentialAccess_roleId_idx`(`roleId`),
  INDEX `DocumentConfidentialAccess_subjectType_idx`(`subjectType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DocumentConfidentialAccess` ADD CONSTRAINT `DocumentConfidentialAccess_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentConfidentialAccess` ADD CONSTRAINT `DocumentConfidentialAccess_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentConfidentialAccess` ADD CONSTRAINT `DocumentConfidentialAccess_roleId_fkey`
  FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `ProjectCategoryDocumentRequirementConfidentialAccess` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `requirementId` INTEGER NOT NULL,
  `subjectType` VARCHAR(191) NOT NULL,
  `userId` INTEGER NULL,
  `roleId` INTEGER NULL,
  `canView` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `PCDRCA_reqid_userid_key`(`requirementId`, `userId`),
  UNIQUE INDEX `PCDRCA_reqid_roleid_key`(`requirementId`, `roleId`),
  INDEX `PCDRCA_reqid_idx`(`requirementId`),
  INDEX `PCDRCA_userid_idx`(`userId`),
  INDEX `PCDRCA_roleid_idx`(`roleId`),
  INDEX `PCDRCA_subjectType_idx`(`subjectType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProjectCategoryDocumentRequirementConfidentialAccess` ADD CONSTRAINT `PCDRCA_reqid_fk`
  FOREIGN KEY (`requirementId`) REFERENCES `ProjectCategoryDocumentRequirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProjectCategoryDocumentRequirementConfidentialAccess` ADD CONSTRAINT `PCDRCA_userid_fk`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProjectCategoryDocumentRequirementConfidentialAccess` ADD CONSTRAINT `PCDRCA_roleid_fk`
  FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
