-- CreateTable
CREATE TABLE `ProjectSetupStageDefault` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stageId` INTEGER NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `sortOrder` INTEGER NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectSetupStageDefault_stageId_key`(`stageId`),
    INDEX `ProjectSetupStageDefault_stageId_idx`(`stageId`),
    INDEX `ProjectSetupStageDefault_isEnabled_idx`(`isEnabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSetupStageOverride` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `stageId` INTEGER NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `sortOrder` INTEGER NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectSetupStageOverride_projectId_stageId_key`(`projectId`, `stageId`),
    INDEX `ProjectSetupStageOverride_projectId_idx`(`projectId`),
    INDEX `ProjectSetupStageOverride_stageId_idx`(`stageId`),
    INDEX `ProjectSetupStageOverride_isEnabled_idx`(`isEnabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSetupDocumentRequirementDefault` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stageId` INTEGER NOT NULL,
    `documentTypeId` INTEGER NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `isConfidentialDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PSDRD_sid_dtid_key`(`stageId`, `documentTypeId`),
    INDEX `ProjectSetupDocumentRequirementDefault_stageId_idx`(`stageId`),
    INDEX `ProjectSetupDocumentRequirementDefault_documentTypeId_idx`(`documentTypeId`),
    INDEX `ProjectSetupDocumentRequirementDefault_isRequired_idx`(`isRequired`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSetupDocumentRequirementOverride` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `projectId` INTEGER NOT NULL,
    `stageId` INTEGER NOT NULL,
    `documentTypeId` INTEGER NOT NULL,
    `isRequired` BOOLEAN NOT NULL DEFAULT true,
    `isConfidentialDefault` BOOLEAN NOT NULL DEFAULT false,
    `isExcluded` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PSDRO_pid_sid_dtid_key`(`projectId`, `stageId`, `documentTypeId`),
    INDEX `ProjectSetupDocumentRequirementOverride_projectId_idx`(`projectId`),
    INDEX `ProjectSetupDocumentRequirementOverride_stageId_idx`(`stageId`),
    INDEX `ProjectSetupDocumentRequirementOverride_documentTypeId_idx`(`documentTypeId`),
    INDEX `ProjectSetupDocumentRequirementOverride_isRequired_idx`(`isRequired`),
    INDEX `ProjectSetupDocumentRequirementOverride_isExcluded_idx`(`isExcluded`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSetupDocumentRequirementDefaultConfidentialAccess` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requirementId` INTEGER NOT NULL,
    `subjectType` ENUM('USER', 'ROLE') NOT NULL,
    `userId` INTEGER NULL,
    `roleId` INTEGER NULL,
    `canView` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PSDRDCA_reqid_userid_key`(`requirementId`, `userId`),
    UNIQUE INDEX `PSDRDCA_reqid_roleid_key`(`requirementId`, `roleId`),
    INDEX `PSDRDCA_reqid_idx`(`requirementId`),
    INDEX `PSDRDCA_userid_idx`(`userId`),
    INDEX `PSDRDCA_roleid_idx`(`roleId`),
    INDEX `PSDRDCA_subjectType_idx`(`subjectType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectSetupDocumentRequirementOverrideConfidentialAccess` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requirementId` INTEGER NOT NULL,
    `subjectType` ENUM('USER', 'ROLE') NOT NULL,
    `userId` INTEGER NULL,
    `roleId` INTEGER NULL,
    `canView` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PSDROCA_reqid_userid_key`(`requirementId`, `userId`),
    UNIQUE INDEX `PSDROCA_reqid_roleid_key`(`requirementId`, `roleId`),
    INDEX `PSDROCA_reqid_idx`(`requirementId`),
    INDEX `PSDROCA_userid_idx`(`userId`),
    INDEX `PSDROCA_roleid_idx`(`roleId`),
    INDEX `PSDROCA_subjectType_idx`(`subjectType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectSetupStageDefault` ADD CONSTRAINT `ProjectSetupStageDefault_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupStageOverride` ADD CONSTRAINT `ProjectSetupStageOverride_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupStageOverride` ADD CONSTRAINT `ProjectSetupStageOverride_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementDefault` ADD CONSTRAINT `ProjectSetupDocumentRequirementDefault_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementDefault` ADD CONSTRAINT `ProjectSetupDocumentRequirementDefault_documentTypeId_fkey` FOREIGN KEY (`documentTypeId`) REFERENCES `DocumentType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementOverride` ADD CONSTRAINT `ProjectSetupDocumentRequirementOverride_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementOverride` ADD CONSTRAINT `ProjectSetupDocumentRequirementOverride_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `ProjectStageDefinition`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementOverride` ADD CONSTRAINT `ProjectSetupDocumentRequirementOverride_documentTypeId_fkey` FOREIGN KEY (`documentTypeId`) REFERENCES `DocumentType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementDefaultConfidentialAccess` ADD CONSTRAINT `ProjectSetupDocumentRequirementDefaultConfidentialAccess_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `ProjectSetupDocumentRequirementDefault`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementDefaultConfidentialAccess` ADD CONSTRAINT `ProjectSetupDocumentRequirementDefaultConfidentialAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementDefaultConfidentialAccess` ADD CONSTRAINT `ProjectSetupDocumentRequirementDefaultConfidentialAccess_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementOverrideConfidentialAccess` ADD CONSTRAINT `ProjectSetupDocumentRequirementOverrideConfidentialAccess_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `ProjectSetupDocumentRequirementOverride`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementOverrideConfidentialAccess` ADD CONSTRAINT `ProjectSetupDocumentRequirementOverrideConfidentialAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectSetupDocumentRequirementOverrideConfidentialAccess` ADD CONSTRAINT `ProjectSetupDocumentRequirementOverrideConfidentialAccess_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

