@echo off
echo ===================================================
echo Starting LayerShift Frontend (Vite Dev Server)
echo ===================================================
echo Frontend: http://localhost:5173
echo Proxies /api to http://localhost:5000
echo.

cd /d "%~dp0frontend"
npm run dev
pause
