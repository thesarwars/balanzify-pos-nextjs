const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const prisma = require('../lib/prisma');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { issueTokens, rotateRefreshToken, revokeAllSessions } = require('../lib/tokens');
const { audit, security } = require('../lib/logger');
const { trackLogin } = require('../lib/metrics');
const {
  RegisterSchema, LoginSchema, PinLoginSchema,
  ChangePasswordSchema, RefreshTokenSchema, VerifyMfaSchema,
} = require('../validation/schemas');
const { z } = require('zod');
const router = express.Router();

// POST /api/v1/auth/register
router.post('/register', validate(RegisterSchema), async (req, res, next) => {
  try {
    const { businessName, email, password, phone, country } = req.body;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ title: 'Email already registered', status: 409 });

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: { name: businessName, email, phone: phone || null, country: country || 'Somaliland' },
      });
      const user = await tx.user.create({
        data: {
          businessId: business.id,
          name: businessName,
          email,
          password: hashedPassword,
          role: 'owner',
        },
      });
      return { business, user };
    });

    const tokens = await issueTokens(result.user, req.ip, req.get('user-agent'));
    audit('register', { user_id: result.user.id, business_id: result.business.id });
    res.status(201).json({
      user: { id: result.user.id, email: result.user.email, role: result.user.role, name: result.user.name },
      business: { id: result.business.id, name: result.business.name, currency: result.business.currency },
      token_type: 'Bearer',
      expires_in: 900,
      ...tokens,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/login
router.post('/login', validate(LoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { business: { select: { id: true, name: true, currency: true } } },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ title: 'Invalid credentials', status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      security('failed_login', { email, ip });
      return res.status(401).json({ title: 'Invalid credentials', status: 401 });
    }

    if (user.mfaEnabled) {
      const { generatePreMfaToken } = require('../lib/tokens');
      const preToken = generatePreMfaToken(user);
      return res.json({ mfa_required: true, pre_token: preToken });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const tokens = await issueTokens(user, ip, req.get('user-agent'));
    trackLogin(user.role);
    audit('login', { user_id: user.id });
    res.json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name, business_id: user.businessId },
      token_type: 'Bearer',
      expires_in: 900,
      ...tokens,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/mfa/verify
router.post('/mfa/verify', validate(VerifyMfaSchema), async (req, res, next) => {
  try {
    const { token } = req.body;
    const header = req.header('Authorization')?.replace('Bearer ', '');
    if (!header) return res.status(401).json({ title: 'Pre-auth token required', status: 401 });

    const { verifyPreMfaToken } = require('../lib/tokens');
    let decoded;
    try { decoded = verifyPreMfaToken(header); } catch { return res.status(401).json({ title: 'Invalid or expired pre-auth token', status: 401 }); }
    if (!decoded.mfa_pending) return res.status(401).json({ title: 'Invalid pre-auth token type', status: 401 });

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecret) return res.status(400).json({ title: 'MFA not configured', status: 400 });

    const valid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: 'base32', token, window: 1 });
    if (!valid) return res.status(401).json({ title: 'Invalid MFA code', status: 401, code: 'MFA_INVALID' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const tokens = await issueTokens(user, req.ip, req.get('user-agent'));
    res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, ...tokens });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/mfa/setup
router.post('/mfa/setup', auth, async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({ name: `Balanzify (${req.user.email})`, length: 20 });
    await prisma.user.update({ where: { id: req.user.id }, data: { mfaSecret: secret.base32 } });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qr_code: qrCode });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/mfa/enable
router.post('/mfa/enable', auth, validate(VerifyMfaSchema), async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.mfaSecret) return res.status(400).json({ title: 'MFA not set up', status: 400 });
    const valid = speakeasy.totp.verify({ secret: user.mfaSecret, encoding: 'base32', token, window: 1 });
    if (!valid) return res.status(400).json({ title: 'Invalid MFA code', status: 400 });
    await prisma.user.update({ where: { id: req.user.id }, data: { mfaEnabled: true } });
    res.json({ message: 'MFA enabled.' });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/refresh
router.post('/refresh', validate(RefreshTokenSchema), async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    const tokens = await rotateRefreshToken(refresh_token, req.ip, req.get('user-agent'));
    res.json(tokens);
  } catch (err) {
    if (err.message === 'REUSE_DETECTED') {
      return res.status(401).json({ title: 'Token reuse detected — all sessions revoked', status: 401, code: 'TOKEN_REUSE' });
    }
    res.status(401).json({ title: 'Invalid refresh token', status: 401 });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', auth, async (req, res, next) => {
  try {
    await revokeAllSessions(req.user.id);
    res.json({ message: 'Logged out from all sessions.' });
  } catch (err) { next(err); }
});

// GET /api/v1/auth/me
router.get('/me', auth, async (req, res) => res.json(req.user));

// POST /api/v1/auth/change-password
router.post('/change-password', auth, validate(ChangePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ title: 'Current password is incorrect', status: 400 });
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        password: hashed,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });
    await revokeAllSessions(req.user.id);
    res.json({ message: 'Password changed. Please log in again.' });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/pin-login
router.post('/pin-login', validate(PinLoginSchema), async (req, res, next) => {
  try {
    const { pin, business_id } = req.body;
    const user = await prisma.user.findFirst({
      where: { businessId: business_id, pin, isActive: true },
      include: { business: { select: { name: true, currency: true } } },
    });
    if (!user) return res.status(401).json({ title: 'Invalid PIN', status: 401 });
    const tokens = await issueTokens(user, req.ip, req.get('user-agent'));
    res.json({ user: { id: user.id, name: user.name, role: user.role }, ...tokens });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', validate(z.object({ email: z.string().email() })), async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email is registered, a reset link has been sent.' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const { sendPasswordReset } = require('../lib/email');
    await sendPasswordReset(user.email, user.name, rawToken).catch(() => {});
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', validate(z.object({
  token: z.string().min(64).max(64),
  newPassword: z.string().min(8).max(128),
})), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (!resetToken || resetToken.used || new Date(resetToken.expiresAt) < new Date()) {
      return res.status(400).json({ title: 'Invalid or expired reset token', status: 400 });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashed, passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: resetToken.userId } }),
      prisma.passwordResetToken.update({ where: { tokenHash: hash }, data: { used: true } }),
    ]);
    audit('password_reset_completed', { user_id: resetToken.userId });
    res.json({ message: 'Password reset successfully.' });
  } catch (err) { next(err); }
});

module.exports = router;