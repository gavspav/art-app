# Gelato Print-on-Demand Setup Guide

This guide walks you through setting up the Gelato print-on-demand integration for the mobile art app.

## Prerequisites

- Node.js 18+ installed
- Gelato API account and API key
- Basic understanding of environment variables

## Step 1: Get Gelato API Key

1. Visit [Gelato's contact page](https://gelato.com/en-US/contact/) to request API access
2. Specify you need API integration for print-on-demand
3. Request both **test** and **live** API keys
4. Save your API keys securely

## Step 2: Backend Setup

### Install Backend Dependencies

```bash
cd backend
npm install
```

### Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Gelato API key:
```env
GELATO_API_KEY=your_actual_api_key_here
GELATO_API_BASE_URL=https://order.test.gelatoapis.com  # Use test for development
GELATO_CONNECT_BASE_URL=https://connect.test.gelato.tech

PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
MAX_FILE_SIZE_MB=50
UPLOAD_DIR=./uploads
```

3. For production, use live URLs:
```env
GELATO_API_BASE_URL=https://order.gelatoapis.com
GELATO_CONNECT_BASE_URL=https://connect.live.gelato.tech
```

### Start Backend Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The backend will run on `http://localhost:3001` by default.

## Step 3: Frontend Setup

### Configure Frontend Environment

1. Copy the example environment file in the root directory:
```bash
cd ..  # Back to mobile_app root
cp .env.example .env
```

2. Edit `.env`:
```env
VITE_BACKEND_URL=http://localhost:3001
```

For production, update to your deployed backend URL:
```env
VITE_BACKEND_URL=https://your-backend-domain.com
```

### Install Frontend Dependencies (if not already done)

```bash
npm install
```

### Start Frontend Development Server

```bash
npm run dev
```

The app will run on `http://localhost:5173` by default.

## Step 4: Test the Integration

1. Open the app in your browser
2. Create or randomize some artwork
3. Click the **🖼️ Print** button in the header
4. Select a print size (e.g., 18x24")
5. Fill in a test shipping address
6. Click **Place Order**

### Expected Flow:
- Progress bar shows: "Preparing high-resolution image..." (0-30%)
- Progress bar shows: "Uploading artwork..." (30-70%)
- Progress bar shows: "Creating order..." (70-100%)
- Success message with order ID appears

### Troubleshooting:

**Error: "Gelato API key not configured"**
- Check that `GELATO_API_KEY` is set in `backend/.env`
- Restart the backend server after changing `.env`

**Error: "Failed to fetch" or CORS error**
- Ensure backend is running on port 3001
- Check `VITE_BACKEND_URL` in frontend `.env`
- Verify `ALLOWED_ORIGINS` in backend `.env` includes your frontend URL

**Error: "Gelato API error: 401"**
- Your API key is invalid or expired
- Contact Gelato support to verify your key

**Error: "Gelato API error: 400"**
- Check product UIDs in `PrintDialog.jsx` match Gelato's catalog
- Verify shipping address format matches Gelato's requirements

## Step 5: Production Deployment

### Backend Deployment

#### Option A: Railway / Render / Fly.io

1. Create a new project/service
2. Connect your Git repository
3. Set root directory to `backend/`
4. Configure environment variables in the platform dashboard:
   - `GELATO_API_KEY`
   - `GELATO_API_BASE_URL`
   - `GELATO_CONNECT_BASE_URL`
   - `NODE_ENV=production`
   - `ALLOWED_ORIGINS` (your frontend domain)
5. Deploy

#### Option B: VPS (DigitalOcean, AWS EC2, etc.)

1. SSH into your server
2. Clone repository
3. Install Node.js and npm
4. Copy `.env.example` to `.env` and configure
5. Install dependencies: `npm install`
6. Use PM2 to run the server:
```bash
npm install -g pm2
pm2 start server.js --name gelato-backend
pm2 save
pm2 startup
```

### Frontend Deployment

1. Update `.env` with production backend URL
2. Build the frontend:
```bash
npm run build
```
3. Deploy `dist/` folder to:
   - Vercel
   - Netlify
   - Cloudflare Pages
   - Or any static hosting service

## Step 6: File Storage (Production)

The current backend stores uploaded files locally in `backend/uploads/`. For production, you should use cloud storage:

### Recommended: AWS S3 / Cloudflare R2

1. Install AWS SDK:
```bash
cd backend
npm install @aws-sdk/client-s3
```

2. Update `backend/routes/gelato.js` to upload to S3 instead of local storage
3. Configure S3 credentials in backend `.env`

### Alternative: Cloudinary

1. Install Cloudinary SDK:
```bash
npm install cloudinary
```

2. Update upload logic to use Cloudinary
3. Configure Cloudinary credentials in backend `.env`

## Product UIDs Reference

The following product UIDs are used in `PrintDialog.jsx`. Verify these match Gelato's current catalog:

```javascript
SMALL: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_12x16'
MEDIUM: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_18x24'
LARGE: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_24x36'
XLARGE: 'posters_portrait_pt_170gsm-gloss_cl_4-0_kf_30x40'
```

To get current product UIDs:
1. Visit the Gelato API Portal
2. Browse the Product Catalog
3. Copy the exact `productUid` for each size you want to support

## Security Notes

⚠️ **NEVER commit `.env` files to Git**

✅ **DO:**
- Store API keys in environment variables
- Use backend proxy to hide API keys from client
- Validate all user inputs on backend
- Use HTTPS in production
- Implement rate limiting on backend endpoints

❌ **DON'T:**
- Expose Gelato API key in frontend code
- Commit `.env` files
- Allow unlimited file uploads
- Skip input validation

## Support

- **Gelato API Documentation:** https://dashboard.gelato.com/docs/
- **Gelato Support:** https://gelato.com/en-US/contact/
- **Backend Issues:** Check `backend/` logs
- **Frontend Issues:** Check browser console

## Testing Checklist

- [ ] Backend server starts without errors
- [ ] Frontend connects to backend successfully
- [ ] Print dialog opens when clicking Print button
- [ ] High-res image export completes (check progress bar)
- [ ] Image upload succeeds (check backend logs)
- [ ] Order creation succeeds with test API key
- [ ] Success message displays with order ID
- [ ] Uploaded files are cleaned up (optional)

## Next Steps

1. Test with real Gelato test API key
2. Place a test order and verify it appears in Gelato dashboard
3. Customize product offerings (add canvas, framed prints, etc.)
4. Add pricing display (integrate Gelato quote API)
5. Implement order tracking
6. Add email notifications
7. Switch to live API key for production
