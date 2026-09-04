-- CreateTable
CREATE TABLE `ProjectRequiredDocumentPicAssignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `documentTypeId` INTEGER NOT NULL,
    `picUserId` INTEGER NOT NULL,
    `assignedById` INTEGER NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PRDPICA_pid_dtid_key`(`projectId`, `documentTypeId`),
    INDEX `ProjectRequiredDocumentPicAssignment_projectId_idx`(`projectId`),
    INDEX `ProjectRequiredDocumentPicAssignment_documentTypeId_idx`(`documentTypeId`),
    INDEX `ProjectRequiredDocumentPicAssignment_picUserId_idx`(`picUserId`),
    INDEX `ProjectRequiredDocumentPicAssignment_assignedById_idx`(`assignedById`),
    INDEX `ProjectRequiredDocumentPicAssignment_assignedAt_idx`(`assignedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectRequiredDocumentPicAssignment`
    ADD CONSTRAINT `ProjectRequiredDocumentPicAssignment_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRequiredDocumentPicAssignment`
    ADD CONSTRAINT `ProjectRequiredDocumentPicAssignment_documentTypeId_fkey`
    FOREIGN KEY (`documentTypeId`) REFERENCES `DocumentType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRequiredDocumentPicAssignment`
    ADD CONSTRAINT `ProjectRequiredDocumentPicAssignment_picUserId_fkey`
    FOREIGN KEY (`picUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRequiredDocumentPicAssignment`
    ADD CONSTRAINT `ProjectRequiredDocumentPicAssignment_assignedById_fkey`
    FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

