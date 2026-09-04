-- CreateTable
CREATE TABLE `CrmTenderEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `clientName` VARCHAR(255) NULL,
    `status` ENUM('IN_PROGRESS', 'WON', 'LOST') NOT NULL DEFAULT 'IN_PROGRESS',
    `tenderValueCents` INTEGER NOT NULL DEFAULT 0,
    `estimatedProfitCents` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CrmTenderEntry_status_idx`(`status`),
    INDEX `CrmTenderEntry_createdById_idx`(`createdById`),
    INDEX `CrmTenderEntry_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CrmFbEnquiryEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `enquiryDate` DATETIME(3) NOT NULL,
    `email` VARCHAR(255) NULL,
    `company` VARCHAR(255) NULL,
    `contact` VARCHAR(255) NULL,
    `location` VARCHAR(255) NULL,
    `channel` VARCHAR(255) NULL,
    `industryType` VARCHAR(255) NULL,
    `interestedProduct` VARCHAR(255) NULL,
    `painPoint` TEXT NULL,
    `status` ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTATION_PROVIDED', 'CONVERTED') NOT NULL DEFAULT 'NEW',
    `potentialValueCents` INTEGER NOT NULL DEFAULT 0,
    `documentLink` VARCHAR(255) NULL,
    `followUpNotes` TEXT NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CrmFbEnquiryEntry_status_idx`(`status`),
    INDEX `CrmFbEnquiryEntry_enquiryDate_idx`(`enquiryDate`),
    INDEX `CrmFbEnquiryEntry_createdById_idx`(`createdById`),
    INDEX `CrmFbEnquiryEntry_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CrmTenderEntry` ADD CONSTRAINT `CrmTenderEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CrmFbEnquiryEntry` ADD CONSTRAINT `CrmFbEnquiryEntry_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
