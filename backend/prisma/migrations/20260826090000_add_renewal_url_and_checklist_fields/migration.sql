-- Migration: Add renewal URL and checklist fields for expiry tracking module
-- Date: 2026-08-26
-- Tables affected: DocumentType, DocumentExpiryProfile, DocumentExpiryRenewalHistory

DELIMITER //

DROP PROCEDURE IF EXISTS `add_column_if_not_exists`//

CREATE PROCEDURE `add_column_if_not_exists`(
    IN p_table_name VARCHAR(128),
    IN p_column_name VARCHAR(128),
    IN p_column_definition TEXT
)
BEGIN
    DECLARE col_exists INT;

    SELECT COUNT(*)
    INTO col_exists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_column_name;

    IF col_exists = 0 THEN
        SET @sql = CONCAT(
            'ALTER TABLE `',
            p_table_name,
            '` ADD COLUMN `',
            p_column_name,
            '` ',
            p_column_definition
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//

DELIMITER ;

-- 1) DocumentType: renewal portal URL and default renewal checklist items
CALL add_column_if_not_exists(
    'DocumentType',
    'renewalUrl',
    'VARCHAR(1024) NULL COMMENT "Default renewal portal URL for documents of this type"'
);

CALL add_column_if_not_exists(
    'DocumentType',
    'defaultRenewalChecklist',
    'JSON NULL COMMENT "Default checklist items required when renewing documents of this type"'
);

-- 2) DocumentExpiryProfile: per-document-profile renewal URL and checklist
CALL add_column_if_not_exists(
    'DocumentExpiryProfile',
    'renewalUrl',
    'VARCHAR(1024) NULL COMMENT "Renewal portal URL for the specific document"'
);

CALL add_column_if_not_exists(
    'DocumentExpiryProfile',
    'defaultChecklistItems',
    'JSON NULL COMMENT "Default checklist items required when renewing this document"'
);

-- 3) DocumentExpiryRenewalHistory: snapshot of URL and checklist per renewal action
CALL add_column_if_not_exists(
    'DocumentExpiryRenewalHistory',
    'renewalUrl',
    'VARCHAR(1024) NULL COMMENT "Snapshot of the renewal URL used for this renewal"'
);

CALL add_column_if_not_exists(
    'DocumentExpiryRenewalHistory',
    'checklistItems',
    'JSON NULL COMMENT "Snapshot of the checklist items completed for this renewal"'
);

-- Cleanup
DROP PROCEDURE IF EXISTS `add_column_if_not_exists`;
