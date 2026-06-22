-- More mobile-money rails as valid sale payment methods: eDahab (Somtel),
-- CBE Birr (Ethiopia), and a generic mobile-money catch-all.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'edahab';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'cbe_birr';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'mobile_money';
