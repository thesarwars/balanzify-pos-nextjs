const express = require('express');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { auth, requireRole } = require('../middleware/auth');
const { uploadBuffer, deleteFile, processAndUpload } = require('../lib/storage');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Generic image upload (e.g. invoice-layout logo) ───────────────────────────
// Returns { url, key }; the caller stores them (not attached to any entity).
router.post('/image', auth, requireRole('owner', 'manager'), upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ title: 'No file uploaded', status: 400 });
    if (!String(req.file.mimetype || '').startsWith('image/')) return res.status(400).json({ title: 'Only image files are allowed', status: 400 });
    const { url, key } = await processAndUpload(req.file.buffer, req.file.mimetype, 'layouts', req.user.business_id);
    res.json({ url, key });
  } catch (err) { next(err); }
});

// Delete a previously uploaded image — the key must belong to this business.
router.delete('/image', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const key = req.query.key || (req.body && req.body.key);
    if (!key || !String(key).includes('/' + req.user.business_id + '/')) return res.status(400).json({ title: 'Invalid key', status: 400 });
    await deleteFile(key).catch(() => {});
    res.json({ message: 'Deleted.' });
  } catch (err) { next(err); }
});

router.post('/product/:id/image', auth, requireRole('owner', 'manager'), upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ title: 'No file uploaded', status: 400 });
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product || product.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    if (product.imageKey) await deleteFile(product.imageKey).catch(() => {});
    const { url, key } = await uploadBuffer(req.file.buffer, req.file.mimetype, `products/${req.user.business_id}`);
    await prisma.product.update({ where: { id: req.params.id }, data: { imageUrl: url, imageKey: key } });
    res.json({ url, key });
  } catch (err) { next(err); }
});

router.delete('/product/:id/image', auth, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product || product.businessId !== req.user.business_id) return res.status(404).json({ title: 'Not found', status: 404 });
    if (product.imageKey) await deleteFile(product.imageKey).catch(() => {});
    await prisma.product.update({ where: { id: req.params.id }, data: { imageUrl: null, imageKey: null } });
    res.json({ message: 'Image deleted.' });
  } catch (err) { next(err); }
});

router.post('/logo', auth, requireRole('owner'), upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ title: 'No file uploaded', status: 400 });
    const biz = await prisma.business.findUnique({ where: { id: req.user.business_id } });
    if (biz?.logoKey) await deleteFile(biz.logoKey).catch(() => {});
    const { url, key } = await uploadBuffer(req.file.buffer, req.file.mimetype, `logos/${req.user.business_id}`);
    await prisma.business.update({ where: { id: req.user.business_id }, data: { logoUrl: url, logoKey: key } });
    res.json({ url, key });
  } catch (err) { next(err); }
});

module.exports = router;
