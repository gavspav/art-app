import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(__dirname, '..', process.env.UPLOAD_DIR || './uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `artwork-${uniqueSuffix}.png`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: (process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024, // MB to bytes
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'));
    }
  },
});

// Validate Gelato API key
const validateApiKey = (req, res, next) => {
  if (!process.env.GELATO_API_KEY) {
    return res.status(500).json({ error: 'Gelato API key not configured' });
  }
  next();
};

// Helper to make Gelato API requests
const gelatoRequest = async (endpoint, options = {}) => {
  const baseUrl = process.env.GELATO_API_BASE_URL || 'https://order.gelatoapis.com';
  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-API-KEY': process.env.GELATO_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Gelato API error: ${response.status}`);
  }

  return data;
};

/**
 * GET /api/gelato/products
 * Fetch available products from Gelato
 */
router.get('/products', validateApiKey, async (req, res, next) => {
  try {
    // Note: Actual endpoint may vary - check Gelato API docs
    const data = await gelatoRequest('/v4/products', {
      method: 'GET',
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/gelato/upload-image
 * Upload artwork image and get temporary URL
 */
router.post('/upload-image', validateApiKey, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // For now, return the local file path
    // In production, you'd upload to cloud storage (S3, Cloudinary, etc.)
    // and return a publicly accessible URL
    const fileUrl = `${req.protocol}://${req.get('host')}/api/gelato/files/${req.file.filename}`;

    res.json({
      success: true,
      fileUrl,
      filename: req.file.filename,
      size: req.file.size,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gelato/files/:filename
 * Serve uploaded files (temporary - for development only)
 */
router.get('/files/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const filePath = join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', filename);
    
    // Security: validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/gelato/create-order
 * Create a print order with Gelato
 */
router.post('/create-order', validateApiKey, async (req, res, next) => {
  try {
    const { orderData } = req.body;

    if (!orderData) {
      return res.status(400).json({ error: 'Order data is required' });
    }

    // Validate required fields
    if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    if (!orderData.shippingAddress) {
      return res.status(400).json({ error: 'Shipping address is required' });
    }

    // Create order with Gelato
    const data = await gelatoRequest('/v4/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });

    res.json({
      success: true,
      order: data,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gelato/order/:orderId
 * Get order status
 */
router.get('/order/:orderId', validateApiKey, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const data = await gelatoRequest(`/v4/orders/${orderId}`, {
      method: 'GET',
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/gelato/quote
 * Get price quote for an order
 */
router.post('/quote', validateApiKey, async (req, res, next) => {
  try {
    const { quoteData } = req.body;

    if (!quoteData) {
      return res.status(400).json({ error: 'Quote data is required' });
    }

    // Note: Actual endpoint may vary - check Gelato API docs
    const data = await gelatoRequest('/v4/quotes', {
      method: 'POST',
      body: JSON.stringify(quoteData),
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/gelato/files/:filename
 * Clean up uploaded file
 */
router.delete('/files/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    
    // Security: validate filename
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', filename);
    await fs.unlink(filePath);

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    next(error);
  }
});

export default router;
