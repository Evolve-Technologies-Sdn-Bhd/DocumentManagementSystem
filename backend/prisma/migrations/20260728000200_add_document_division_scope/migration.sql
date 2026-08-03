ALTER TABLE `Document`
    ADD COLUMN `divisionId` INTEGER NULL;

CREATE INDEX `Document_divisionId_idx` ON `Document`(`divisionId`);

ALTER TABLE `Document`
    ADD CONSTRAINT `Document_divisionId_fkey`
    FOREIGN KEY (`divisionId`) REFERENCES `Division`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
