CREATE TABLE `CrmTenderSequence` (
  `year` INT NOT NULL,
  `lastNumber` INT NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

