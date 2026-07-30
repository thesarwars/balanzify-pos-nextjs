-- "On leave" is now derived from an approved leave covering the day, not stored.
-- Employee.status was previously flipped to 'on_leave' on approval regardless of
-- the leave dates and never reverted, so every historical flag is stale — and it
-- also excluded those employees from absentee marking. Reset them to active.
UPDATE "employees" SET "status" = 'active' WHERE "status" = 'on_leave';
