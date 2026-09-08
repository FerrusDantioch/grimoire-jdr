@echo off
chcp 65001 >nul
title Grimoire - Compagnon JDR
cd /d "%~dp0"

echo.
echo   GRIMOIRE - Compagnon JDR
echo   ========================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo   [X] Node.js est introuvable.
    echo.
    echo   Installez-le depuis https://nodejs.org puis relancez ce fichier.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo   Premiere utilisation : installation des dependances...
    echo   ^(quelques dizaines de secondes, une seule fois^)
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo   [X] L'installation a echoue.
        pause
        exit /b 1
    )
    echo.
)

echo   Compilation de l'application...
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo   [X] La compilation a echoue.
    pause
    exit /b 1
)

echo.
echo   ------------------------------------------------------
echo    Le navigateur va s'ouvrir sur http://localhost:4173
echo.
echo    Gardez cette fenetre ouverte pendant l'utilisation.
echo    Fermez-la ^(ou Ctrl+C^) pour arreter le serveur.
echo   ------------------------------------------------------
echo.

call npx vite preview --port 4173 --open
pause
