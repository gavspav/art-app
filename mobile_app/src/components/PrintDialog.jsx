import React, { useState, useCallback } from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { PRINT_SIZES, exportHighResImage } from '../utils/imageExport.js';
import { uploadArtwork, createOrder } from '../services/gelatoService.js';
import '../styles/print-dialog.css';

const PRODUCT_UIDS = {
  SMALL: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_12x16',
  MEDIUM: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_18x24',
  LARGE: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_24x36',
  XLARGE: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_30x40',
};

const PrintDialog = ({ isOpen, onClose }) => {
  const artState = useMobileArtState();
  
  const [selectedSize, setSelectedSize] = useState('MEDIUM');
  const [quantity, setQuantity] = useState(1);
  const [shippingAddress, setShippingAddress] = useState({
    firstName: '',
    lastName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    postCode: '',
    state: '',
    country: 'US',
  });
  
  const [status, setStatus] = useState('idle'); // idle, exporting, uploading, ordering, success, error
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [orderConfirmation, setOrderConfirmation] = useState(null);

  const handleAddressChange = useCallback((field, value) => {
    setShippingAddress(prev => ({ ...prev, [field]: value }));
  }, []);

  const validateAddress = useCallback(() => {
    const required = ['firstName', 'lastName', 'addressLine1', 'city', 'postCode', 'country'];
    for (const field of required) {
      if (!shippingAddress[field] || shippingAddress[field].trim() === '') {
        return false;
      }
    }
    return true;
  }, [shippingAddress]);

  const handleSubmitOrder = useCallback(async () => {
    if (!validateAddress()) {
      setErrorMessage('Please fill in all required shipping address fields');
      setStatus('error');
      return;
    }

    try {
      // Step 1: Export high-res image
      setStatus('exporting');
      setProgress(0);
      const printSize = PRINT_SIZES[selectedSize];
      const imageBlob = await exportHighResImage(artState, printSize, (p) => {
        setProgress(p * 0.3); // 0-30% for export
      });

      // Step 2: Upload image
      setStatus('uploading');
      const uploadResult = await uploadArtwork(imageBlob, (p) => {
        setProgress(0.3 + p * 0.4); // 30-70% for upload
      });

      // Step 3: Create order
      setStatus('ordering');
      setProgress(0.7);

      const orderData = {
        orderType: 'order',
        orderReferenceId: `artwork-${Date.now()}`,
        currency: 'USD',
        items: [
          {
            itemReferenceId: `item-${Date.now()}`,
            productUid: PRODUCT_UIDS[selectedSize],
            files: [
              {
                url: uploadResult.fileUrl,
                type: 'default',
              },
            ],
            quantity,
          },
        ],
        shippingAddress: {
          firstName: shippingAddress.firstName,
          lastName: shippingAddress.lastName,
          addressLine1: shippingAddress.addressLine1,
          ...(shippingAddress.addressLine2 && { addressLine2: shippingAddress.addressLine2 }),
          city: shippingAddress.city,
          postCode: shippingAddress.postCode,
          ...(shippingAddress.state && { state: shippingAddress.state }),
          country: shippingAddress.country,
        },
      };

      const orderResult = await createOrder(orderData);
      setProgress(1.0);
      setStatus('success');
      setOrderConfirmation(orderResult.order);
    } catch (error) {
      console.error('Order error:', error);
      setErrorMessage(error.message || 'Failed to create order');
      setStatus('error');
    }
  }, [artState, selectedSize, quantity, shippingAddress, validateAddress]);

  const handleClose = useCallback(() => {
    if (status === 'exporting' || status === 'uploading' || status === 'ordering') {
      // Don't allow closing during processing
      return;
    }
    setStatus('idle');
    setProgress(0);
    setErrorMessage('');
    setOrderConfirmation(null);
    onClose();
  }, [status, onClose]);

  if (!isOpen) return null;

  return (
    <div className="print-dialog-overlay" onClick={handleClose}>
      <div className="print-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="print-dialog__header">
          <h2>Order Print</h2>
          <button
            type="button"
            className="print-dialog__close"
            onClick={handleClose}
            disabled={status === 'exporting' || status === 'uploading' || status === 'ordering'}
          >
            ✕
          </button>
        </div>

        <div className="print-dialog__content">
          {status === 'success' && orderConfirmation ? (
            <div className="print-dialog__success">
              <div className="success-icon">✓</div>
              <h3>Order Placed Successfully!</h3>
              <p>Order ID: {orderConfirmation.id || orderConfirmation.orderReferenceId}</p>
              <p>You will receive a confirmation email shortly.</p>
              <button type="button" className="btn-primary" onClick={handleClose}>
                Close
              </button>
            </div>
          ) : status === 'error' ? (
            <div className="print-dialog__error">
              <div className="error-icon">⚠</div>
              <h3>Order Failed</h3>
              <p>{errorMessage}</p>
              <button type="button" className="btn-secondary" onClick={() => setStatus('idle')}>
                Try Again
              </button>
            </div>
          ) : status === 'exporting' || status === 'uploading' || status === 'ordering' ? (
            <div className="print-dialog__progress">
              <div className="progress-spinner"></div>
              <p>
                {status === 'exporting' && 'Preparing high-resolution image...'}
                {status === 'uploading' && 'Uploading artwork...'}
                {status === 'ordering' && 'Creating order...'}
              </p>
              <div className="progress-bar">
                <div className="progress-bar__fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="progress-percent">{Math.round(progress * 100)}%</p>
            </div>
          ) : (
            <>
              {/* Print Size Selection */}
              <div className="form-section">
                <h3>Print Size</h3>
                <div className="size-options">
                  {Object.entries(PRINT_SIZES).map(([key, size]) => (
                    <label key={key} className="size-option">
                      <input
                        type="radio"
                        name="size"
                        value={key}
                        checked={selectedSize === key}
                        onChange={(e) => setSelectedSize(e.target.value)}
                      />
                      <span className="size-option__label">{size.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div className="form-section">
                <label htmlFor="quantity">
                  <h3>Quantity</h3>
                  <input
                    id="quantity"
                    type="number"
                    min="1"
                    max="100"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="input-number"
                  />
                </label>
              </div>

              {/* Shipping Address */}
              <div className="form-section">
                <h3>Shipping Address</h3>
                <div className="address-form">
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="First Name *"
                      value={shippingAddress.firstName}
                      onChange={(e) => handleAddressChange('firstName', e.target.value)}
                      className="input-text"
                    />
                    <input
                      type="text"
                      placeholder="Last Name *"
                      value={shippingAddress.lastName}
                      onChange={(e) => handleAddressChange('lastName', e.target.value)}
                      className="input-text"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Address Line 1 *"
                    value={shippingAddress.addressLine1}
                    onChange={(e) => handleAddressChange('addressLine1', e.target.value)}
                    className="input-text"
                  />
                  <input
                    type="text"
                    placeholder="Address Line 2"
                    value={shippingAddress.addressLine2}
                    onChange={(e) => handleAddressChange('addressLine2', e.target.value)}
                    className="input-text"
                  />
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="City *"
                      value={shippingAddress.city}
                      onChange={(e) => handleAddressChange('city', e.target.value)}
                      className="input-text"
                    />
                    <input
                      type="text"
                      placeholder="State/Province"
                      value={shippingAddress.state}
                      onChange={(e) => handleAddressChange('state', e.target.value)}
                      className="input-text"
                    />
                  </div>
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="Postal Code *"
                      value={shippingAddress.postCode}
                      onChange={(e) => handleAddressChange('postCode', e.target.value)}
                      className="input-text"
                    />
                    <select
                      value={shippingAddress.country}
                      onChange={(e) => handleAddressChange('country', e.target.value)}
                      className="input-select"
                    >
                      <option value="US">United States</option>
                      <option value="CA">Canada</option>
                      <option value="GB">United Kingdom</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                      <option value="IT">Italy</option>
                      <option value="ES">Spain</option>
                      <option value="AU">Australia</option>
                      <option value="NZ">New Zealand</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleSubmitOrder}>
                  Place Order
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintDialog;
