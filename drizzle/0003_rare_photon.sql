CREATE TABLE `accountLinkLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`userId` int,
	`branchId` int NOT NULL,
	`action` enum('linked','unlinked') NOT NULL,
	`source` enum('owner_direct','owner_approved_request','owner_self_setup') NOT NULL,
	`requestId` int,
	`actorUserId` int,
	`actorName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accountLinkLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accountLinkRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`userId` int NOT NULL,
	`branchId` int NOT NULL,
	`requestedByUserId` int NOT NULL,
	`requestedByName` varchar(160),
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`reviewedByUserId` int,
	`reviewedByName` varchar(160),
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accountLinkRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accountLinkLogs` ADD CONSTRAINT `accountLinkLogs_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkLogs` ADD CONSTRAINT `accountLinkLogs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkLogs` ADD CONSTRAINT `accountLinkLogs_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkLogs` ADD CONSTRAINT `accountLinkLogs_requestId_accountLinkRequests_id_fk` FOREIGN KEY (`requestId`) REFERENCES `accountLinkRequests`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkLogs` ADD CONSTRAINT `accountLinkLogs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkRequests` ADD CONSTRAINT `accountLinkRequests_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkRequests` ADD CONSTRAINT `accountLinkRequests_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkRequests` ADD CONSTRAINT `accountLinkRequests_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkRequests` ADD CONSTRAINT `accountLinkRequests_requestedByUserId_users_id_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accountLinkRequests` ADD CONSTRAINT `accountLinkRequests_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `accountLinkLogs_employee_created_idx` ON `accountLinkLogs` (`employeeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `accountLinkLogs_user_created_idx` ON `accountLinkLogs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `accountLinkLogs_branch_created_idx` ON `accountLinkLogs` (`branchId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `accountLinkRequests_status_created_idx` ON `accountLinkRequests` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `accountLinkRequests_branch_status_idx` ON `accountLinkRequests` (`branchId`,`status`);--> statement-breakpoint
CREATE INDEX `accountLinkRequests_employee_status_idx` ON `accountLinkRequests` (`employeeId`,`status`);