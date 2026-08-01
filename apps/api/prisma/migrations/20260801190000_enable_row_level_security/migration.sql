-- Supabase flagged public tables as accessible via its auto-generated REST API
-- (PostgREST) because Row-Level Security was never enabled. This app never uses
-- PostgREST or the anon/service key from any client (Prisma connects directly as
-- the table owner, which bypasses RLS regardless), so enabling RLS with no
-- policies simply closes that public REST exposure without affecting the API.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Space" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleCalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeneratedDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentApprovalStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentApprovalStepNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectPropertyDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectPropertyOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectPropertyValue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectTypeOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectStatusOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceRecurringTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockRecurringInvestment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockPriceCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LineAccountLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectTodo" ENABLE ROW LEVEL SECURITY;
