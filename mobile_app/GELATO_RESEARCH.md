# Gelato API Research Findings

## API Overview

### Authentication
- **Method:** X-API-KEY header
- **Environments:**
  - Test: `https://connect.test.gelato.tech/`
  - Live: `https://connect.live.gelato.tech/`
- **Rate Limit:** 100 requests per second
- **API Key:** Must contact Gelato team to obtain (separate keys for test/live)

### Key Endpoints
- **Create Order:** `POST https://order.gelatoapis.com/v4/orders`
- **Product Catalog:** Available through API Portal (product UIDs with dimensions)
- **Webhooks:** Gelato sends POST requests for order updates

### Order Structure (v4)
```json
{
  "orderType": "order",
  "orderReferenceId": "{{myOrderId}}",
  "customerReferenceId": "{{myCustomerId}}",
  "currency": "USD",
  "items": [
    {
      "itemReferenceId": "{{myItemId1}}",
      "productUid": "cards_pf_a5_pt_350-gsm-coated-silk_cl_4-4_ver",
      "files": [
        {
          "url": "https://example.com/file.pdf",
          "type": "default"
        }
      ],
      "quantity": 1
    }
  ],
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "addressLine1": "123 Main St",
    "city": "New York",
    "postCode": "10001",
    "country": "US"
  }
}
```

## Image Requirements

### General Requirements
- **Resolution:** Minimum 300 DPI for high-quality prints
- **Format:** PDF/X preferred (print-ready PDFs), also accepts PNG/JPEG
- **Color Space:** CMYK recommended for accurate color reproduction
- **Bleed:** Required (typically 3mm/0.125" on all sides)

### Common Poster Sizes (estimated dimensions at 300 DPI)
| Size | Inches | Pixels @ 300 DPI | Common Use |
|------|--------|------------------|------------|
| Small | 12x16" | 3600x4800 | Room decor |
| Medium | 18x24" | 5400x7200 | Standard poster |
| Large | 24x36" | 7200x10800 | Statement piece |
| Extra Large | 30x40" | 9000x12000 | Gallery quality |

### Product Types Available
- Posters (various sizes)
- Canvas prints
- Framed prints
- Cards
- Apparel (t-shirts, hoodies)
- Photo books
- Mugs

## Implementation Notes

### File Upload Strategy
1. **Option A:** Direct URL reference
   - Host image on accessible server
   - Provide URL in order JSON
   - Gelato fetches file during processing

2. **Option B:** Upload to Gelato storage (if available)
   - Check if Gelato provides file upload endpoint
   - Upload image first, get reference ID
   - Use reference in order creation

### Recommended Approach for This App
1. Generate high-res canvas (7200x10800 for 24x36" @ 300 DPI)
2. Export as PNG (lossless) or high-quality JPEG
3. Upload to temporary storage (backend endpoint)
4. Backend creates Gelato order with file URL
5. Clean up temporary file after order confirmation

### Security Architecture
```
Mobile App → Backend Proxy → Gelato API
              (stores API key)
              (handles file upload)
              (creates orders)
```

## Next Steps
1. ✅ Research complete
2. Define target print sizes (recommend: 18x24", 24x36")
3. Implement high-res canvas export
4. Create backend proxy service
5. Build UI for product selection and ordering
