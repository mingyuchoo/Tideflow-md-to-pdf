@echo off
echo Starting Tauri build...
cd "C:\Users\Deniz\Desktop\newapp\Tideflow-md-to-pdf"
npm run tauri:build > build.log 2>&1
if %errorlevel% equ 0 (
    echo Build completed successfully!
    echo Check build.log for detailed output
    echo Installer: src-tauri\target\release\bundle\nsis\Tideflow_0.1.0_x64-setup.exe
) else (
    echo Build failed! Check build.log for errors
)
pause