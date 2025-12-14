#!/bin/bash

echo "========================================"
echo "Starting Autobidder Dashboard"
echo "========================================"
echo ""
echo "Starting API Server..."
python api_server.py &
API_PID=$!
sleep 3

echo ""
echo "Starting Frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================"
echo "Both servers are starting!"
echo ""
echo "API Server: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"
echo "========================================"

# Wait for user to stop
trap "kill $API_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait



