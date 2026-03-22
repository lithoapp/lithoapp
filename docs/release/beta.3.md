# Litho Beta 3 Release Notes

## What's New

### In-App Feedback
You can now send product feedback directly from Litho, with optional screenshots and technical details to help diagnose issues faster.

### Workspace Asset Browsing
Workspace asset listings now surface nested images more reliably, making it easier for the AI and the app to work with your project assets.

### Chat Color Swatches
Hex color values in chat now render with inline swatches so design conversations are easier to scan.

## Improved

### Settings & Onboarding
- Clearer validation and provider connection feedback
- More reliable provider settings refresh after connecting
- Deterministic back navigation in Settings

### AI Editing Flow
- Edit mode is blocked during active chat turns to avoid conflicting changes
- Cross-document page labels are clearer inside chat tool results
- Agent prompts and document upload guidance are more precise

## Fixed

- Hardened packaged runtime module resolution for release builds
- Fixed QA validation and asset navigation issues
- Polished workspace creation states and design system behavior

## Reliability

- Added the documented manual macOS release workflow for repeatable notarized distribution
