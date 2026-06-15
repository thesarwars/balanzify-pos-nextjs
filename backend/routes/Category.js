const express = require('express');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { CategorySchema } = require('../validation/schemas'); // Assuming you have a validation schema
const router = express.Router();

// GET / - List all categories with pagination and optional search
router.get('/', auth, async (req, res, next) => {
  try {
    const { page = 1, limit = 100, search } = req.query;
    
    const where = {
      businessId: req.user.business_id,
      ...(search && {
        name: { contains: search, mode: 'insensitive' },
      }),
    };

    const categories = await prisma.category.findMany({
      where,
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ categories });
  } catch (err) { next(err); }
});

// GET /:id - Fetch a single category
router.get('/:id', auth, async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    if (!category || category.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Category not found', status: 404 });
    }

    res.json(category);
  } catch (err) { next(err); }
});

// POST / - Create a new category (Owners and Managers only)
router.post('/', auth, requireRole('owner', 'manager'), validate(CategorySchema), async (req, res, next) => {
  try {
    const data = req.body;

    const category = await prisma.category.create({
      data: {
        businessId: req.user.business_id,
        name: data.name,
        description: data.description || null,
        color: data.color || null,
      },
    });

    res.status(201).json(category);
  } catch (err) { next(err); }
});

// PUT /:id - Update a category (Owners and Managers only)
router.put('/:id', auth, requireRole('owner', 'manager'), validate(CategorySchema.partial()), async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    
    if (!category || category.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Category not found', status: 404 });
    }

    const { name, description, color } = req.body;

    const updated = await prisma.category.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(color !== undefined && { color }),
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /:id - Delete a category (Owner only)
// Note: Since your Prisma model dictates `onDelete: Cascade` on the Business relation, 
// deleting a category will break/remove its reference on products depending on database rules.
router.delete('/:id', auth, requireRole('owner'), async (req, res, next) => {
  try {
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    
    if (!category || category.businessId !== req.user.business_id) {
      return res.status(404).json({ title: 'Category not found', status: 404 });
    }

    await prisma.category.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Category deleted successfully.' });
  } catch (err) { next(err); }
});

module.exports = router;