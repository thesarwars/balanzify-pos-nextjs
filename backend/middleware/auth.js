const prisma = require('../lib/prisma');
const { verifyAccessToken } = require('../lib/tokens');
const { security } = require('../lib/logger');

const auth = async (req, res, next) => {
  try {
    const header = req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({
        type: 'https://balanzify.com/errors/unauthorized',
        title: 'Authentication required',
        status: 401,
      });
    }

    const token = header.replace('Bearer ', '');
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtErr) {
      const isExpired = jwtErr.name === 'TokenExpiredError';
      return res.status(401).json({
        type: 'https://balanzify.com/errors/unauthorized',
        title: isExpired ? 'Token expired' : 'Invalid token',
        status: 401,
        code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        businessId: true,
        name: true,
        email: true,
        role: true,
        pin: true,
        isActive: true,
        tokenVersion: true,
        mfaEnabled: true,
        business: {
          select: {
            name: true,
            currency: true,
            receiptHeader: true,
            receiptFooter: true,
            country: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        type: 'https://balanzify.com/errors/unauthorized',
        title: 'Account not found or disabled',
        status: 401,
        code: 'ACCOUNT_INVALID',
      });
    }

    // Reject tokens issued before password change or explicit logout
    if (decoded.v !== undefined && decoded.v < (user.tokenVersion || 0)) {
      security('stale_token_rejected', {
        user_id: user.id,
        token_version: decoded.v,
        current_version: user.tokenVersion,
        trace_id: req.traceId,
      });
      return res.status(401).json({
        type: 'https://balanzify.com/errors/unauthorized',
        title: 'Session invalidated',
        status: 401,
        code: 'SESSION_REVOKED',
      });
    }

    // Flatten business fields onto req.user to preserve backwards compat
    req.user = {
      id: user.id,
      business_id: user.businessId,
      name: user.name,
      email: user.email,
      role: user.role,
      pin: user.pin,
      is_active: user.isActive,
      token_version: user.tokenVersion,
      mfa_enabled: user.mfaEnabled,
      business_name: user.business?.name,
      currency: user.business?.currency,
      receipt_header: user.business?.receiptHeader,
      receipt_footer: user.business?.receiptFooter,
      business_country: user.business?.country,
    };

    next();
  } catch (err) {
    next(err);
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    security('insufficient_permissions', {
      user_id: req.user?.id,
      required_roles: roles,
      path: req.path,
    });
    return res.status(403).json({
      type: 'https://balanzify.com/errors/forbidden',
      title: 'Insufficient permissions',
      status: 403,
      detail: `Requires: ${roles.join(', ')}`,
    });
  }
  next();
};

// Activity log helper — uses Prisma
const log = async (businessId, userId, action, entityType, entityId, details) => {
  try {
    await prisma.activityLog.create({
      data: {
        businessId,
        userId,
        action,
        entityType,
        entityId,
        details: details ?? undefined,
      },
    });
  } catch {
    // Non-fatal — never let audit log failure break a request
  }
};

module.exports = { auth, requireRole, log };
