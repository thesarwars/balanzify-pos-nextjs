-- Edit Shipping gains its own note field, separate from the sell/staff notes.
ALTER TABLE "sales" ADD COLUMN "shipping_note" TEXT;

-- Every sale gets a public receipt token. POS checkouts always minted one, but
-- invoice sales ("Add Sale") did not, so they had no "view without login" link.
-- gen_random_uuid() draws from a cryptographic RNG; two of them give the same
-- 64-hex-char shape generateReceiptToken() produces. Idempotent (only NULLs).
UPDATE "sales"
SET "receipt_token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "receipt_token" IS NULL;
