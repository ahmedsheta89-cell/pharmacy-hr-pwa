CREATE TABLE `attendanceImportExceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`employeeId` int NOT NULL,
	`workDate` date NOT NULL,
	`treatment` enum('approved_normal','approved_alternative','hourly_review','overtime_review','unapproved_shortfall','exclude_from_analysis') NOT NULL,
	`operationalStatus` enum('resolved','pending_review','excluded') NOT NULL,
	`shiftStart` time,
	`shiftEnd` time,
	`breakMinutes` int,
	`graceMinutes` int,
	`decisionNote` text,
	`decidedByUserId` int,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendanceImportExceptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_import_exception_employee_date_unique` UNIQUE(`employeeId`,`workDate`)
);
--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD `scheduledMinutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD `analysisTreatment` enum('scheduled','approved_normal','approved_alternative','hourly_review','overtime_review','unapproved_shortfall','exclude_from_analysis') DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD `analysisSchedule` json;--> statement-breakpoint
ALTER TABLE `attendanceImportExceptions` ADD CONSTRAINT `attendanceImportExceptions_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceImportExceptions` ADD CONSTRAINT `attendanceImportExceptions_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceImportExceptions` ADD CONSTRAINT `attendanceImportExceptions_decidedByUserId_users_id_fk` FOREIGN KEY (`decidedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_import_exception_branch_date_idx` ON `attendanceImportExceptions` (`branchId`,`workDate`);--> statement-breakpoint
CREATE INDEX `attendance_import_exception_branch_status_idx` ON `attendanceImportExceptions` (`branchId`,`operationalStatus`);