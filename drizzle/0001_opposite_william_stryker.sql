CREATE TABLE `attendanceRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`shiftAssignmentId` int,
	`workDate` date NOT NULL,
	`checkInAt` timestamp,
	`checkOutAt` timestamp,
	`checkInLatitude` decimal(10,7),
	`checkInLongitude` decimal(10,7),
	`checkOutLatitude` decimal(10,7),
	`checkOutLongitude` decimal(10,7),
	`checkInPhotoUrl` text,
	`workedMinutes` int NOT NULL DEFAULT 0,
	`lateMinutes` int NOT NULL DEFAULT 0,
	`status` enum('present','late','absent','excused') NOT NULL DEFAULT 'present',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendanceRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_employee_date_unique` UNIQUE(`employeeId`,`workDate`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`code` varchar(32) NOT NULL,
	`address` text,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`geofenceRadiusMeters` int NOT NULL DEFAULT 80,
	`managerEmployeeId` int,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `employeeCertificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`issuer` varchar(180),
	`issuedOn` date,
	`expiresOn` date,
	`documentUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `employeeCertificates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`branchId` int NOT NULL,
	`employeeCode` varchar(32) NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`phone` varchar(32),
	`nationalId` varchar(48),
	`email` varchar(320),
	`jobTitle` varchar(120) NOT NULL,
	`role` enum('user','admin','owner','manager','pharmacist','employee') NOT NULL DEFAULT 'employee',
	`hireDate` date NOT NULL,
	`birthDate` date,
	`address` text,
	`emergencyContactName` varchar(160),
	`emergencyContactPhone` varchar(32),
	`profilePhotoUrl` text,
	`employmentStatus` enum('active','inactive','on_leave') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_employeeCode_unique` UNIQUE(`employeeCode`),
	CONSTRAINT `employees_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `kpiDefinitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`name` varchar(160) NOT NULL,
	`category` enum('sales','operations','service','attendance') NOT NULL,
	`description` text,
	`unit` enum('currency','number','percentage','minutes') NOT NULL,
	`targetValue` decimal(14,2) NOT NULL,
	`weight` decimal(5,2) NOT NULL DEFAULT '1.00',
	`measurementPeriod` enum('daily','weekly','monthly') NOT NULL DEFAULT 'monthly',
	`applicableRoles` json NOT NULL,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpiDefinitions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpiRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`kpiDefinitionId` int NOT NULL,
	`periodStart` date NOT NULL,
	`periodEnd` date NOT NULL,
	`actualValue` decimal(14,2) NOT NULL,
	`targetValue` decimal(14,2) NOT NULL,
	`achievementPercentage` decimal(6,2) NOT NULL,
	`score` decimal(5,2) NOT NULL,
	`recordedByEmployeeId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpiRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `kpi_record_employee_definition_period_unique` UNIQUE(`employeeId`,`kpiDefinitionId`,`periodStart`,`periodEnd`)
);
--> statement-breakpoint
CREATE TABLE `leaveBalances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`year` int NOT NULL,
	`annualEntitlement` decimal(5,2) NOT NULL DEFAULT '21.00',
	`sickEntitlement` decimal(5,2) NOT NULL DEFAULT '0.00',
	`annualUsed` decimal(5,2) NOT NULL DEFAULT '0.00',
	`sickUsed` decimal(5,2) NOT NULL DEFAULT '0.00',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leaveBalances_id` PRIMARY KEY(`id`),
	CONSTRAINT `leave_balance_employee_year_unique` UNIQUE(`employeeId`,`year`)
);
--> statement-breakpoint
CREATE TABLE `leaveRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`leaveType` enum('annual','sick','emergency','unpaid') NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`totalDays` decimal(5,2) NOT NULL,
	`reason` text,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`reviewedByEmployeeId` int,
	`reviewedAt` timestamp,
	`reviewerNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leaveRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`data` json,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payrollItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payrollRunId` int NOT NULL,
	`employeeId` int NOT NULL,
	`basicSalary` decimal(12,2) NOT NULL,
	`totalAllowances` decimal(12,2) NOT NULL DEFAULT '0.00',
	`kpiScore` decimal(5,2) NOT NULL DEFAULT '0.00',
	`kpiBonus` decimal(12,2) NOT NULL DEFAULT '0.00',
	`lateDeduction` decimal(12,2) NOT NULL DEFAULT '0.00',
	`absenceDeduction` decimal(12,2) NOT NULL DEFAULT '0.00',
	`leaveDeduction` decimal(12,2) NOT NULL DEFAULT '0.00',
	`netSalary` decimal(12,2) NOT NULL,
	`calculationSnapshot` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payrollItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_item_run_employee_unique` UNIQUE(`payrollRunId`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `payrollRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`status` enum('draft','approved','paid') NOT NULL DEFAULT 'draft',
	`approvedByEmployeeId` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payrollRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `payroll_run_branch_period_unique` UNIQUE(`branchId`,`year`,`month`)
);
--> statement-breakpoint
CREATE TABLE `performanceReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`reviewerEmployeeId` int NOT NULL,
	`periodLabel` varchar(24) NOT NULL,
	`year` int NOT NULL,
	`overallScore` decimal(5,2) NOT NULL,
	`kpiScore` decimal(5,2) NOT NULL,
	`behaviorScore` decimal(5,2) NOT NULL,
	`developmentScore` decimal(5,2) NOT NULL,
	`strengths` text,
	`improvementAreas` text,
	`nextGoals` json,
	`status` enum('draft','submitted','acknowledged') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performanceReviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `performance_review_employee_period_unique` UNIQUE(`employeeId`,`periodLabel`,`year`)
);
--> statement-breakpoint
CREATE TABLE `salaryStructures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`basicSalary` decimal(12,2) NOT NULL,
	`housingAllowance` decimal(12,2) NOT NULL DEFAULT '0.00',
	`transportationAllowance` decimal(12,2) NOT NULL DEFAULT '0.00',
	`otherAllowances` decimal(12,2) NOT NULL DEFAULT '0.00',
	`maximumKpiBonus` decimal(12,2) NOT NULL DEFAULT '0.00',
	`lateDeductionPerMinute` decimal(10,2) NOT NULL DEFAULT '0.00',
	`effectiveFrom` date NOT NULL,
	`effectiveTo` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salaryStructures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shiftAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`shiftId` int NOT NULL,
	`workDate` date NOT NULL,
	`status` enum('scheduled','completed','cancelled','absent') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shiftAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `shift_assignments_employee_date_unique` UNIQUE(`employeeId`,`workDate`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`startTime` time NOT NULL,
	`endTime` time NOT NULL,
	`graceMinutes` int NOT NULL DEFAULT 10,
	`breakMinutes` int NOT NULL DEFAULT 0,
	`color` varchar(16) NOT NULL DEFAULT '#13A68A',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','owner','manager','pharmacist','employee') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD CONSTRAINT `attendanceRecords_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD CONSTRAINT `attendanceRecords_shiftAssignmentId_shiftAssignments_id_fk` FOREIGN KEY (`shiftAssignmentId`) REFERENCES `shiftAssignments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employeeCertificates` ADD CONSTRAINT `employeeCertificates_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpiDefinitions` ADD CONSTRAINT `kpiDefinitions_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpiRecords` ADD CONSTRAINT `kpiRecords_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpiRecords` ADD CONSTRAINT `kpiRecords_kpiDefinitionId_kpiDefinitions_id_fk` FOREIGN KEY (`kpiDefinitionId`) REFERENCES `kpiDefinitions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpiRecords` ADD CONSTRAINT `kpiRecords_recordedByEmployeeId_employees_id_fk` FOREIGN KEY (`recordedByEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leaveBalances` ADD CONSTRAINT `leaveBalances_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leaveRequests` ADD CONSTRAINT `leaveRequests_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leaveRequests` ADD CONSTRAINT `leaveRequests_reviewedByEmployeeId_employees_id_fk` FOREIGN KEY (`reviewedByEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollItems` ADD CONSTRAINT `payrollItems_payrollRunId_payrollRuns_id_fk` FOREIGN KEY (`payrollRunId`) REFERENCES `payrollRuns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollItems` ADD CONSTRAINT `payrollItems_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollRuns` ADD CONSTRAINT `payrollRuns_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payrollRuns` ADD CONSTRAINT `payrollRuns_approvedByEmployeeId_employees_id_fk` FOREIGN KEY (`approvedByEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performanceReviews` ADD CONSTRAINT `performanceReviews_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performanceReviews` ADD CONSTRAINT `performanceReviews_reviewerEmployeeId_employees_id_fk` FOREIGN KEY (`reviewerEmployeeId`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salaryStructures` ADD CONSTRAINT `salaryStructures_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shiftAssignments` ADD CONSTRAINT `shiftAssignments_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shiftAssignments` ADD CONSTRAINT `shiftAssignments_shiftId_shifts_id_fk` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_date_idx` ON `attendanceRecords` (`workDate`);--> statement-breakpoint
CREATE INDEX `employees_branch_idx` ON `employees` (`branchId`);--> statement-breakpoint
CREATE INDEX `kpi_records_employee_period_idx` ON `kpiRecords` (`employeeId`,`periodStart`);--> statement-breakpoint
CREATE INDEX `leave_requests_employee_status_idx` ON `leaveRequests` (`employeeId`,`status`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`userId`,`readAt`);--> statement-breakpoint
CREATE INDEX `salary_structure_employee_effective_idx` ON `salaryStructures` (`employeeId`,`effectiveFrom`);--> statement-breakpoint
CREATE INDEX `shift_assignments_date_idx` ON `shiftAssignments` (`workDate`);