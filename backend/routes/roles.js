/**
 * Roles & permissions.
 *
 * GET  /api/v1/permissions      — the grouped permission catalog (role editor)
 * GET  /api/v1/roles            — this business's roles
 * POST /api/v1/roles            — create a custom role
 * PUT  /api/v1/roles/:id        — edit a custom role (predefined are locked)
 * DELETE /api/v1/roles/:id      — delete a custom role (predefined are locked)
 *
 * Five predefined roles (Admin, Manager, Cashier, Accountant, Stock Keeper)
 * are seeded per business at registration (lib/permissions.js).
 */

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { PERMISSION_GROUPS, ALL_PERMISSION_KEYS } = require('../lib/permissions');

const rolesRouter = express.Router();
const permissionsRouter = express.Router();

const RoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: z.array(z.string().trim().min(1).max(100)).max(500).default([]),
  location_ids: z.array(z.string().uuid()).max(100).optional(),
});

permissionsRouter.get('/', auth, (req, res) => {
  res.json({ groups: PERMISSION_GROUPS, total: ALL_PERMISSION_KEYS.length });
});

// Reject unknown permission keys and cross-tenant locations.
async function badRoleBody(b, businessId) {
  const unknown = (b.permissions || []).filter((k) => !ALL_PERMISSION_KEYS.includes(k));
  if (unknown.length) return `Unknown permissions: ${unknown.slice(0, 5).join(', ')}`;
  const locs = [...new Set(b.location_ids || [])];
  if (locs.length && (await prisma.location.count({ where: { id: { in: locs }, businessId } })) !== locs.length) {
    return 'One or more locations not found';
  }
  return null;
}

rolesRouter.get('/', auth, async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      where: { businessId: req.user.business_id },
      orderBy: [{ isPredefined: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ roles, total_permissions: ALL_PERMISSION_KEYS.length });
  } catch (err) { next(err); }
});

rolesRouter.get('/:id', auth, async (req, res, next) => {
  try {
    const role = await prisma.role.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!role) return res.status(404).json({ title: 'Not found', status: 404 });
    res.json(role);
  } catch (err) { next(err); }
});

rolesRouter.post('/', auth, requireRole('owner', 'manager'), validate(RoleSchema), async (req, res, next) => {
  try {
    const bad = await badRoleBody(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const role = await prisma.role.create({ data: {
      businessId: req.user.business_id,
      name: req.body.name,
      permissions: [...new Set(req.body.permissions)],
      locationIds: [...new Set(req.body.location_ids || [])],
    } });
    res.status(201).json(role);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ title: 'A role with that name already exists', status: 409 });
    next(err);
  }
});

rolesRouter.put('/:id', auth, requireRole('owner', 'manager'), validate(RoleSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.role.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    if (existing.isPredefined) return res.status(422).json({ title: 'Predefined roles are locked — duplicate one into a custom role instead', status: 422 });
    const bad = await badRoleBody(req.body, req.user.business_id);
    if (bad) return res.status(400).json({ title: bad, status: 400 });
    const role = await prisma.role.update({ where: { id: req.params.id }, data: {
      ...(req.body.name !== undefined && { name: req.body.name }),
      ...(req.body.permissions !== undefined && { permissions: [...new Set(req.body.permissions)] }),
      ...(req.body.location_ids !== undefined && { locationIds: [...new Set(req.body.location_ids)] }),
    } });
    res.json(role);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ title: 'A role with that name already exists', status: 409 });
    next(err);
  }
});

rolesRouter.delete('/:id', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.role.findFirst({ where: { id: req.params.id, businessId: req.user.business_id } });
    if (!existing) return res.status(404).json({ title: 'Not found', status: 404 });
    if (existing.isPredefined) return res.status(422).json({ title: 'Predefined roles cannot be deleted', status: 422 });
    await prisma.role.delete({ where: { id: req.params.id } });
    res.json({ message: 'Role deleted.' });
  } catch (err) { next(err); }
});

module.exports = { rolesRouter, permissionsRouter };
