# Autobidder Mobile App

React Native mobile app to visualize and customize your autobidder configuration.

## Features

- **Dashboard**: View autobidder status, statistics, and recent bids
- **Config Editor**: Edit all configuration settings (API keys, bid settings, etc.)
- **Prompt Editor**: Customize the prompt template used for generating bid messages
- **Skills Manager**: Add, remove, and manage your skills list
- **Bids View**: View all your bids with search and filtering

## Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Start the Python API Server

In the root directory (where `api_server.py` is):

```bash
pip install flask flask-cors
python api_server.py
```

The API server will run on `http://localhost:8000`

### 3. Update API URL (if needed)

If your API server is running on a different address, update `mobile/services/api.js`:

```javascript
const API_BASE_URL = 'http://YOUR_IP:8000';
```

For Android emulator, use `http://10.0.2.2:8000`
For iOS simulator, use `http://localhost:8000`
For physical device, use your computer's IP address (e.g., `http://192.168.1.100:8000`)

### 4. Run the App

```bash
# Start Expo
npm start

# Or run on specific platform
npm run android
npm run ios
```

## App Structure

- `App.js` - Main app component with navigation
- `screens/` - All screen components
  - `DashboardScreen.js` - Main dashboard with stats and controls
  - `ConfigScreen.js` - Configuration editor
  - `PromptScreen.js` - Prompt template editor
  - `SkillsScreen.js` - Skills management
  - `BidsScreen.js` - Bids viewer
- `services/` - API and database services
  - `api.js` - API client for Python server
  - `database.js` - Local SQLite database operations

## Local Storage

The app uses SQLite (via expo-sqlite) to store:
- Configuration settings
- Prompt templates
- Skills list
- Bids cache

All data is stored locally and synced with the Python API server when available.

## Notes

- The app works offline using local database
- Changes are saved to both local DB and Python API server (when available)
- The Python API server reads/writes directly to `config.py` and `autobidder.py`

