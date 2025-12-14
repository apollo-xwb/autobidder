# 🚀 Quick Start: Deploy to Render.com

## Step 1: Push to GitHub (2 minutes)

```bash
# If you haven't initialized git yet
git init
git add .
git commit -m "Ready for Render deployment"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/autobidder.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy on Render (3 minutes)

1. **Go to**: https://render.com
2. **Sign up** with GitHub
3. **Click**: "New +" → "Web Service"
4. **Connect** your GitHub repository
5. **Configure**:
   - **Name**: `autobidder-api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python api_server.py`
   - **Instance Type**: `Free`
6. **Click**: "Create Web Service"

## Step 3: Add Environment Variables (2 minutes)

**Option A: Use the helper script** (recommended):
```bash
python setup_render_env.py
```
Copy the output and paste into Render dashboard.

**Option B: Manual setup**:
1. In Render dashboard → Your service → "Environment"
2. Click "Add Environment Variable"
3. Add these (from your `config.py`):
   - `OAUTH_TOKEN` = your token
   - `YOUR_BIDDER_ID` = your ID
   - `GEMINI_API_KEY` = your key
   - `TELEGRAM_TOKEN` = your token
   - `TELEGRAM_CHAT_ID` = your chat ID
   - `PORT` = `8000` (optional, Render sets this automatically)

## Step 4: Keep It Awake (1 minute)

Render free tier sleeps after 15 minutes. Keep it awake:

1. **Go to**: https://uptimerobot.com (free)
2. **Sign up** and create a monitor:
   - **URL**: `https://your-service-name.onrender.com/health`
   - **Interval**: 5 minutes
   - **Type**: HTTP(s)

## Step 5: Test It

Once deployed, test your API:
```bash
curl https://your-service-name.onrender.com/health
```

You should see: `{"status":"ok","message":"API server is running"}`

## ✅ Done!

Your autobidder is now running 24/7! 🎉

**Access your API**: `https://your-service-name.onrender.com`

**View logs**: Render dashboard → Your service → "Logs"

**Update code**: Just push to GitHub, Render auto-deploys!

---

## 📋 Full Documentation

See `RENDER_DEPLOYMENT.md` for detailed instructions, troubleshooting, and advanced configuration.

