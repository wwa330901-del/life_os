-- 公司空間拆分（2026-09-29）：移除所有公司空間專屬的資料表/欄位/enum，
-- life_os 之後只作為個人軟體（個人空間 + 行事曆空間）存在。完整版（含公司
-- 空間）保留在 git 分支 archive/company-space-v2.9.36，之後若要重啟公司
-- 那條線，從那個分支挖回來即可。

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyMembership" DROP CONSTRAINT "CompanyMembership_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyMembership" DROP CONSTRAINT "CompanyMembership_rankId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyMembership" DROP CONSTRAINT "CompanyMembership_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyMembership" DROP CONSTRAINT "CompanyMembership_userId_fkey";

-- DropForeignKey
ALTER TABLE "CostControlAdjustment" DROP CONSTRAINT "CostControlAdjustment_rowId_fkey";

-- DropForeignKey
ALTER TABLE "CostControlInitialSheet" DROP CONSTRAINT "CostControlInitialSheet_projectId_fkey";

-- DropForeignKey
ALTER TABLE "CostControlRow" DROP CONSTRAINT "CostControlRow_procurementComparisonId_fkey";

-- DropForeignKey
ALTER TABLE "CostControlRow" DROP CONSTRAINT "CostControlRow_projectId_fkey";

-- DropForeignKey
ALTER TABLE "CostControlRowQuotationItem" DROP CONSTRAINT "CostControlRowQuotationItem_quotationLineItemId_fkey";

-- DropForeignKey
ALTER TABLE "CostControlRowQuotationItem" DROP CONSTRAINT "CostControlRowQuotationItem_rowId_fkey";

-- DropForeignKey
ALTER TABLE "DailyReport" DROP CONSTRAINT "DailyReport_projectId_fkey";

-- DropForeignKey
ALTER TABLE "DailyReport" DROP CONSTRAINT "DailyReport_submittedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Department" DROP CONSTRAINT "Department_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "DepartmentRank" DROP CONSTRAINT "DepartmentRank_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApproval" DROP CONSTRAINT "DocumentApproval_costControlInitialSheetId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApproval" DROP CONSTRAINT "DocumentApproval_generatedDocumentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApproval" DROP CONSTRAINT "DocumentApproval_paymentRequestPeriodId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApproval" DROP CONSTRAINT "DocumentApproval_procurementComparisonId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApproval" DROP CONSTRAINT "DocumentApproval_submittedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApprovalStep" DROP CONSTRAINT "DocumentApprovalStep_approvalId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApprovalStep" DROP CONSTRAINT "DocumentApprovalStep_approverUserId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApprovalStepNote" DROP CONSTRAINT "DocumentApprovalStepNote_authorUserId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentApprovalStepNote" DROP CONSTRAINT "DocumentApprovalStepNote_stepId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentTemplate" DROP CONSTRAINT "DocumentTemplate_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "EngineeringQuotation" DROP CONSTRAINT "EngineeringQuotation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ExecutionPhoto" DROP CONSTRAINT "ExecutionPhoto_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ExecutionPhoto" DROP CONSTRAINT "ExecutionPhoto_uploadedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "FieldChangeLog" DROP CONSTRAINT "FieldChangeLog_changedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "FieldChangeLog" DROP CONSTRAINT "FieldChangeLog_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "FinanceAdvance" DROP CONSTRAINT "FinanceAdvance_projectId_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedDocument" DROP CONSTRAINT "GeneratedDocument_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedDocument" DROP CONSTRAINT "GeneratedDocument_projectId_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedDocument" DROP CONSTRAINT "GeneratedDocument_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedDocument" DROP CONSTRAINT "GeneratedDocument_templateId_fkey";

