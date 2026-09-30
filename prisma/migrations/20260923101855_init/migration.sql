-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "Division" AS ENUM ('SALES', 'ENGINEER', 'UMUM');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'RESIGNED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "FamilyRelation" AS ENUM ('SPOUSE', 'CHILD');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('EMPLOYEE', 'FAMILY', 'CANDIDATE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('KTP', 'KK', 'NPWP', 'PAS_FOTO', 'SIM', 'BPJS_TK', 'BPJS_KES', 'IJAZAH_TRANSKRIP', 'SKCK', 'SURAT_NIKAH_CERAI', 'KTP_PASANGAN', 'AKTE_KELAHIRAN_ANAK', 'OTHER');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('PROFESSIONAL', 'IJAZAH');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('DEMO_UNIT', 'BACKUP_UNIT', 'INVENTORY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CC');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('RUNNING', 'NEW_ACQUISITION');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('APPLIED', 'INTERVIEW', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalModule" AS ENUM ('REIMBURSE', 'LEAVE', 'HEALTH', 'EXPENSE', 'REVENUE');

-- CreateEnum
CREATE TYPE "FlowScope" AS ENUM ('REGULAR', 'FALLBACK');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'SKIPPED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "employeeId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "nik" VARCHAR(16) NOT NULL,
    "kkNo" VARCHAR(16),
    "fullName" TEXT NOT NULL,
    "birthPlace" TEXT,
    "birthDate" DATE,
    "gender" "Gender",
    "maritalStatus" "MaritalStatus" NOT NULL DEFAULT 'SINGLE',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "npwp" VARCHAR(16),
    "bpjsTkNo" TEXT,
    "bpjsKesNo" TEXT,
    "division" "Division" NOT NULL,
    "position" TEXT NOT NULL,
    "level" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "skipApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentPeriod" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "endReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "relation" "FamilyRelation" NOT NULL,
    "fullName" TEXT NOT NULL,
    "nik" VARCHAR(16),
    "birthDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "employeeId" TEXT,
    "familyMemberId" TEXT,
    "candidateId" TEXT,
    "docType" "DocumentType" NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "number" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "supportStart" DATE,
    "supportEnd" DATE,
    "warrantyStart" DATE,
    "warrantyEnd" DATE,
    "warrantyNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" DATE NOT NULL,
    "returnedAt" DATE,
    "note" TEXT,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectExpense" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRevenue" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimburseType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "division" "Division" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReimburseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reimbursement" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "division" "Division" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCash" BIGINT NOT NULL DEFAULT 0,
    "totalCc" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimbursementItem" (
    "id" TEXT NOT NULL,
    "reimbursementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "customerId" TEXT,
    "projectId" TEXT,
    "activity" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "hasReceipt" BOOLEAN NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "receiptFileKey" TEXT,
    "receiptFileName" TEXT,

    CONSTRAINT "ReimbursementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "minYears" INTEGER NOT NULL,
    "maxYears" INTEGER,
    "days" INTEGER NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "entitlement" INTEGER NOT NULL,
    "carriedOver" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "isNational" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HealthCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPlafond" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "annualAmount" BIGINT NOT NULL,
    "monthlyAmount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPlafond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthClaim" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "claimDate" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "invoiceFileKey" TEXT NOT NULL,
    "invoiceFileName" TEXT NOT NULL,
    "note" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthPayout" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodMonth" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "HealthPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nik" VARCHAR(16),
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "appliedPosition" TEXT NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,
    "convertedEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalFlow" (
    "id" TEXT NOT NULL,
    "module" "ApprovalModule",
    "division" "Division",
    "scope" "FlowScope" NOT NULL DEFAULT 'REGULAR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApprovalFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalFlowStep" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "ApprovalFlowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStepApprover" (
    "stepId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ApprovalStepApprover_pkey" PRIMARY KEY ("stepId","userId")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "module" "ApprovalModule" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityNumber" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "currentLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequestStep" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverIds" TEXT[],
    "status" "StepStatus" NOT NULL DEFAULT 'WAITING',
    "actedById" TEXT,
    "actedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "ApprovalRequestStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("prefix","year","month")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNo_key" ON "Employee"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_nik_key" ON "Employee"("nik");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_status_division_idx" ON "Employee"("status", "division");

-- CreateIndex
CREATE INDEX "EmploymentPeriod_employeeId_startDate_idx" ON "EmploymentPeriod"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "Document_employeeId_docType_idx" ON "Document"("employeeId", "docType");

-- CreateIndex
CREATE INDEX "Document_candidateId_idx" ON "Document"("candidateId");

-- CreateIndex
CREATE INDEX "Certificate_endDate_idx" ON "Certificate"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_serialNo_key" ON "Asset"("serialNo");

-- CreateIndex
CREATE INDEX "AssetAssignment_assetId_returnedAt_idx" ON "AssetAssignment"("assetId", "returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_customerId_name_key" ON "Project"("customerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExpense_number_key" ON "ProjectExpense"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRevenue_number_key" ON "ProjectRevenue"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ReimburseType_code_key" ON "ReimburseType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Reimbursement_number_key" ON "Reimbursement"("number");

-- CreateIndex
CREATE INDEX "Reimbursement_employeeId_status_idx" ON "Reimbursement"("employeeId", "status");

-- CreateIndex
CREATE INDEX "ReimbursementItem_projectId_idx" ON "ReimbursementItem"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_periodStart_key" ON "LeaveBalance"("employeeId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_number_key" ON "LeaveRequest"("number");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_status_idx" ON "LeaveRequest"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCategory_name_key" ON "HealthCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPlafond_employeeId_year_key" ON "HealthPlafond"("employeeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "HealthClaim_number_key" ON "HealthClaim"("number");

-- CreateIndex
CREATE INDEX "HealthClaim_employeeId_status_idx" ON "HealthClaim"("employeeId", "status");

-- CreateIndex
CREATE INDEX "HealthPayout_employeeId_periodMonth_idx" ON "HealthPayout"("employeeId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_convertedEmployeeId_key" ON "Candidate"("convertedEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalFlowStep_flowId_level_key" ON "ApprovalFlowStep"("flowId", "level");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_module_entityId_key" ON "ApprovalRequest"("module", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequestStep_requestId_level_key" ON "ApprovalRequestStep"("requestId", "level");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentPeriod" ADD CONSTRAINT "EmploymentPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExpense" ADD CONSTRAINT "ProjectExpense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevenue" ADD CONSTRAINT "ProjectRevenue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reimbursement" ADD CONSTRAINT "Reimbursement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementItem" ADD CONSTRAINT "ReimbursementItem_reimbursementId_fkey" FOREIGN KEY ("reimbursementId") REFERENCES "Reimbursement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementItem" ADD CONSTRAINT "ReimbursementItem_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementItem" ADD CONSTRAINT "ReimbursementItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementItem" ADD CONSTRAINT "ReimbursementItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ReimburseType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPlafond" ADD CONSTRAINT "HealthPlafond_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClaim" ADD CONSTRAINT "HealthClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthClaim" ADD CONSTRAINT "HealthClaim_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HealthCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthPayout" ADD CONSTRAINT "HealthPayout_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "HealthClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_convertedEmployeeId_fkey" FOREIGN KEY ("convertedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalFlowStep" ADD CONSTRAINT "ApprovalFlowStep_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ApprovalFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStepApprover" ADD CONSTRAINT "ApprovalStepApprover_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ApprovalFlowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStepApprover" ADD CONSTRAINT "ApprovalStepApprover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequestStep" ADD CONSTRAINT "ApprovalRequestStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequestStep" ADD CONSTRAINT "ApprovalRequestStep_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
