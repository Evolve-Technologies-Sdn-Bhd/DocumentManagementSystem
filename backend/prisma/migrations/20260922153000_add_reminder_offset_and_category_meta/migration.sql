-- AlterCalendarCustomEvent: Add reminderOffset + categoryMeta

ALTER TABLE `CalendarCustomEvent`
  ADD COLUMN `reminderOffset` VARCHAR(32) NULL,
  ADD COLUMN `categoryMeta` JSON NULL;
