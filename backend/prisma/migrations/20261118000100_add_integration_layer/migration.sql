-- Integration Layer Migration
-- Adds ApiKey, ExternalReference, WebhookEndpoint, IntegrationEvent, WebhookDelivery
-- Enables machine-to-machine (ERP / WMS / PMS / Sales) integration with the DMS.

-- ============================================================
-- ENUM: IntegrationEventStatus
-- ============================================================
CREATE TABLE IF NOT EXISTS `_enum_IntegrationEventStatus` (
  `IntegrationEventStatus` ENUM('PENDING','DISPATCHED','FAILED','DEAD_LETTER') NOT NULL,
  PRIMARY KEY (`IntegrationEventStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ENUM: WebhookDeliveryStatus
-- ============================================================
CREATE TABLE IF NOT EXISTS `_enum_WebhookDeliveryStatus` (
  `WebhookDeliveryStatus` ENUM('PENDING','SUCCESS','FAILED','DEAD_LETTER') NOT NULL,
  PRIMARY KEY (`WebhookDeliveryStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: ApiKey
-- ============================================================
CREATE TABLE `ApiKey` (
  `id`           INT NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(191) NOT NULL,
  `keyPrefix`    VARCHAR(191) NOT NULL,
  `keyHash`      VARCHAR(191) NOT NULL,
  `signingSecret` TEXT NULL,
  `system`       VARCHAR(191) NOT NULL DEFAULT 'CUSTOM',
  `scopes`       JSON NULL,
  `description`  TEXT NULL,
  `isActive`     TINYINT(1) NOT NULL DEFAULT 1,
  `expiresAt`    DATETIME(3) NULL,
  `lastUsedAt`   DATETIME(3) NULL,
  `lastUsedIp`   VARCHAR(191) NULL,
  `requestCount` INT NOT NULL DEFAULT 0,
  `createdById`  INT NULL,
  `revokedAt`    DATETIME(3) NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ApiKey_keyPrefix_key` (`keyPrefix`),
  UNIQUE INDEX `ApiKey_keyHash_key` (`keyHash`),
  INDEX `ApiKey_system_idx` (`system`),
  INDEX `ApiKey_isActive_idx` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: ExternalReference
-- ============================================================
CREATE TABLE `ExternalReference` (
  `id`           INT NOT NULL AUTO_INCREMENT,
  `system`       VARCHAR(191) NOT NULL,
  `entityType`   VARCHAR(191) NOT NULL,
  `entityId`     INT NOT NULL,
  `externalType` VARCHAR(191) NOT NULL,
  `externalId`   VARCHAR(191) NOT NULL,
  `externalUrl`  TEXT NULL,
  `metadata`     JSON NULL,
  `createdById`  INT NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ExternalReference_system_externalType_externalId_key` (`system`,`externalType`,`externalId`),
  INDEX `ExternalReference_entityType_entityId_idx` (`entityType`,`entityId`),
  INDEX `ExternalReference_system_entityType_idx` (`system`,`entityType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: WebhookEndpoint
-- ============================================================
CREATE TABLE `WebhookEndpoint` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(191) NOT NULL,
  `system`        VARCHAR(191) NOT NULL DEFAULT 'CUSTOM',
  `url`           TEXT NOT NULL,
  `secret`        TEXT NOT NULL,
  `events`        JSON NOT NULL,
  `customHeaders` JSON NULL,
  `isActive`      TINYINT(1) NOT NULL DEFAULT 1,
  `description`   TEXT NULL,
  `maxAttempts`   INT NOT NULL DEFAULT 6,
  `lastSuccessAt` DATETIME(3) NULL,
  `lastFailureAt` DATETIME(3) NULL,
  `failureCount`  INT NOT NULL DEFAULT 0,
  `createdById`   INT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `WebhookEndpoint_isActive_idx` (`isActive`),
  INDEX `WebhookEndpoint_system_idx` (`system`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: IntegrationEvent
-- ============================================================
CREATE TABLE `IntegrationEvent` (
  `id`           VARCHAR(191) NOT NULL,
  `type`         VARCHAR(191) NOT NULL,
  `system`       VARCHAR(191) NULL,
  `entityType`   VARCHAR(191) NULL,
  `entityId`     INT NULL,
  `payload`      JSON NOT NULL,
  `status`       ENUM('PENDING','DISPATCHED','FAILED','DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
  `attempts`     INT NOT NULL DEFAULT 0,
  `lastError`    TEXT NULL,
  `availableAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `occurredAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `dispatchedAt` DATETIME(3) NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `IntegrationEvent_status_availableAt_idx` (`status`,`availableAt`),
  INDEX `IntegrationEvent_type_idx` (`type`),
  INDEX `IntegrationEvent_entityType_entityId_idx` (`entityType`,`entityId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: WebhookDelivery
-- ============================================================
CREATE TABLE `WebhookDelivery` (
  `id`           VARCHAR(191) NOT NULL,
  `eventId`      VARCHAR(191) NOT NULL,
  `endpointId`   INT NOT NULL,
  `status`       ENUM('PENDING','SUCCESS','FAILED','DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
  `attempts`     INT NOT NULL DEFAULT 0,
  `maxAttempts`  INT NOT NULL DEFAULT 6,
  `responseCode` INT NULL,
  `responseBody` TEXT NULL,
  `lastError`    TEXT NULL,
  `availableAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deliveredAt`  DATETIME(3) NULL,
  `createdAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `WebhookDelivery_eventId_endpointId_key` (`eventId`,`endpointId`),
  INDEX `WebhookDelivery_status_availableAt_idx` (`status`,`availableAt`),
  INDEX `WebhookDelivery_eventId_idx` (`eventId`),
  INDEX `WebhookDelivery_endpointId_idx` (`endpointId`),

  CONSTRAINT `WebhookDelivery_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `IntegrationEvent`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `WebhookDelivery_endpointId_fkey` FOREIGN KEY (`endpointId`) REFERENCES `WebhookEndpoint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
