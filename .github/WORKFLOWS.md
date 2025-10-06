# GitHub Actions Workflows

This repository uses GitHub Actions for automated building and testing.

## Workflows

### 1. CI (`ci.yml`)
**Triggers:** On push to `main` or pull requests

**What it does:**
- Runs TypeScript type checking
- Checks Rust code compilation
- Tests on Windows, Linux, and macOS
- Ensures code quality before merging

### 2. Release (`release.yml`)
**Triggers:** When you push a version tag (e.g., `v1.0.0`)

**What it does:**
- Builds installers for all platforms:
  - **Windows**: NSIS installer + MSI
  - **Linux**: DEB, RPM, and AppImage
  - **macOS**: DMG for Intel and Apple Silicon
- Creates a GitHub Release automatically
- Attaches all installers to the release

## How to Create a Release

### Method 1: Using Git Tags (Recommended)

```bash
# 1. Update version in package.json and tauri.conf.json
# 2. Commit your changes
git add .
git commit -m "Release v1.0.1"
git push

# 3. Create and push a tag
git tag v1.0.1
git push origin v1.0.1
```

That's it! GitHub Actions will:
- Build for Windows, Linux, and macOS
- Create a release
- Upload all installers

### Method 2: Manual Trigger

1. Go to GitHub → Actions → "Release Build"
2. Click "Run workflow"
3. Select the branch and click "Run"

## Monitoring Builds

1. Go to your repository on GitHub
2. Click the "Actions" tab
3. You'll see all running and completed workflows
4. Click on any workflow to see detailed logs

## Build Times

Typical build times:
- **Windows**: ~5-10 minutes
- **Linux**: ~5-10 minutes
- **macOS**: ~10-15 minutes (builds both Intel and ARM)

**Total time**: ~15-20 minutes for all platforms

## What Gets Published

After a successful release build, you'll have:

**Windows** (2 installers):
- `Tideflow_X.X.X_x64-setup.exe` - NSIS installer
- `Tideflow_X.X.X_x64_en-US.msi` - MSI installer

**Linux** (3 packages):
- `tideflow_X.X.X_amd64.deb` - Debian/Ubuntu
- `tideflow-X.X.X-1.x86_64.rpm` - Fedora/RHEL
- `tideflow_X.X.X_amd64.AppImage` - Universal portable

**macOS** (2 DMGs):
- `Tideflow_x64.dmg` - Intel Macs
- `Tideflow_aarch64.dmg` - Apple Silicon (M1/M2/M3)

## Troubleshooting

### Build fails on macOS
- Apple code signing isn't configured (optional)
- The unsigned builds will still work, users just need to right-click → Open

### Build fails on Linux
- Check that all dependencies are listed in the workflow
- Ensure Typst binary has correct permissions

### Release not created
- Make sure you pushed a tag starting with `v` (e.g., `v1.0.0`)
- Check the Actions tab for error logs

## Next Steps

To enable code signing for macOS:
1. Add Apple Developer certificates to GitHub Secrets
2. Update the workflow with signing configuration
3. See: https://tauri.app/v1/guides/distribution/sign-macos

For Windows code signing, see:
https://tauri.app/v1/guides/distribution/sign-windows
