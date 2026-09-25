-- Calendar Module Migration
-- Adds CalendarEvent, CalendarCustomEvent, CalendarEventReminder, UserCalendarPreference tables

-- ============================================================
-- ENUM: CalendarEventSource
-- ============================================================
CREATE TABLE IF NOT EXISTS `_enum_CalendarEventSource` (
  `CalendarEventSource` ENUM(
    'DOCUMENT_EXPIRY','DOCUMENT_EXPIRY_REMINDER','DOCUMENT_SHARE_EXPIRY',
    'PROJECT_START','PROJECT_COMPLETION','PROJECT_ITEM_DUE',
    'ITERATION_START','ITERATION_END','CHANGE_REQUEST_APPROVED',
    'ASSIGNMENT_CREATED','WORKFLOW_SLA_DUE','DOCUMENT_DATE',
    'PUBLISHED_DATE','OBSOLETE_DATE','VERSION_REQUEST_TARGET',
    'TENDER_SUBMISSION_DEADLINE','TENDER_FOLLOW_UP','TENDER_FOLLOW_UP_LOG',
    'FB_ENQUIRY_DATE','FB_FOLLOW_UP','FB_FOLLOW_UP_LOG','CUSTOM'
  ) NOT NULL,
  PRIMARY KEY (`CalendarEventSource`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ENUM: CalendarEventCategory
-- ============================================================
CREATE TABLE IF NOT EXISTS `_enum_CalendarEventCategory` (
  `CalendarEventCategory` ENUM(
    'CRITICAL','DEADLINE','WARNING','TASK','MILESTONE','INFO','CUSTOM'
  ) NOT NULL,
  PRIMARY KEY (`CalendarEventCategory`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ENUM: ReminderDeliveryType
-- ============================================================
CREATE TABLE IF NOT EXISTS `_enum_ReminderDeliveryType` (
  `ReminderDeliveryType` ENUM('IN_APP','EMAIL','SMS') NOT NULL,
  PRIMARY KEY (`ReminderDeliveryType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: CalendarEvent
-- ============================================================
CREATE TABLE `CalendarEvent` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(512) NOT NULL,
  `description` TEXT NULL,
  `startDateTime` DATETIME(3) NOT NULL,
  `endDateTime` DATETIME(3) NULL,
  `isAllDay` TINYINT(1) NOT NULL DEFAULT 1,

  `sourceType` ENUM(
    'DOCUMENT_EXPIRY','DOCUMENT_EXPIRY_REMINDER','DOCUMENT_SHARE_EXPIRY',
    'PROJECT_START','PROJECT_COMPLETION','PROJECT_ITEM_DUE',
    'ITERATION_START','ITERATION_END','CHANGE_REQUEST_APPROVED',
    'ASSIGNMENT_CREATED','WORKFLOW_SLA_DUE','DOCUMENT_DATE',
    'PUBLISHED_DATE','OBSOLETE_DATE','VERSION_REQUEST_TARGET',
    'TENDER_SUBMISSION_DEADLINE','TENDER_FOLLOW_UP','TENDER_FOLLOW_UP_LOG',
    'FB_ENQUIRY_DATE','FB_FOLLOW_UP','FB_FOLLOW_UP_LOG','CUSTOM'
  ) NOT NULL,
  `sourceDocumentId` INT NULL,
  `sourceProjectId` INT NULL,
  `sourceProjectItemId` INT NULL,
  `sourceProjectIterationId` INT NULL,
  `sourceChangeRequestId` INT NULL,
  `sourceTenderId` INT NULL,
  `sourceTenderFollowUpLogId` INT NULL,
  `sourceFbEnquiryId` INT NULL,
  `sourceFbFollowUpLogId` INT NULL,
  `sourceVersionRequestId` INT NULL,
  `sourceShareLinkId` INT NULL,
  `sourceCustomId` INT NULL,

  `category` ENUM('CRITICAL','DEADLINE','WARNING','TASK','MILESTONE','INFO','CUSTOM') NOT NULL,
  `priority` INT NOT NULL DEFAULT 0,

  `userId` INT NULL,
  `assigneeId` INT NULL,

  `isSynthetic` TINYINT(1) NOT NULL DEFAULT 0,
  `sourceLastHash` VARCHAR(128) NULL,
  `lastSyncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `CalendarEvent_startDateTime_idx` (`startDateTime`),
  INDEX `CalendarEvent_endDateTime_idx` (`endDateTime`),
  INDEX `CalendarEvent_sourceType_idx` (`sourceType`),
  INDEX `CalendarEvent_category_idx` (`category`),
  INDEX `CalendarEvent_userId_idx` (`userId`),
  INDEX `CalendarEvent_assigneeId_idx` (`assigneeId`),
  INDEX `CalendarEvent_sourceDocumentId_idx` (`sourceDocumentId`),
  INDEX `CalendarEvent_sourceProjectId_idx` (`sourceProjectId`),
  INDEX `CalendarEvent_isSynthetic_idx` (`isSynthetic`),

  CONSTRAINT `CalendarEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `CalendarEvent_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: CalendarCustomEvent
-- ============================================================
CREATE TABLE `CalendarCustomEvent` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `calendarEventId` INT NOT NULL,
  `recurrenceRule` VARCHAR(512) NULL,
  `colorOverride` VARCHAR(32) NULL,
  `location` VARCHAR(512) NULL,
  `createdById` INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `CalendarCustomEvent_calendarEventId_key` (`calendarEventId`),

  CONSTRAINT `CalendarCustomEvent_calendarEventId_fkey` FOREIGN KEY (`calendarEventId`) REFERENCES `CalendarEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CalendarCustomEvent_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: CalendarEventReminder
-- ============================================================
CREATE TABLE `CalendarEventReminder` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `calendarEventId` INT NOT NULL,
  `userId` INT NOT NULL,
  `reminderType` ENUM('IN_APP','EMAIL','SMS') NOT NULL DEFAULT 'IN_APP',
  `offsetMinutes` INT NOT NULL,
  `delivered` TINYINT(1) NOT NULL DEFAULT 0,
  `deliveredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `cal_rem_evt_user_type_off_uniq` (`calendarEventId`,`userId`,`reminderType`,`offsetMinutes`),
  INDEX `CalendarEventReminder_userId_idx` (`userId`),
  INDEX `CalendarEventReminder_delivered_idx` (`delivered`),
  INDEX `CalendarEventReminder_calendarEventId_idx` (`calendarEventId`),

  CONSTRAINT `CalendarEventReminder_calendarEventId_fkey` FOREIGN KEY (`calendarEventId`) REFERENCES `CalendarEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `CalendarEventReminder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: UserCalendarPreference
-- ============================================================
CREATE TABLE `UserCalendarPreference` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `defaultView` VARCHAR(16) NOT NULL DEFAULT 'month',
  `workdayStart` INT NOT NULL DEFAULT 9,
  `workdayEnd` INT NOT NULL DEFAULT 18,
  `weekendDays` JSON NULL,
  `showDeclined` TINYINT(1) NOT NULL DEFAULT 0,
  `showPastEvents` TINYINT(1) NOT NULL DEFAULT 1,
  `categoryColorOverrides` JSON NULL,
  `sourceTypeVisibility` JSON NULL,
  `hideWeekends` TINYINT(1) NOT NULL DEFAULT 0,
  `weekStartsOn` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `UserCalendarPreference_userId_key` (`userId`),

  CONSTRAINT `UserCalendarPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
