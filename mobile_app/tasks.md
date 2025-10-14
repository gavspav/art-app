# Gelato Print-on-Demand Implementation Tasks

## Phase 1: Research & Planning ✅

### Task 1.1: Research Gelato API ✅
- [x] Review Gelato API documentation for endpoints, authentication, image requirements
- [x] Identify required product types (posters, canvases, framed prints, etc.)
- [x] Document image specifications (min/max dimensions, DPI requirements, accepted formats)
- [x] Review pricing API and order creation flow

### Task 1.2: Define Image Requirements ✅
- [x] Determine target print sizes (e.g., 18x24", 24x36")
- [x] Calculate required pixel dimensions for 300 DPI output
- [x] Plan upscaling strategy if canvas is smaller than print requirements

## Phase 2: High-Resolution Image Export ✅

### Task 2.1: Implement Lossless Canvas Export ✅
- [x] Create `exportHighResImage()` function in `src/utils/imageExport.js`
- [x] Render artwork to off-screen canvas at target print resolution (e.g., 7200x10800 for 24x36" @ 300 DPI)
- [x] Export as PNG (lossless) or high-quality JPEG (98-100%)
- [x] Add option to export multiple resolutions for different print products

### Task 2.2: Image Upscaling Strategy ✅
- [x] For vector-like artwork (your shapes), re-render at target resolution rather than upscaling
- [x] Preserve all layer, blend mode, and parameter state during high-res render
- [x] Add progress indicator for large renders

## Phase 3: Backend API Proxy (Recommended Architecture) ✅

### Task 3.1: Create Node.js/Express Backend Service ✅
- [x] Set up minimal Express server to proxy Gelato API calls
- [x] Store Gelato API key in server environment variables
- [x] Create endpoints:
  - [x] `POST /api/gelato/upload-image` - Upload image to Gelato
  - [x] `POST /api/gelato/create-order` - Create print order
  - [x] `GET /api/gelato/products` - Fetch available products
  - [x] `GET /api/gelato/order/:id` - Check order status

### Task 3.2: Secure API Key Storage ✅
- [x] **Development:** Store in `.env` file (never commit to git)
- [x] **Production:** Use environment variables on hosting platform (Vercel, Netlify, Railway, etc.)
- [x] Backend validates requests and adds Gelato API key to outgoing calls
- [x] Client never sees or handles the API key

## Phase 4: Client-Side Integration ✅

### Task 4.1: Add Print UI Components ✅
- [x] Create `PrintDialog.jsx` component with:
  - [x] Product selection (poster sizes, canvas, framed prints)
  - [x] Preview of artwork with size overlay
  - [x] Shipping address form
  - [x] Price display
  - [x] Order confirmation

### Task 4.2: Add Print Button to HeaderBar ✅
- [x] New "Print" button that opens `PrintDialog`
- [x] Disable if artwork hasn't been created/modified

### Task 4.3: Implement Order Flow ✅
- [x] Export high-res image when user initiates print
- [x] Convert canvas to Blob/File
- [x] Upload to backend proxy
- [x] Backend forwards to Gelato with API key
- [x] Display order confirmation with tracking info

## Phase 5: Environment Configuration ✅

### Task 5.1: Local Development Setup ✅
- [x] Create `.env.example` template
- [x] Add `.env` to `.gitignore`
- [x] Document setup in README

### Task 5.2: Production Deployment ✅
- [x] Configure environment variables on hosting platform
- [x] Set up CORS policies for client-to-backend communication
- [x] Enable HTTPS for secure API communication

## Phase 6: Testing & Polish ✅

### Task 6.1: Test Complete Workflow ⚠️ (Ready for Testing)
- [ ] Test with Gelato sandbox/test API first
- [ ] Verify image quality at print resolutions
- [ ] Test order creation and status polling
- [ ] Validate pricing calculations
- [ ] Test error handling (payment failures, API errors)

### Task 6.2: Add User Feedback ✅
- [x] Loading states during image export and upload
- [x] Success/error messages
- [x] Order tracking link after successful order

---

## Architecture Summary

**Security Pattern (Recommended):**
```
Mobile App → Your Backend → Gelato API
            (API key here)
```

**Why this approach:**
- API key never exposed to client
- You control rate limiting and validation
- Can add custom business logic (discounts, user tracking)
- Can cache Gelato product info to reduce API calls

**Alternative (Less Secure):**
If you embed the key in the mobile app, users can extract it from the JavaScript bundle. Only viable if Gelato provides read-only or limited-scope keys.

## Estimated File Changes

**New Files:**
- `src/components/PrintDialog.jsx`
- `src/utils/imageExport.js`
- `src/services/gelatoService.js` (client-side API wrapper)
- `backend/server.js` (Express proxy)
- `backend/routes/gelato.js`
- `backend/.env`

**Modified Files:**
- `src/components/HeaderBar.jsx` (add Print button)
- `src/components/TouchCanvas.jsx` (expose high-res export)
- `package.json` (add backend dependencies)
