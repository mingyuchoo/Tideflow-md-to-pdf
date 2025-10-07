# Changelog

All notable changes to this project are documented in this file.

## [1.1.0] - 2025-10-07
- Add AdvancedTab Typst binary UI
  - Browse + Detect now + Save UX for optional `typst_path` fallback.
  - Save-time validation that runs diagnostics and persists the preference.
  - Shows auto-detected binary and status badge (OK/WARN/ERROR).
- Styling and UX
  - AdvancedTab styles aligned with the Design modal.
  - Button hover/focus animations and responsive spacing.
  - Diagnostics pane themed for dark/light modes to avoid bright white boxes.
- Backend
  - Added `typst_path` to backend preferences (persisted in prefs.json).
  - Typst detection improvements (PATH scan, common locations, bundled fallback).

## Previous
- See commit history for earlier changes.
