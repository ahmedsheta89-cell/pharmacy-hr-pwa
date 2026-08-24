CREATE TABLE `attendanceImportBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`sourceFileName` varchar(255) NOT NULL,
	`sourceFormat` enum('xlsx','csv') NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`status` enum('draft','applied','rejected') NOT NULL DEFAULT 'draft',
	`totalRows` int NOT NULL DEFAULT 0,
	`acceptedRows` int NOT NULL DEFAULT 0,
	`rejectedRows` int NOT NULL DEFAULT 0,
	`issueSummary` json NOT NULL,
	`importedByUserId` int,
	`appliedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendanceImportBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendanceImportRows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`employeeId` int,
	`employeeCode` varchar(64) NOT NULL,
	`workDate` date,
	`checkInAt` timestamp,
	`checkOutAt` timestamp,
	`workedMinutes` int NOT NULL DEFAULT 0,
	`lateMinutes` int NOT NULL DEFAULT 0,
	`earlyLeaveMinutes` int NOT NULL DEFAULT 0,
	`overtimeMinutes` int NOT NULL DEFAULT 0,
	`status` enum('valid','invalid','applied','skipped') NOT NULL,
	`issueCodes` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendanceImportRows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendanceRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`metric` enum('late_minutes','late_occurrences','absence_days','early_leave_minutes','overtime_minutes') NOT NULL,
	`threshold` int NOT NULL DEFAULT 0,
	`direction` enum('at_least','at_most') NOT NULL DEFAULT 'at_least',
	`adjustmentType` enum('reward','penalty') NOT NULL,
	`amountMode` enum('fixed','per_unit','daily_rate_percentage') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`maximumAmount` decimal(12,2),
	`requiresApproval` enum('yes','no') NOT NULL DEFAULT 'yes',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`effectiveFrom` date NOT NULL,
	`effectiveTo` date,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendanceRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payrollAdjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payrollRunId` int,
	`branchId` int NOT NULL,
	`employeeId` int NOT NULL,
	`attendanceRuleId` int,
	`adjustmentType` enum('reward','penalty') NOT NULL,
	`source` enum('automatic_rule','manual') NOT NULL,
	`status` enum('pending','approved','rejected','applied') NOT NULL DEFAULT 'pending',
	`amount` decimal(12,2) NOT NULL,
	`metricValue` int NOT NULL DEFAULT 0,
	`occurrenceDate` date,
	`description` text NOT NULL,
	`requestedByUserId` int,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`appliedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payrollAdjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD `importBatchId` int;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD `earlyLeaveMinutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD `overtimeMinutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD `source` enum('self_service','import','manual') DEFAULT 'self_service' NOT NULL;--> statement-breakpoint
ALTER TABLE `payrollItems` ADD `rewardsTotal` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payrollItems` ADD `penaltiesTotal` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `payrollItems` ADD `attendanceCompliancePercentage` decimal(5,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendanceImportBatches` ADD CONSTRAINT `attendanceImportBatches_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceImportBatches` ADD CONSTRAINT `attendanceImportBatches_importedByUserId_users_id_fk` FOREIGN KEY (`importedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceImportRows` ADD CONSTRAINT `attendanceImportRows_batchId_attendanceImportBatches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `attendanceImportBatches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceImportRows` ADD CONSTRAINT `attendanceImportRows_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceRules` ADD CONSTRAINT `attendanceRules_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceRules` ADD CONSTRAINT `attendanceRules_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustments` ADD CONSTRAINT `payrollAdjustments_payrollRunId_payrollRuns_id_fk` FOREIGN KEY (`payrollRunId`) REFERENCES `payrollRuns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustments` ADD CONSTRAINT `payrollAdjustments_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustments` ADD CONSTRAINT `payrollAdjustments_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustments` ADD CONSTRAINT `payrollAdjustments_attendanceRuleId_attendanceRules_id_fk` FOREIGN KEY (`attendanceRuleId`) REFERENCES `attendanceRules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustments` ADD CONSTRAINT `payrollAdjustments_requestedByUserId_users_id_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollAdjustments` ADD CONSTRAINT `payrollAdjustments_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_import_batch_branch_period_idx` ON `attendanceImportBatches` (`branchId`,`periodStart`,`periodEnd`);--> statement-breakpoint
CREATE INDEX `attendance_import_batch_status_idx` ON `attendanceImportBatches` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `attendance_import_rows_batch_idx` ON `attendanceImportRows` (`batchId`,`status`);--> statement-breakpoint
CREATE INDEX `attendance_import_rows_employee_date_idx` ON `attendanceImportRows` (`employeeId`,`workDate`);--> statement-breakpoint
CREATE INDEX `attendance_rules_branch_active_idx` ON `attendanceRules` (`branchId`,`isActive`);--> statement-breakpoint
CREATE INDEX `attendance_rules_branch_metric_idx` ON `attendanceRules` (`branchId`,`metric`);--> statement-breakpoint
CREATE INDEX `payroll_adjustments_employee_status_idx` ON `payrollAdjustments` (`employeeId`,`status`);--> statement-breakpoint
CREATE INDEX `payroll_adjustments_branch_period_idx` ON `payrollAdjustments` (`branchId`,`occurrenceDate`);--> statement-breakpoint
CREATE INDEX `payroll_adjustments_run_idx` ON `payrollAdjustments` (`payrollRunId`);--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD CONSTRAINT `attendanceRecords_importBatchId_attendanceImportBatches_id_fk` FOREIGN KEY (`importBatchId`) REFERENCES `attendanceImportBatches`(`id`) ON DELETE set null ON UPDATE no action;