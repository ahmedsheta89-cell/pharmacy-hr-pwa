CREATE TABLE `attendanceEmployeeSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`employeeId` int NOT NULL,
	`shiftStart` time NOT NULL,
	`shiftEnd` time NOT NULL,
	`breakMinutes` int NOT NULL DEFAULT 0,
	`graceMinutes` int NOT NULL DEFAULT 15,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendanceEmployeeSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_employee_schedule_employee_unique` UNIQUE(`employeeId`)
);
--> statement-breakpoint
ALTER TABLE `attendanceEmployeeSchedules` ADD CONSTRAINT `attendanceEmployeeSchedules_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceEmployeeSchedules` ADD CONSTRAINT `attendanceEmployeeSchedules_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceEmployeeSchedules` ADD CONSTRAINT `attendanceEmployeeSchedules_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_employee_schedule_branch_idx` ON `attendanceEmployeeSchedules` (`branchId`);