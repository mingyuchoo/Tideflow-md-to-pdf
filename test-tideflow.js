// Test script for Tideflow

// This script simulates user interactions with Tideflow
// Run with: node test-tideflow.js

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create test directory if it doesn't exist
const testDir = path.join(__dirname, 'test');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir);
}

// Create a test Markdown file
const testFilePath = path.join(testDir, 'test-document.md');
const markdownContent = `---
title: "Test Document"
format: typst
---

# Test Document

This is a test document for Tideflow.

## Formatting Test

Here's some **bold text** and *italic text*.

## List Test

1. First item
2. Second item
3. Third item

## Table Test

| Name | Value |
|------|-------|
| A    | 1     |
| B    | 2     |
| C    | 3     |

## Page Break Test

::: {pagebreak}
:::

# Second Page

This is the second page of the test document.
`;

// Write the test file
fs.writeFileSync(testFilePath, markdownContent);
console.log(`Created test file: ${testFilePath}`);

// Print instructions for testing
console.log('\nManual Test Steps:');
console.log('1. Start Tideflow with: npm run tauri:dev');
console.log('2. Open the test file created at:', testFilePath);
console.log('3. Verify the document displays correctly in the editor');
console.log('4. Click "Render" to generate the PDF');
console.log('5. Verify the PDF preview appears and looks correct');
console.log('6. Make an edit to the document and click "Save"');
console.log('7. Verify the PDF updates after saving');
console.log('8. Test image paste/drag-and-drop');
console.log('9. Test the preferences modal');
console.log('10. Test file tree navigation');
