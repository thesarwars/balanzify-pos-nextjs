-- Broaden the Sale payment-method enum to the mobile-money rails the product
-- routes (EVC, M-Pesa, Telebirr) — previously only Zaad was a valid value, so a
-- sale on those rails could not be recorded at all.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'evc';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'mpesa';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'telebirr';
