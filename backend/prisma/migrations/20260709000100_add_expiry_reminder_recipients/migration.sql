-- CreateTable
CREATE TABLE `DocumentExpiryReminderRecipient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `expiryProfileId` INTEGER NOT NULL,
    `reminderLevel` ENUM('REMINDER_1', 'REMINDER_2', 'REMINDER_3', 'REMINDER_4') NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DERR_profile_level_user_key`(`expiryProfileId`, `reminderLevel`, `userId`),
    INDEX `DocumentExpiryReminderRecipient_expiryProfileId_idx`(`expiryProfileId`),
    INDEX `DocumentExpiryReminderRecipient_reminderLevel_idx`(`reminderLevel`),
    INDEX `DocumentExpiryReminderRecipient_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill legacy expiry watchers into all reminder levels
INSERT INTO `DocumentExpiryReminderRecipient` (`expiryProfileId`, `reminderLevel`, `userId`, `createdById`, `createdAt`)
SELECT `expiryProfileId`, 'REMINDER_1', `userId`, `createdById`, `createdAt`
FROM `DocumentExpiryWatcher`;

INSERT INTO `DocumentExpiryReminderRecipient` (`expiryProfileId`, `reminderLevel`, `userId`, `createdById`, `createdAt`)
SELECT `expiryProfileId`, 'REMINDER_2', `userId`, `createdById`, `createdAt`
FROM `DocumentExpiryWatcher`;

INSERT INTO `DocumentExpiryReminderRecipient` (`expiryProfileId`, `reminderLevel`, `userId`, `createdById`, `createdAt`)
SELECT `expiryProfileId`, 'REMINDER_3', `userId`, `createdById`, `createdAt`
FROM `DocumentExpiryWatcher`;

INSERT INTO `DocumentExpiryReminderRecipient` (`expiryProfileId`, `reminderLevel`, `userId`, `createdById`, `createdAt`)
SELECT `expiryProfileId`, 'REMINDER_4', `userId`, `createdById`, `createdAt`
FROM `DocumentExpiryWatcher`;

-- AddForeignKey
ALTER TABLE `DocumentExpiryReminderRecipient`
    ADD CONSTRAINT `DocumentExpiryReminderRecipient_expiryProfileId_fkey`
    FOREIGN KEY (`expiryProfileId`) REFERENCES `DocumentExpiryProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentExpiryReminderRecipient`
    ADD CONSTRAINT `DocumentExpiryReminderRecipient_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
