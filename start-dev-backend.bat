@echo off
REM Starts everything life_os needs to run locally: Docker's PostgreSQL
REM container, then the NestJS API. Leave this window open while using
REM the app — closing it stops the API. Double-click this file to run it.

set PATH=%PATH%;%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin

cd /d "%~dp0"
echo Starting PostgreSQL (Docker)...
docker compose up -d

echo.
echo Starting API...
cd apps\api
node dist\src\main.js
