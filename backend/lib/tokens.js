const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('./prisma');
const { security } = require('./logger');

const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user.id, businessId: user.business_id || user.businessId, role: user.role, v: user.token_version || user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL, issuer: 'balanzify', audience: 'balanzify-api' }
  );

const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');

const issueTokens = async (user, ip, userAgent) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  // Rotate: delete any existing token for this user+device combo
  if (userAgent) {
    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, userAgent },
    });
  }

  // FIXED: Using structural connections for relational tables to resolve Prisma validation errors
  await prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      expiresAt,
      ipAddress: ip || null,
      userAgent: userAgent || null,
      // Connect the user relation safely
      user: {
        connect: { id: user.id }
      },
      // Connect to a valid business ID string with fallback checking
      business: {
        connect: { id: user.business_id || user.businessId }
      }
    },
  });

  return { access_token: accessToken, refresh_token: refreshToken };
};

const rotateRefreshToken = async (refreshToken, ip, userAgent) => {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const rt = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: { user: { select: { id: true, businessId: true, role: true, tokenVersion: true, isActive: true } } },
  });

  if (!rt) {
    security('refresh_token_reuse_detected', { hash: hash.slice(0, 16), ip });
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  if (!rt.user.isActive) throw new Error('ACCOUNT_DISABLED');

  if (rt.used) {
    security('refresh_token_reuse_detected', {
      user_id: rt.userId, ip,
      message: 'Revoking all sessions due to token reuse',
    });
    await prisma.refreshToken.deleteMany({ where: { userId: rt.userId } });
    throw new Error('REUSE_DETECTED');
  }

  if (new Date(rt.expiresAt) < new Date()) {
    await prisma.refreshToken.delete({ where: { tokenHash: hash } });
    throw new Error('REFRESH_TOKEN_EXPIRED');
  }

  // Mark old token used
  await prisma.refreshToken.update({
    where: { tokenHash: hash },
    data: { used: true, usedAt: new Date() },
  });

  const user = {
    id: rt.user.id,
    business_id: rt.user.businessId,
    role: rt.user.role,
    token_version: rt.user.tokenVersion,
  };
  return issueTokens(user, ip, userAgent);
};

const revokeAllSessions = async (userId) => {
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    }),
  ]);
};

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'balanzify',
    audience: 'balanzify-api',
  });

// ── Pre-MFA token (5 min, no refresh token created) ─────────────────────────
// Issued after password check passes but before TOTP is verified.
// Only accepted by /mfa/verify. Cannot access any other endpoint.
const PRE_MFA_TTL = '5m';

const generatePreMfaToken = (user) =>
  jwt.sign(
    { userId: user.id, business_id: user.businessId || user.business_id, mfa_pending: true },
    process.env.JWT_SECRET,
    { expiresIn: PRE_MFA_TTL, issuer: 'balanzify', audience: 'balanzify-mfa' }
  );

const verifyPreMfaToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'balanzify',
    audience: 'balanzify-mfa',
  });

module.exports = { 
  issueTokens, 
  rotateRefreshToken, 
  revokeAllSessions, 
  verifyAccessToken, 
  generateAccessToken, 
  generatePreMfaToken, 
  verifyPreMfaToken 
};