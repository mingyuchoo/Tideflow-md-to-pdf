# Quiet Tauri Build Script
# This script runs the Tauri build with minimal console output and no popup windows

Write-Host "Starting Tauri build..." -ForegroundColor Green

# Change to project directory
Set-Location "C:\Users\Deniz\Desktop\newapp\Tideflow-md-to-pdf"

# Run build with output redirected to log file
npm run tauri:build > build.log 2>&1

# Check if build was successful
if ($LASTEXITCODE -eq 0) {
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host "Check build.log for detailed output" -ForegroundColor Yellow
    Write-Host "Installer: src-tauri\target\release\bundle\nsis\Tideflow_0.1.0_x64-setup.exe" -ForegroundColor Cyan
} else {
    Write-Host "Build failed! Check build.log for errors" -ForegroundColor Red
}

Write-Host "Press any key to exit..."
$null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")