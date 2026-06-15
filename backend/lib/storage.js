const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const { logger } = require('./logger');

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'us-east-1';

const s3 = new S3Client({ region: REGION });

// ── Upload a buffer directly ──────────────────────────────────────────────────
const uploadBuffer = async (buffer, mimetype, folder, businessId) => {
  if (!BUCKET) throw new Error('S3_BUCKET not configured');
  const ext = mimetype.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  const key = `${folder}/${businessId}/${crypto.randomUUID()}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    CacheControl: 'max-age=31536000',
  }));
  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  logger.info('s3_upload', { key, folder, business_id: businessId });
  return { key, url };
};

// ── Delete an object ──────────────────────────────────────────────────────────
const deleteObject = async (key) => {
  if (!BUCKET || !key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    logger.info('s3_delete', { key });
  } catch (err) {
    logger.warn('s3_delete_failed', { key, message: err.message });
  }
};

// ── Presigned URL for direct browser upload ───────────────────────────────────
// Returns a URL the frontend can PUT directly to S3.
// Avoids streaming large files through the API server.
const getPresignedUploadUrl = async (folder, businessId, mimetype, maxBytes = 5 * 1024 * 1024) => {
  if (!BUCKET) throw new Error('S3_BUCKET not configured');
  const ext = mimetype.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
  const key = `${folder}/${businessId}/${crypto.randomUUID()}.${ext}`;
  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET, Key: key, ContentType: mimetype,
  }), { expiresIn: 300 }); // 5 minutes
  return { url, key };
};

// ── Multer middleware for server-side upload ──────────────────────────────────
// Used for product images and logo uploads via the API
const multer = require('multer');
// sharp is loaded lazily inside resize() so a platform-specific build issue
// never crashes server startup — image upload degrades gracefully instead.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
    cb(null, true);
  },
});

// Resize and optimize image before upload
const processAndUpload = async (buffer, mimetype, folder, businessId, width = 800) => {
  let toStore = buffer;
  let contentType = mimetype;
  try {
    const sharp = require('sharp');
    toStore = await sharp(buffer)
      .resize(width, width, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    contentType = 'image/webp';
  } catch (err) {
    // sharp unavailable (platform build issue) — store original image unoptimized
    console.warn('sharp unavailable, storing original image:', err.message);
  }
  return uploadBuffer(toStore, contentType, folder, businessId);
};

module.exports = { uploadBuffer, deleteObject, getPresignedUploadUrl, upload, processAndUpload };

// Alias for backwards compatibility with routes that import deleteFile
const deleteFile = deleteObject;
module.exports.deleteFile = deleteFile;
