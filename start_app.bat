@echo off
echo ===================================================
echo Starting LayerShift: Generate Editable Layers
echo ===================================================
echo Backend & Frontend serving on http://localhost:5000
echo.

set PYTHON_EXE=C:\Users\Acer\AppData\Local\Python\bin\python.exe
if not exist "%PYTHON_EXE%" (
    set PYTHON_EXE=python
)

cd /d "%~dp0backend"
"%PYTHON_EXE%" app.py
pause
