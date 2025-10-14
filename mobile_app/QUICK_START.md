# Quick Start Guide - Gelato Integration

## 🚀 Get Running in 5 Minutes

### 1. Install Backend Dependencies
```bash
cd backend
npm install
```

### 2. Configure Backend
```bash
cp .env.example .env
```

Edit `backend/.env` and add your Gelato API key:
```env
GELATO_API_KEY=your_api_key_here
```

### 3. Start Backend
```bash
npm run dev
```

Backend runs on http://localhost:3001

### 4. Configure Frontend
```bash
cd ..  # Back to mobile_app root
cp .env.example .env
```

The default `.env` should work:
```env
VITE_BACKEND_URL=http://localhost:3001
```

### 5. Start Frontend
```bash
npm run dev
```

Frontend runs on http://localhost:5173

### 6. Test It!

1. Open http://localhost:5173
2. Create artwork (or click randomize 🎲)
3. Click **🖼️ Print** button
4. Select size and fill shipping address
5. Click **Place Order**

## 📝 Test Shipping Address

Use this for testing:
```
First Name: John
Last Name: Doe
Address Line 1: 123 Test Street
City: New York
State: NY
Postal Code: 10001
Country: United States
```

## ⚠️ Important Notes

- **Test Mode:** Use Gelato test API key for development
- **Product UIDs:** May need updating based on Gelato's catalog
- **File Storage:** Currently stores uploads locally (use cloud storage for production)
- **API Key Security:** Never commit `.env` files to Git

## 🔧 Troubleshooting

**Backend won't start:**
- Check Node.js version (need 18+)
- Verify `GELATO_API_KEY` is set in `backend/.env`

**Frontend can't connect:**
- Ensure backend is running on port 3001
- Check `VITE_BACKEND_URL` in `.env`

**Order fails:**
- Verify API key is valid
- Check product UIDs match Gelato catalog
- Review backend console for error details

## 📚 Full Documentation

See `SETUP_GELATO.md` for complete setup, deployment, and production configuration.
