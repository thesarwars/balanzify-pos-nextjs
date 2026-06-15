const { logger } = require('./logger');

let redisClient = null;
let redisAvailable = false;

const connectRedis = async () => {
  // Redis is optional — if not configured, rate limiting falls back to in-memory
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not set — rate limiting will use in-memory store (not suitable for multi-instance)');
    return null;
  }

  try {
    const { createClient } = require('redis');
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis reconnect failed after 10 attempts — falling back to memory');
            redisAvailable = false;
            return false; // stop reconnecting
          }
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: 5000,
      },
    });

    redisClient.on('error', (err) => {
      if (redisAvailable) logger.error('Redis error', { message: err.message });
      redisAvailable = false;
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      logger.info('Redis connected');
    });

    redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

    await redisClient.connect();
    redisAvailable = true;
    return redisClient;
  } catch (err) {
    logger.warn('Redis connection failed — falling back to in-memory rate limiting', { message: err.message });
    redisAvailable = false;
    return null;
  }
};

const getRedis = () => (redisAvailable ? redisClient : null);
const isRedisAvailable = () => redisAvailable;

module.exports = { connectRedis, getRedis, isRedisAvailable };
