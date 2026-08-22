CREATE TABLE `employeeAuditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`branchId` int NOT NULL,
	`actorUserId` int,
	`actorName` varchar(160),
	`action` enum('created','updated','archived','restored') NOT NULL,
	`changes` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `employeeAuditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employeeAuditLogs` ADD CONSTRAINT `employeeAuditLogs_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employeeAuditLogs` ADD CONSTRAINT `employeeAuditLogs_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employeeAuditLogs` ADD CONSTRAINT `employeeAuditLogs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `employeeAuditLogs_employee_created_idx` ON `employeeAuditLogs` (`employeeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `employeeAuditLogs_branch_created_idx` ON `employeeAuditLogs` (`branchId`,`createdAt`);