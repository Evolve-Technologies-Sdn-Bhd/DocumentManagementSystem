-- CreateTable
CREATE TABLE `ProjectChangeRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `projectIterationId` INTEGER NULL,
    `changeId` VARCHAR(191) NOT NULL,
    `phaseRef` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `impact` TEXT NULL,
    `authorizedBy` VARCHAR(191) NULL,
    `complianceSignOff` VARCHAR(191) NULL,
    `dateApproved` DATETIME(3) NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectChangeRequest_projectId_changeId_key`(`projectId`, `changeId`),
    INDEX `ProjectChangeRequest_projectId_idx`(`projectId`),
    INDEX `ProjectChangeRequest_projectIterationId_idx`(`projectIterationId`),
    INDEX `ProjectChangeRequest_createdById_idx`(`createdById`),
    INDEX `ProjectChangeRequest_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectChangeRequest` ADD CONSTRAINT `ProjectChangeRequest_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectChangeRequest` ADD CONSTRAINT `ProjectChangeRequest_projectIterationId_fkey` FOREIGN KEY (`projectIterationId`) REFERENCES `ProjectIteration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectChangeRequest` ADD CONSTRAINT `ProjectChangeRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

