-- Construction: change orders (variations) + material requisitions (stock → job cost).

CREATE TABLE "change_orders" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "co_number" VARCHAR(40) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "category" VARCHAR(30) NOT NULL DEFAULT 'other',
    "cost_impact" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "price_impact" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "approved_at" TIMESTAMP(3),
    "milestone_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "change_orders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "change_orders_project_id_idx" ON "change_orders"("project_id");
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "material_requisitions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "req_number" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'issued',
    "total_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "issued_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "material_requisitions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "material_requisitions_project_id_idx" ON "material_requisitions"("project_id");
ALTER TABLE "material_requisitions" ADD CONSTRAINT "material_requisitions_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "material_requisition_items" (
    "id" UUID NOT NULL,
    "requisition_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "line_cost" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "material_requisition_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "material_requisition_items_requisition_id_idx" ON "material_requisition_items"("requisition_id");
ALTER TABLE "material_requisition_items" ADD CONSTRAINT "material_requisition_items_requisition_id_fkey"
    FOREIGN KEY ("requisition_id") REFERENCES "material_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
