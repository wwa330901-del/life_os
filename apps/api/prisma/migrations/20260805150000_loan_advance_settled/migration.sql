-- AlterTable
ALTER TABLE "FinanceAdvance" ADD COLUMN     "settled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FinanceLoan" ADD COLUMN     "settled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing rows all defaulted to false above, but plenty of them
-- are actually already settled (principal fully repaid). Compute the real
-- value once from existing FinanceTransaction data so the column starts
-- correct instead of relying on the next write to fix it.
UPDATE "FinanceLoan" l
SET "settled" = (
  COALESCE((SELECT t."amount" FROM "FinanceTransaction" t WHERE t."financeLoanId" = l."id"), 0)
  <= COALESCE((
    SELECT SUM(rt."amount")
    FROM "FinanceLoanRepayment" r
    JOIN "FinanceTransaction" rt ON rt."loanRepaymentId" = r."id"
    WHERE r."loanId" = l."id"
  ), 0) + 0.001
);

UPDATE "FinanceAdvance" a
SET "settled" = (
  COALESCE((SELECT t."amount" FROM "FinanceTransaction" t WHERE t."financeAdvanceId" = a."id"), 0)
  <= COALESCE((
    SELECT SUM(rt."amount")
    FROM "FinanceAdvanceRepayment" r
    JOIN "FinanceTransaction" rt ON rt."advanceRepaymentId" = r."id"
    WHERE r."advanceId" = a."id"
  ), 0) + 0.001
);
