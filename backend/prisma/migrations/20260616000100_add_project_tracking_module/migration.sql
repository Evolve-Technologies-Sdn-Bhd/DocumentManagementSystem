-- AlterTable
ALTER TABLE `Document` ADD COLUMN `isConfidential` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `Project` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` LONGTEXT NULL,
    `projectCategoryId` INTEGER NOT NULL,
    `managerId` INTEGER NOT NULL,
    `createdById` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'ON_HOLD', 'CLOSED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Project_code_key`(`code`),
    INDEX `Project_projectCategoryId_idx`(`projectCategoryId`),
    INDEX `Project_managerId_idx`(`managerId`),
    INDEX `Project_createdById_idx`(`createdById`),
    INDEX `Project_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectStageDefinition` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectStageDefinition_key_key`(`key`),
    INDEX `ProjectStageDefinition_sortOrder_idx`(`sortOrder`),
    INDEX `ProjectStageDefinition_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectIteration` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `iterationNo` INTEGER NOT NULL,
    `name` VARCHAR(191) NULL,
    `currentStageId` INTEGER NULL,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectIteration_projectId_iterationNo_key`(`projectId`, `iterationNo`),
    INDEX `ProjectIteration_projectId_idx`(`projectId`),
    INDEX `ProjectIteration_currentStageId_idx`(`currentStageId`),
    INDEX `ProjectIteration_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectCategoryStage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectCategoryId` INTEGER NOT NULL,
    `stageId` INTEGER NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `sortOrder` INTEGER NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectCategoryStage_projectCategoryId_stageId_key`(`projectCategoryId`, `stageId`),
    INDEX `ProjectCategoryStage_projectCategoryId_idx`(`projectCategoryId`),
    INDEX `ProjectCategoryStage_stageId_idx`(`stageId`),
    INDEX `ProjectCategoryStage_isEnabled_idx`(`isEnabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectCategoryDocumentRequirement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectCategoryId` INTEGER NOT NULL,
    `stageId` INTEGER NOT NULL,
    `documentTypeId` INTEGER NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `isConfidentialDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectCategoryDocumentRequirement_projectCategoryId_stageId_documentTypeId_key`(`projectCategoryId`, `stageId`, `documentTypeId`),
    INDEX `ProjectCategoryDocumentRequirement_projectCategoryId_idx`(`projectCategoryId`),
    INDEX `ProjectCategoryDocumentRequirement_stageId_idx`(`stageId`),
    INDEX `ProjectCategoryDocumentRequirement_documentTypeId_idx`(`documentTypeId`),
    INDEX `ProjectCategoryDocumentRequirement_isRequired_idx`(`isRequired`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectIterationDocumentItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectIterationId` INTEGER NOT NULL,
    `stageId` INTEGER NOT NULL,
    `documentTypeId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'COMPLETE', 'WAIVED') NOT NULL DEFAULT 'PENDING',
    `dueDate` DATETIME(3) NULL,
    `assignedToId` INTEGER NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectIterationDocumentItem_projectIterationId_stageId_documentTypeId_key`(`projectIterationId`, `stageId`, `documentTypeId`),
    INDEX `ProjectIterationDocumentItem_projectIterationId_idx`(`projectIterationId`),
    INDEX `ProjectIterationDocumentItem_stageId_idx`(`stageId`),
    INDEX `ProjectIterationDocumentItem_documentTypeId_idx`(`documentTypeId`),
    INDEX `ProjectIterationDocumentItem_status_idx`(`status`),
    INDEX `ProjectIterationDocumentItem_assignedToId_idx`(`assignedToId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectDocumentLink` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectIterationId` INTEGER NOT NULL,
    `stageId` INTEGER NOT NULL,
    `itemId` INTEGER NULL,
    `documentId` INTEGER NOT NULL,
    `linkedById` INTEGER NOT NULL,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProjectDocumentLink_projectIterationId_documentId_key`(`projectIterationId`, `documentId`),
    INDEX `ProjectDocumentLink_projectIterationId_idx`(`projectIterationId`),
    INDEX `ProjectDocumentLink_stageId_idx`(`stageId`),
    INDEX `ProjectDocumentLink_itemId_idx`(`itemId`),
    INDEX `ProjectDocumentLink_documentId_idx`(`documentId`),
    INDEX `ProjectDocumentLink_linkedById_idx`(`linkedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_projectCategoryId_fkey` FOREIGN KEY (`projectCategoryId`) REFERENCES `ProjectCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectIteration` ADD CONSTRAINT `ProjectIteration_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectIteration` ADD CONSTRAINT `ProjectIteration_currentStageId_fkey` FOREIGN KEY (`currentStageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCategoryStage` ADD CONSTRAINT `ProjectCategoryStage_projectCategoryId_fkey` FOREIGN KEY (`projectCategoryId`) REFERENCES `ProjectCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCategoryStage` ADD CONSTRAINT `ProjectCategoryStage_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCategoryDocumentRequirement` ADD CONSTRAINT `ProjectCategoryDocumentRequirement_projectCategoryId_fkey` FOREIGN KEY (`projectCategoryId`) REFERENCES `ProjectCategory`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCategoryDocumentRequirement` ADD CONSTRAINT `ProjectCategoryDocumentRequirement_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCategoryDocumentRequirement` ADD CONSTRAINT `ProjectCategoryDocumentRequirement_documentTypeId_fkey` FOREIGN KEY (`documentTypeId`) REFERENCES `DocumentType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectIterationDocumentItem` ADD CONSTRAINT `ProjectIterationDocumentItem_projectIterationId_fkey` FOREIGN KEY (`projectIterationId`) REFERENCES `ProjectIteration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectIterationDocumentItem` ADD CONSTRAINT `ProjectIterationDocumentItem_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectIterationDocumentItem` ADD CONSTRAINT `ProjectIterationDocumentItem_documentTypeId_fkey` FOREIGN KEY (`documentTypeId`) REFERENCES `DocumentType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectIterationDocumentItem` ADD CONSTRAINT `ProjectIterationDocumentItem_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocumentLink` ADD CONSTRAINT `ProjectDocumentLink_projectIterationId_fkey` FOREIGN KEY (`projectIterationId`) REFERENCES `ProjectIteration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocumentLink` ADD CONSTRAINT `ProjectDocumentLink_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocumentLink` ADD CONSTRAINT `ProjectDocumentLink_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `ProjectIterationDocumentItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocumentLink` ADD CONSTRAINT `ProjectDocumentLink_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectDocumentLink` ADD CONSTRAINT `ProjectDocumentLink_linkedById_fkey` FOREIGN KEY (`linkedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
