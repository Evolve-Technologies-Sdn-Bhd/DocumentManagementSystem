-- CreateTable
CREATE TABLE `ProjectRequiredDocumentPicAssignment_new` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `stageId` INTEGER NOT NULL,
    `documentTypeId` INTEGER NOT NULL,
    `picUserId` INTEGER NOT NULL,
    `assignedById` INTEGER NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PRDPICA_pid_sid_dtid_key`(`projectId`, `stageId`, `documentTypeId`),
    INDEX `ProjectRequiredDocumentPicAssignment_new_projectId_idx`(`projectId`),
    INDEX `ProjectRequiredDocumentPicAssignment_new_stageId_idx`(`stageId`),
    INDEX `ProjectRequiredDocumentPicAssignment_new_documentTypeId_idx`(`documentTypeId`),
    INDEX `ProjectRequiredDocumentPicAssignment_new_picUserId_idx`(`picUserId`),
    INDEX `ProjectRequiredDocumentPicAssignment_new_assignedById_idx`(`assignedById`),
    INDEX `ProjectRequiredDocumentPicAssignment_new_assignedAt_idx`(`assignedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ProjectRequiredDocumentPicAssignment_new` (
    `projectId`,
    `stageId`,
    `documentTypeId`,
    `picUserId`,
    `assignedById`,
    `assignedAt`,
    `updatedAt`
)
SELECT DISTINCT
    a.`projectId`,
    i.`stageId`,
    a.`documentTypeId`,
    a.`picUserId`,
    a.`assignedById`,
    a.`assignedAt`,
    a.`updatedAt`
FROM `ProjectRequiredDocumentPicAssignment` a
INNER JOIN `ProjectIteration` pi
    ON pi.`projectId` = a.`projectId`
INNER JOIN `ProjectIterationDocumentItem` i
    ON i.`projectIterationId` = pi.`id`
   AND i.`documentTypeId` = a.`documentTypeId`;

DROP TABLE `ProjectRequiredDocumentPicAssignment`;

RENAME TABLE `ProjectRequiredDocumentPicAssignment_new` TO `ProjectRequiredDocumentPicAssignment`;

-- AddForeignKey
ALTER TABLE `ProjectRequiredDocumentPicAssignment`
    ADD CONSTRAINT `ProjectRequiredDocumentPicAssignment_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRequiredDocumentPicAssignment`
    ADD CONSTRAINT `ProjectRequiredDocumentPicAssignment_stageId_fkey`
    FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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