-- DropForeignKey
ALTER TABLE "LineAccountLink" DROP CONSTRAINT "LineAccountLink_activeProjectId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialSubmission" DROP CONSTRAINT "MaterialSubmission_projectId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialSubmission" DROP CONSTRAINT "MaterialSubmission_reviewedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialSubmission" DROP CONSTRAINT "MaterialSubmission_submittedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "MaterialSubmission" DROP CONSTRAINT "MaterialSubmission_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "OwnerBillingPeriod" DROP CONSTRAINT "OwnerBillingPeriod_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "OwnerBillingPeriod" DROP CONSTRAINT "OwnerBillingPeriod_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequestPeriod" DROP CONSTRAINT "PaymentRequestPeriod_costControlRowId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentRequestPeriod" DROP CONSTRAINT "PaymentRequestPeriod_submittedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PermissionRule" DROP CONSTRAINT "PermissionRule_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "PermissionRule" DROP CONSTRAINT "PermissionRule_rankId_fkey";

-- DropForeignKey
ALTER TABLE "PermissionRule" DROP CONSTRAINT "PermissionRule_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "PettyCashTransaction" DROP CONSTRAINT "PettyCashTransaction_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "PettyCashTransaction" DROP CONSTRAINT "PettyCashTransaction_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PettyCashTransaction" DROP CONSTRAINT "PettyCashTransaction_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementComparison" DROP CONSTRAINT "ProcurementComparison_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementComparison" DROP CONSTRAINT "ProcurementComparison_quotationLineItemId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementComparison" DROP CONSTRAINT "ProcurementComparison_selectedVendorQuoteId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementVendorQuote" DROP CONSTRAINT "ProcurementVendorQuote_comparisonId_fkey";

-- DropForeignKey
ALTER TABLE "ProcurementVendorQuote" DROP CONSTRAINT "ProcurementVendorQuote_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectContactRecord" DROP CONSTRAINT "ProjectContactRecord_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectContactRecord" DROP CONSTRAINT "ProjectContactRecord_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectPropertyDefinition" DROP CONSTRAINT "ProjectPropertyDefinition_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectPropertyOption" DROP CONSTRAINT "ProjectPropertyOption_definitionId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectPropertyValue" DROP CONSTRAINT "ProjectPropertyValue_definitionId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectPropertyValue" DROP CONSTRAINT "ProjectPropertyValue_optionId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectPropertyValue" DROP CONSTRAINT "ProjectPropertyValue_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTodo" DROP CONSTRAINT "ProjectTodo_assigneeUserId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectTodo" DROP CONSTRAINT "ProjectTodo_projectId_fkey";

-- DropForeignKey
ALTER TABLE "QuotationLineItem" DROP CONSTRAINT "QuotationLineItem_parentId_fkey";

-- DropForeignKey
ALTER TABLE "QuotationLineItem" DROP CONSTRAINT "QuotationLineItem_quotationId_fkey";

-- DropForeignKey
ALTER TABLE "QuotationSurchargeItem" DROP CONSTRAINT "QuotationSurchargeItem_quotationId_fkey";

-- DropForeignKey
ALTER TABLE "Space" DROP CONSTRAINT "Space_generalManagerUserId_fkey";

-- DropForeignKey
ALTER TABLE "Vendor" DROP CONSTRAINT "Vendor_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "WeeklyReport" DROP CONSTRAINT "WeeklyReport_projectId_fkey";

-- DropForeignKey
ALTER TABLE "WeeklyReport" DROP CONSTRAINT "WeeklyReport_submittedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "WorkItem" DROP CONSTRAINT "WorkItem_parentId_fkey";

-- DropForeignKey
ALTER TABLE "WorkItem" DROP CONSTRAINT "WorkItem_projectId_fkey";

-- DropForeignKey
ALTER TABLE "WorkItemVendor" DROP CONSTRAINT "WorkItemVendor_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "WorkItemVendor" DROP CONSTRAINT "WorkItemVendor_workItemId_fkey";

-- DropIndex
DROP INDEX "ProjectTodo_projectId_idx";

-- AlterTable
ALTER TABLE "FinanceAdvance" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "LineAccountLink" DROP COLUMN "activeProjectId",
DROP COLUMN "activeTodoPersonal";

-- AlterTable
ALTER TABLE "ProjectTodo" DROP COLUMN "assigneeUserId",
DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "Space" DROP COLUMN "generalManagerUserId",
DROP COLUMN "projectNameTemplate";

-- DropTable
DROP TABLE "Client";

