@echo off
echo ========================================
echo Starting Autobidder Dashboard
echo ========================================
echo.
echo Starting API Server...
start "API Server" cmd /k "python api_server.py"
timeout /t 3 /nobreak >nul
echo.
echo Starting Frontend...
cd frontend
start "Frontend" cmd /k "npm run dev"
cd ..
echo.
echo ========================================
echo Both servers are starting!
echo.
echo API Server: http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Press any key to exit this window...
pause >nul



