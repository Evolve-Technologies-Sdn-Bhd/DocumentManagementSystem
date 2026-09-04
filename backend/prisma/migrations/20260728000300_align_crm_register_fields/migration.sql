-- Align Tender Book Register fields with approved UI
ALTER TABLE `CrmTenderEntry`
  ADD COLUMN `tenderRefNo` VARCHAR(255) NULL,
  ADD COLUMN `contactPerson` VARCHAR(255) NULL,
  ADD COLUMN `submissionDeadline` DATETIME(3) NULL,
  ADD COLUMN `source` VARCHAR(255) NULL,
  ADD COLUMN `documentLink` VARCHAR(255) NULL;

ALTER TABLE `CrmTenderEntry`
  CHANGE COLUMN `notes` `followUpNotes` TEXT NULL;

UPDATE `CrmTenderEntry`
SET `status` = 'PENDING'
WHERE `status` = 'IN_PROGRESS';

ALTER TABLE `CrmTenderEntry`
  MODIFY COLUMN `status` ENUM('DRAFT', 'SUBMITTED', 'PENDING', 'KIV', 'WON', 'LOST') NOT NULL DEFAULT 'DRAFT';

CREATE INDEX `CrmTenderEntry_tenderRefNo_idx` ON `CrmTenderEntry`(`tenderRefNo`);
CREATE INDEX `CrmTenderEntry_submissionDeadline_idx` ON `CrmTenderEntry`(`submissionDeadline`);
