-- Drug-drug interaction knowledge base + a shipped clinical KB (business_id NULL).
CREATE TABLE "drug_interactions" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "business_id" UUID,
  "drug_a"      VARCHAR(120) NOT NULL,
  "drug_b"      VARCHAR(120) NOT NULL,
  "severity"    VARCHAR(20) NOT NULL,
  "description" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drug_interactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drug_interactions_drug_a_idx" ON "drug_interactions"("drug_a");
CREATE INDEX "drug_interactions_drug_b_idx" ON "drug_interactions"("drug_b");

-- Shipped clinical KB: classic, well-established interactions. drug_a/drug_b are
-- lowercase generics stored alphabetically so lookup is order-independent.
INSERT INTO "drug_interactions" ("drug_a","drug_b","severity","description") VALUES
  ('aspirin','warfarin','major','Concurrent antiplatelet and anticoagulant — markedly increased bleeding risk.'),
  ('ibuprofen','warfarin','major','NSAID raises bleeding risk with warfarin; avoid or monitor closely.'),
  ('ciprofloxacin','warfarin','major','Ciprofloxacin potentiates warfarin — monitor INR.'),
  ('aspirin','ibuprofen','moderate','Ibuprofen can blunt the cardioprotective antiplatelet effect of aspirin.'),
  ('ibuprofen','methotrexate','major','NSAIDs reduce methotrexate clearance — toxicity risk.'),
  ('methotrexate','trimethoprim','contraindicated','Both are antifolates — risk of severe bone-marrow suppression.'),
  ('clarithromycin','simvastatin','contraindicated','CYP3A4 inhibition raises statin levels — rhabdomyolysis risk.'),
  ('erythromycin','simvastatin','major','Macrolide raises statin levels — myopathy risk.'),
  ('lisinopril','spironolactone','major','Combined hyperkalemia risk — monitor potassium.'),
  ('amiodarone','digoxin','major','Amiodarone raises digoxin levels — digoxin toxicity.'),
  ('digoxin','verapamil','major','Verapamil raises digoxin levels — toxicity risk.'),
  ('clopidogrel','omeprazole','moderate','Omeprazole reduces activation of clopidogrel — diminished effect.'),
  ('sertraline','tramadol','major','Serotonin syndrome risk with concurrent serotonergic agents.'),
  ('isosorbide','sildenafil','contraindicated','Nitrate with PDE5 inhibitor — severe hypotension.'),
  ('nitroglycerin','sildenafil','contraindicated','Nitrate with PDE5 inhibitor — severe hypotension.');
