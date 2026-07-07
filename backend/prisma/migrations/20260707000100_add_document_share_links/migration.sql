CREATE TABLE `DocumentShareLink` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `documentId` INTEGER NOT NULL,
  `createdById` INTEGER NOT NULL,
  `tokenHash` VARCHAR(128) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `lastAccessedAt` DATETIME(3) NULL,
  `accessCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `DocumentShareLink_tokenHash_key`(`tokenHash`),
  INDEX `DocumentShareLink_documentId_idx`(`documentId`),
  INDEX `DocumentShareLink_createdById_idx`(`createdById`),
  INDEX `DocumentShareLink_expiresAt_idx`(`expiresAt`),
  INDEX `DocumentShareLink_revokedAt_idx`(`revokedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DocumentShareLink` ADD CONSTRAINT `DocumentShareLink_documentId_fkey`
  FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentShareLink` ADD CONSTRAINT `DocumentShareLink_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

