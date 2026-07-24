-- purchase_orders.tax_rate_id has existed since the initial schema but no API
-- path ever wrote it, so the Tax Report's input register had nothing to split
-- input tax by. The write is fixed in routes/purchaseOrders.js; this backfills
-- history by inferring the rate from the stored tax against the taxable base.
-- Ambiguous cases (two active rates with the same percentage) resolve
-- arbitrarily, which is the best available answer for legacy rows.
UPDATE purchase_orders po
SET tax_rate_id = tr.id
FROM tax_rates tr
WHERE po.tax_rate_id IS NULL
  AND po.tax_amount <> 0
  AND (po.subtotal - po.discount_amount) > 0
  AND tr.business_id = po.business_id
  AND tr.is_active = true
  AND ABS(tr.rate - (po.tax_amount / (po.subtotal - po.discount_amount))) < 0.0005;
