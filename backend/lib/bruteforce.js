const prisma = require('./prisma');
const { security } = require('./logger');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const WINDOW_MINUTES = 15;

const windowStart = () => new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

const recordFailedAttempt = async (identifier, ip) => {
  await prisma.loginAttempt.create({
    data: { identifier, ipAddress: ip || null },
  });
};

const isLockedOut = async (identifier, ip) => {
  const since = windowStart();

  const [accountCount, ipCount] = await Promise.all([
    prisma.loginAttempt.count({
      where: { identifier, succeeded: false, attemptedAt: { gte: since } },
    }),
    prisma.loginAttempt.count({
      where: { ipAddress: ip, succeeded: false, attemptedAt: { gte: since } },
    }),
  ]);

  if (accountCount >= MAX_ATTEMPTS) {
    security('account_locked_out', { identifier, ip, attempts: accountCount });
    return { locked: true, reason: 'account', retryAfter: LOCKOUT_MINUTES * 60 };
  }

  // IP threshold is 3x higher — shared office IPs shouldn't lock out all users
  if (ipCount >= MAX_ATTEMPTS * 3) {
    security('ip_locked_out', { ip, attempts: ipCount });
    return { locked: true, reason: 'ip', retryAfter: LOCKOUT_MINUTES * 60 };
  }

  return { locked: false };
};

const recordSuccess = async (identifier) => {
  await prisma.loginAttempt.updateMany({
    where: { identifier, succeeded: false },
    data: { succeeded: true },
  });
};

const cleanupAttempts = async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.loginAttempt.deleteMany({
    where: { attemptedAt: { lt: cutoff } },
  });
};

module.exports = { recordFailedAttempt, isLockedOut, recordSuccess, cleanupAttempts };