-- DropTable
DROP TABLE "CompanyMembership";

-- DropTable
DROP TABLE "CostControlAdjustment";

-- DropTable
DROP TABLE "CostControlInitialSheet";

-- DropTable
DROP TABLE "CostControlRow";

-- DropTable
DROP TABLE "CostControlRowQuotationItem";

-- DropTable
DROP TABLE "DailyReport";

-- DropTable
DROP TABLE "Department";

-- DropTable
DROP TABLE "DepartmentRank";

-- DropTable
DROP TABLE "DocumentApproval";

-- DropTable
DROP TABLE "DocumentApprovalStep";

-- DropTable
DROP TABLE "DocumentApprovalStepNote";

-- DropTable
DROP TABLE "DocumentTemplate";

-- DropTable
DROP TABLE "EngineeringQuotation";

-- DropTable
DROP TABLE "ExecutionPhoto";

-- DropTable
DROP TABLE "FieldChangeLog";

-- DropTable
DROP TABLE "GeneratedDocument";

-- DropTable
DROP TABLE "MaterialSubmission";

-- DropTable
DROP TABLE "OwnerBillingPeriod";

-- DropTable
DROP TABLE "PaymentRequestPeriod";

-- DropTable
DROP TABLE "PermissionRule";

-- DropTable
DROP TABLE "PettyCashTransaction";

-- DropTable
DROP TABLE "ProcurementComparison";

-- DropTable
DROP TABLE "ProcurementVendorQuote";

-- DropTable
DROP TABLE "Project";

-- DropTable
DROP TABLE "ProjectContactRecord";

-- DropTable
DROP TABLE "ProjectMember";

-- DropTable
DROP TABLE "ProjectPropertyDefinition";

-- DropTable
DROP TABLE "ProjectPropertyOption";

-- DropTable
DROP TABLE "ProjectPropertyValue";

-- DropTable
DROP TABLE "QuotationLineItem";

-- DropTable
DROP TABLE "QuotationSurchargeItem";

-- DropTable
DROP TABLE "Vendor";

-- DropTable
DROP TABLE "WeeklyReport";

-- DropTable
DROP TABLE "WorkItem";

-- DropTable
DROP TABLE "WorkItemVendor";

-- Now that every table referencing a COMPANY-type Space (and every FK that
-- was RESTRICT rather than CASCADE, per SpacesService.remove's doc comment)
-- is gone, any leftover COMPANY spaces themselves can be deleted before the
-- enum value they use is dropped below.
DELETE FROM "Space" WHERE "type" = 'COMPANY';

-- AlterEnum
BEGIN;
CREATE TYPE "SpaceType_new" AS ENUM ('PERSONAL', 'CALENDAR');
ALTER TABLE "Space" ALTER COLUMN "type" TYPE "SpaceType_new" USING ("type"::text::"SpaceType_new");
ALTER TYPE "SpaceType" RENAME TO "SpaceType_old";
ALTER TYPE "SpaceType_new" RENAME TO "SpaceType";
DROP TYPE "public"."SpaceType_old";
COMMIT;

-- DropEnum
DROP TYPE "ContactRecordType";

-- DropEnum
DROP TYPE "CostControlAdjustmentSide";

-- DropEnum
DROP TYPE "CostControlAdjustmentType";

-- DropEnum
DROP TYPE "DocumentApprovalStatus";

-- DropEnum
DROP TYPE "DocumentApprovalStepNoteType";

-- DropEnum
DROP TYPE "FieldChangeEntityType";

-- DropEnum
DROP TYPE "MaterialSubmissionStatus";

-- DropEnum
DROP TYPE "MembershipRole";

-- DropEnum
DROP TYPE "PermissionAction";

-- DropEnum
DROP TYPE "PermissionResourceType";

-- DropEnum
DROP TYPE "PettyCashType";

-- DropEnum
DROP TYPE "ProcurementInspectionMethod";

-- DropEnum
DROP TYPE "ProcurementPaymentMethod";

-- DropEnum
DROP TYPE "ProjectCaseType";

-- DropEnum
DROP TYPE "ProjectRole";

-- DropEnum
DROP TYPE "ProjectStage";
