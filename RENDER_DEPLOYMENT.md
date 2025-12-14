# 🚀 Render.com Deployment Guide

## Quick Start (5 minutes)

### Step 1: Push to GitHub
1. Initialize git (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Create a GitHub repository and push:
   ```bash
   git remote add origin https://github.com/yourusername/autobidder.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy on Render

1. **Sign up/Login**: Go to https://render.com and sign up with GitHub

2. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub account if prompted
   - Select your repository

3. **Configure Service**:
   - **Name**: `autobidder-api` (or any name you like)
   - **Environment**: `Python 3`
   - **Region**: Choose closest to you
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: Leave empty (or `.` if needed)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python api_server.py`
   - **Instance Type**: `Free` (or upgrade later)

4. **Environment Variables** (Click "Advanced" → "Add Environment Variable"):
   - `PORT`: `8000` (Render sets this automatically, but good to have)
   - **Optional**: Add your config values here instead of using `config.py`:
     - `OAUTH_TOKEN`: Your Freelancer OAuth token
     - `YOUR_BIDDER_ID`: Your bidder ID
     - `GEMINI_API_KEY`: Your Gemini API key
     - `TELEGRAM_TOKEN`: Your Telegram bot token
     - `TELEGRAM_CHAT_ID`: Your Telegram chat ID

5. **Click "Create Web Service"**

6. **Wait for deployment** (2-5 minutes)

### Step 3: Configure Your App

**Option A: Use config.py file**
- Render's file system is persistent, so you can edit `config.py` directly
- SSH into your service (if available) or use Render Shell
- Or commit your `config.py` to git (⚠️ **NOT RECOMMENDED** - exposes secrets)

**Option B: Use Environment Variables (RECOMMENDED)**
- Add all config values as environment variables in Render dashboard
- Update `api_server.py` to read from environment variables first, then fall back to `config.py`

### Step 4: Access Your API

Once deployed, your API will be available at:
```
https://autobidder-api.onrender.com
```

Test it:
```bash
curl https://autobidder-api.onrender.com/health
```

## 🔧 Important Configuration

### Database Persistence

**⚠️ IMPORTANT**: Render's free tier has **ephemeral storage**. Your SQLite database may be lost on restarts.

**Solutions**:

1. **Use External Database** (Recommended):
   - **Supabase** (Free PostgreSQL): https://supabase.com
   - **Neon** (Free PostgreSQL): https://neon.tech
   - Update your code to use PostgreSQL instead of SQLite

2. **Regular Backups**:
   - Set up a cron job to backup SQLite to cloud storage
   - Use GitHub Actions for automated backups

3. **Upgrade to Render Pro**:
   - $7/month for persistent disk storage

### Keep Service Awake

Render free tier services **sleep after 15 minutes of inactivity**.

**Solution**: Use a monitoring service to ping your API:
- **UptimeRobot** (Free): https://uptimerobot.com
  - Add monitor: `https://autobidder-api.onrender.com/health`
  - Set interval: 5 minutes
  - This keeps your service awake 24/7

### Frontend Deployment (Optional)

Deploy your React frontend separately:

1. **Vercel** (Recommended - Free):
   - Connect GitHub repo
   - Root directory: `frontend`
   - Build command: `npm install && npm run build`
   - Output directory: `dist`
   - Update `vite.config.ts` proxy to point to your Render URL

2. **Netlify** (Free alternative):
   - Similar setup to Vercel

## 📊 Monitoring & Logs

- **View Logs**: Render dashboard → Your service → "Logs" tab
- **Real-time logs**: Click "View Live Logs"
- **Metrics**: View CPU, memory, and request metrics in dashboard

## 🔄 Updating Your App

1. Make changes locally
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Update description"
   git push
   ```
3. Render automatically detects changes and redeploys
4. Watch deployment progress in Render dashboard

## 🐛 Troubleshooting

### Service won't start
- Check logs in Render dashboard
- Verify `requirements.txt` has all dependencies
- Ensure `api_server.py` is in root directory

### Database errors
- SQLite may not work well on Render (file system issues)
- Consider switching to PostgreSQL (Supabase/Neon)

### Service keeps sleeping
- Set up UptimeRobot to ping `/health` endpoint every 5 minutes
- Or upgrade to paid plan

### Port errors
- Render sets `PORT` environment variable automatically
- Your code already reads `PORT` from environment (good!)

## 💰 Free Tier Limits

- **750 hours/month** (enough for 24/7)
- **512 MB RAM**
- **0.5 CPU**
- **Ephemeral storage** (data may be lost on restart)
- **Sleeps after 15 min inactivity** (unless pinged)

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Render account created
- [ ] Web service created
- [ ] Environment variables set (or config.py configured)
- [ ] Service deployed successfully
- [ ] Health check endpoint working
- [ ] UptimeRobot monitoring set up (to prevent sleep)
- [ ] Database backup strategy in place
- [ ] Frontend deployed (optional)

## 🎉 You're Done!

Your autobidder is now running 24/7 on Render.com!

Access your API at: `https://your-service-name.onrender.com`

Monitor it in the Render dashboard and set up UptimeRobot to keep it awake.

