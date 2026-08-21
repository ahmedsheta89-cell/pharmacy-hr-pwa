CREATE TABLE `payrollApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payrollRunId` int NOT NULL,
	`approverEmployeeId` int,
	`approvalStage` enum('manager','hr_manager','owner_override') NOT NULL,
	`decision` enum('approved','rejected','returned') NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payrollApprovals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `role` enum('user','admin','owner','manager','hr_manager','pharmacist','employee') NOT NULL DEFAULT 'employee';--> statement-breakpoint
ALTER TABLE `payrollRuns` MODIFY COLUMN `status` enum('draft','pending_manager','pending_hr','approved','rejected','paid') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','owner','manager','hr_manager','pharmacist','employee') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `payrollApprovals` ADD CONSTRAINT `payrollApprovals_payrollRunId_payrollRuns_id_fk` FOREIGN KEY (`payrollRunId`) REFERENCES `payrollRuns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollApprovals` ADD CONSTRAINT `payrollApprovals_approverEmployeeId_employees_id_fk` FOREIGN KEY (`approverEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payroll_approvals_run_stage_idx` ON `payrollApprovals` (`payrollRunId`,`approvalStage`);