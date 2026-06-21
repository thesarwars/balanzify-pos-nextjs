-- Widen users.pin to hold a bcrypt hash (was VarChar(10), too small for a 60-char hash)
ALTER TABLE "users" ALTER COLUMN "pin" TYPE VARCHAR(72);
