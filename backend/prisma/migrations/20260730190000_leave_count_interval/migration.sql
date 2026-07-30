-- The window "Max Leave Count" is counted over: per calendar month, per
-- financial year, or never reset. Before this the cap was cumulative for the
-- whole life of the employee record — computeBalances summed every leave row
-- ever filed with no date predicate — so an employee who used their annual
-- entitlement in year one could never apply for that type again.
--
-- Existing types default to financial_year, which is what an annual
-- entitlement means and is the closest correct reading of the old data.
ALTER TABLE "leave_types"
  ADD COLUMN "count_interval" VARCHAR(20) NOT NULL DEFAULT 'financial_year';
