@echo off
title WhatsApp Automation - Secure Cloudflare Tunnel
echo ==========================================================
echo   Starting 100%% Secure Cloudflare Tunnel for your Bot...
echo   (Bank-Grade SSL, No Warnings, No Passwords!)
echo ==========================================================
echo.
cd /d "%~dp0"

if not exist "cloudflared.exe" (
    echo Downloading official cloudflared binary...
    curl.exe -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)

echo Starting tunnel...
.\cloudflared.exe tunnel --url http://localhost:3000
pause
