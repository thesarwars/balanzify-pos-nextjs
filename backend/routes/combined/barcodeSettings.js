const express = require("express");
const prisma = require("../../lib/prisma");
const { auth, requireRole } = require("../../middleware/auth");
const { validate } = require("../../middleware/validate");
const { BarcodeSettingSchema } = require("../../validation/schemas");
const { seedBarcodeSettings } = require("../../lib/barcodeSettingDefaults");

// ── Barcode sticker sheet layouts ────────────────────────────────────────────
// The physical geometry the label printer uses. At most one row per business may
// be the default; that invariant is maintained inside a transaction.
const barcodeSettingsRouter = express.Router();

const toBody = (b) => ({
  name: b.name,
  description: b.description || null,
  isContinuous: !!b.is_continuous,
  topMargin: b.top_margin || 0,
  leftMargin: b.left_margin || 0,
  stickerWidth: b.sticker_width,
  stickerHeight: b.sticker_height,
  // A roll has no sheet — never persist stale paper dimensions for one.
  paperWidth: b.is_continuous ? null : (b.paper_width ?? null),
  paperHeight: b.is_continuous ? null : (b.paper_height ?? null),
  stickersInOneRow: b.stickers_in_one_row,
  rowDistance: b.row_distance || 0,
  colDistance: b.col_distance || 0,
  stickersPerSheet: b.is_continuous ? 0 : b.stickers_per_sheet || 0,
  isDefault: !!b.is_default,
});

barcodeSettingsRouter.get("/", auth, async (req, res, next) => {
  try {
    const settings = await prisma.barcodeSetting.findMany({
      where: { businessId: req.user.business_id },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// Re-create any missing stock sheets. Idempotent, and never steals an existing
// default. Declared before POST '/' — distinct paths, but keep them adjacent.
barcodeSettingsRouter.post(
  "/restore-defaults",
  auth,
  requireRole("owner", "manager"),
  async (req, res, next) => {
    try {
      const created = await seedBarcodeSettings(
        prisma,
        req.user.business_id,
        req.user.id,
      );
      const settings = await prisma.barcodeSetting.findMany({
        where: { businessId: req.user.business_id },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      });
      res.json({
        message: created
          ? `Restored ${created} default sheet${created === 1 ? "" : "s"}.`
          : "All default sheets are already present.",
        created,
        settings,
      });
    } catch (err) {
      next(err);
    }
  },
);

barcodeSettingsRouter.post(
  "/",
  auth,
  requireRole("owner", "manager"),
  validate(BarcodeSettingSchema),
  async (req, res, next) => {
    try {
      const data = toBody(req.body);
      const created = await prisma.$transaction(async (tx) => {
        if (data.isDefault) {
          await tx.barcodeSetting.updateMany({
            where: { businessId: req.user.business_id, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.barcodeSetting.create({
          data: {
            ...data,
            businessId: req.user.business_id,
            createdById: req.user.id,
          },
        });
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);

barcodeSettingsRouter.put(
  "/:id",
  auth,
  requireRole("owner", "manager"),
  validate(BarcodeSettingSchema),
  async (req, res, next) => {
    try {
      const existing = await prisma.barcodeSetting.findUnique({
        where: { id: req.params.id },
        select: { businessId: true },
      });
      if (!existing || existing.businessId !== req.user.business_id)
        return res.status(404).json({ title: "Not found", status: 404 });

      const data = toBody(req.body);
      const updated = await prisma.$transaction(async (tx) => {
        if (data.isDefault) {
          await tx.barcodeSetting.updateMany({
            where: {
              businessId: req.user.business_id,
              isDefault: true,
              id: { not: req.params.id },
            },
            data: { isDefault: false },
          });
        }
        return tx.barcodeSetting.update({ where: { id: req.params.id }, data });
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

barcodeSettingsRouter.delete(
  "/:id",
  auth,
  requireRole("owner", "manager"),
  async (req, res, next) => {
    try {
      const existing = await prisma.barcodeSetting.findUnique({
        where: { id: req.params.id },
        select: { businessId: true },
      });
      if (!existing || existing.businessId !== req.user.business_id)
        return res.status(404).json({ title: "Not found", status: 404 });
      await prisma.barcodeSetting.delete({ where: { id: req.params.id } });
      res.json({ message: "Barcode setting deleted." });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = { barcodeSettingsRouter };
