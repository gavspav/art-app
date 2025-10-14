/**
 * Client-side service for interacting with Gelato backend proxy
 */

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Upload artwork image to backend
 * @param {Blob} imageBlob - Image blob from canvas export
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Object>} Upload response with fileUrl
 */
export const uploadArtwork = async (imageBlob, onProgress = null) => {
  const formData = new FormData();
  formData.append('image', imageBlob, 'artwork.png');

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded / e.total);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (error) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.open('POST', `${API_BASE_URL}/api/gelato/upload-image`);
    xhr.send(formData);
  });
};

/**
 * Get available products from Gelato
 * @returns {Promise<Object>} Products catalog
 */
export const getProducts = async () => {
  const response = await fetch(`${API_BASE_URL}/api/gelato/products`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch products');
  }
  return response.json();
};

/**
 * Get price quote for an order
 * @param {Object} quoteData - Quote request data
 * @returns {Promise<Object>} Quote response with pricing
 */
export const getQuote = async (quoteData) => {
  const response = await fetch(`${API_BASE_URL}/api/gelato/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quoteData }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get quote');
  }

  return response.json();
};

/**
 * Create a print order
 * @param {Object} orderData - Complete order data
 * @returns {Promise<Object>} Order confirmation
 */
export const createOrder = async (orderData) => {
  const response = await fetch(`${API_BASE_URL}/api/gelato/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderData }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create order');
  }

  return response.json();
};

/**
 * Get order status
 * @param {string} orderId - Gelato order ID
 * @returns {Promise<Object>} Order status
 */
export const getOrderStatus = async (orderId) => {
  const response = await fetch(`${API_BASE_URL}/api/gelato/order/${orderId}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get order status');
  }

  return response.json();
};

/**
 * Delete uploaded file from backend
 * @param {string} filename - Filename to delete
 * @returns {Promise<Object>} Deletion confirmation
 */
export const deleteFile = async (filename) => {
  const response = await fetch(`${API_BASE_URL}/api/gelato/files/${filename}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete file');
  }

  return response.json();
};
