const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const auth = require('../utils/authMiddleware');

// Multer Storage Configuration for Encrypted Blobs
// Note: We use 'raw' or 'auto' because encrypted files aren't standard image formats anymore
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'e2ee_chat_media',
    resource_type: 'auto', // Important for non-image encrypted files
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// POST /api/media/upload - Upload an encrypted file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    url: req.file.path,
    filename: req.file.filename
  });
});

module.exports = router;
