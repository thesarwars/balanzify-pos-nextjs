/**
 * Prisma Client Singleton
 *
 * One instance for the entire application.
 * In development, reuses the instance across hot-reloads via global.__prisma
 * to prevent connection pool exhaustion.
 *
 * Usage everywhere: const prisma = require('./lib/prisma');
 */

const { PrismaClient } = require('@prisma/client');

const isDev = process.env.NODE_ENV !== 'production';

// Log levels: 'query' | 'info' | 'warn' | 'error'
const logLevels = isDev ? ['warn', 'error'] : ['error'];

const createPrismaClient = () =>
  new PrismaClient({
    log: logLevels,
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Reuse across hot-reloads in development
const prisma = global.__prisma ?? createPrismaClient();
if (isDev) global.__prisma = prisma;

module.exports = prisma;
