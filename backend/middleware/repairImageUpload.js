const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const multer = require('multer');

const uploadDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const extensionsByMimeType = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const uploadRepairImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!extensionsByMimeType[file.mimetype]) {
      const error = new Error('仅支持 JPG、PNG 或 WebP 图片');
      error.status = 400;
      callback(error);
      return;
    }
    callback(null, true);
  }
}).single('image');

const saveRepairImage = async (file) => {
  const extension = extensionsByMimeType[file.mimetype];
  const filename = `${Date.now()}-${randomBytes(16).toString('hex')}${extension}`;
  await fs.promises.writeFile(path.join(uploadDirectory, filename), file.buffer, { flag: 'wx' });
  return filename;
};

const removeRepairImage = async (filename) => {
  await fs.promises.unlink(path.join(uploadDirectory, filename));
};

module.exports = {
  uploadDirectory,
  uploadRepairImage,
  saveRepairImage,
  removeRepairImage
};
