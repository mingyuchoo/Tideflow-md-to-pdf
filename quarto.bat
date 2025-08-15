@echo off
echo Quarto CLI (mock version)
if "%1"=="render" (
    echo Rendering %2...
    echo Render complete
    exit /b 0
)
echo Unknown command
exit /b 1
