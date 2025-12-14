# Autobidder Dashboard

A modern React + TypeScript frontend for managing your Freelancer autobidder.

## Quick Start

### 1. Start the API Server (Backend)

Open a terminal and run:
```bash
python api_server.py
```

The API server will start on `http://localhost:8000`

### 2. Start the Frontend

Open a **new terminal** and run:
```bash
cd frontend
npm install  # Only needed the first time
npm run dev
```

The frontend will start on `http://localhost:3000`

### 3. Access the Dashboard

Open your browser and go to:
```
http://localhost:3000
```

## What You'll See

- **Dashboard**: View stats and control the autobidder
- **Bids**: View all your bid history with messages
- **Config**: Edit configuration settings
- **Prompt**: Edit the prompt template
- **Skills**: Manage your skills list

## Features

- ✅ Real-time logs viewer (updates every second)
- ✅ Start/Stop autobidder from the UI
- ✅ View actual bid messages
- ✅ Black & white glassmorphism design
- ✅ Mobile responsive
- ✅ All data stored in local SQLite database

## Troubleshooting

- **API server not starting?** Make sure Flask is installed: `pip install flask flask-cors`
- **Frontend not loading?** Make sure you're in the `frontend` directory and run `npm install` first
- **Port already in use?** Change the port in `api_server.py` (line 335) or `vite.config.ts` (line 6)



