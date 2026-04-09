@echo off
REM Script para iniciar el backend y abrir la app en Brave
cd /d "%~dp0\backend"
REM Mata procesos previos en el puerto 5000 si existen
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo Terminando proceso %%a en puerto 5000...
    taskkill /PID %%a /F >nul 2>&1
)
REM Inicia nodemon en segundo plano
echo Iniciando backend en http://localhost:5000 ...
start "Backend" cmd /k "npm run dev"
REM Espera a que el servidor arranque (15s)
echo Esperando a que el servidor arranque...
ping 127.0.0.1 -n 15 > nul
REM Abre Brave en la URL del frontend
echo Abriendo Brave...
start "Brave" "brave" "http://localhost:5000/"
echo Hecho. Mantén esta ventana abierta para ver logs de backend.