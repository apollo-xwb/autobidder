# Free Hosting Guide for Autobidder

## 🚀 Recommended: Render.com (Easiest & Most Reliable)

### Why Render?
- ✅ **Free tier** with 750 hours/month (enough for 24/7)
- ✅ **Automatic deployments** from GitHub
- ✅ **Persistent storage** for SQLite database
- ✅ **Easy setup** - just connect GitHub repo
- ✅ **Free SSL** certificate
- ✅ **No credit card required** for free tier

### Setup Steps:

1. **Prepare your code:**
   - Make sure `requirements.txt` exists with all dependencies
   - The `Procfile` is already created for you
   - Commit and push to GitHub

2. **Deploy on Render:**
   - Go to https://render.com
   - Sign up with GitHub
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Settings:
     - **Name:** autobidder-api
     - **Environment:** Python 3
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `python api_server.py`
     - **Port:** 8000 (or leave default)
   - Click "Create Web Service"

3. **Environment Variables:**
   Add these in Render dashboard under "Environment":
   - `PORT=8000` (Render sets this automatically, but good to have)
   - Your config values (or use the config.py file)

4. **Update Frontend:**
   - Update `frontend/vite.config.ts` proxy target to your Render URL
   - Or deploy frontend separately on Vercel/Netlify (free)

### Alternative: Railway.app
- Similar to Render
- $5 free credit monthly
- Great for Python apps
- Visit: https://railway.app

### Alternative: Fly.io
- Free tier available
- Good for Python apps
- More complex setup
- Visit: https://fly.io

## 📊 Database Persistence

**Important:** SQLite files on free hosting can be lost. Options:

1. **Use Render Disk** (Render Pro feature - not free)
2. **Use external database:**
   - **Supabase** (free PostgreSQL)
   - **Neon** (free PostgreSQL)
   - **PlanetScale** (free MySQL)

3. **Backup regularly:**
   - Add a cron job to backup SQLite to cloud storage
   - Use GitHub Actions for automated backups

## 🔄 Running 24/7

Render free tier:
- ✅ **750 hours/month** = ~31 days of 24/7 runtime
- ✅ Perfect for running continuously
- ⚠️ Service may sleep after 15 min of inactivity (wakes on request)

To prevent sleep:
- Use a monitoring service (UptimeRobot - free)
- Ping your service every 5 minutes

## 📝 Quick Start Checklist

- [ ] Push code to GitHub
- [ ] Create Render account
- [ ] Deploy web service
- [ ] Set environment variables
- [ ] Test API endpoints
- [ ] Set up uptime monitoring (optional)
- [ ] Update frontend API URL

## 🎯 What You Get

After deployment:
- ✅ API running 24/7
- ✅ Bid history with prompt tracking
- ✅ Automatic bidding while you sleep
- ✅ Full analytics dashboard
- ✅ Accessible from anywhere




