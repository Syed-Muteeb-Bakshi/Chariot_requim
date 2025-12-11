@echo off
echo.
echo ========================================
echo   VENTO AUREO - Starting Node Server
echo ========================================
echo.
echo Checking Node.js installation...
node --version
echo.
echo Starting server on port 8000...
echo.
node demo-server.js 8000
pause
