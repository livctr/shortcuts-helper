# Shortcuts Helper

Shortcuts Helper is a VS Code extension designed to help you become a keyboard power user. It tracks your interactions with the editor and intelligently suggests keyboard shortcuts to improve your efficiency.

## Features

- **Intelligent Suggestions**: Detects inefficient actions (like using the mouse for tasks that have shortcuts) and suggests the corresponding keyboard shortcut.
- **Context-Aware**: Suggestions are tailored to your current context (e.g., editing text, navigating files, debugging).
- **Progressive Learning**: Tracks which shortcuts you've learned and stops suggesting them once you've mastered them.
- **Tip of the Day**: Shows a helpful shortcut tip on startup to expand your knowledge.
- **Learned Shortcuts View**: View a list of all the shortcuts you've learned and unlearn them if needed.

## Supported Detections

The extension currently detects and suggests shortcuts for:

- **Text Editing**:
    - Copy/Cut/Paste lines (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`)
    - Delete lines (`Ctrl+Shift+K`)
    - Delete words (`Ctrl+Backspace`)
    - Duplicate lines (`Shift+Alt+Down/Up`)
    - Multi-cursor editing (`Ctrl+Alt+Down/Up`, `Alt+Click`)
    - Commenting code (`Ctrl+/`)
- **Navigation**:
    - Go to line start/end (`Fn+Left/Right` or `Home/End`)
    - Expand selection (`Shift+Alt+Right`)
    - Switch tabs (`Ctrl+Tab`)
    - Go to file (`Ctrl+P`)
- **Debugging**:
    - Start debugging (`F5`)
    - Step over (`F10`)
    - Toggle breakpoint (`F9`)
- **General**:
    - Open terminal (`Ctrl+Backtick`)
    - Command palette (`Ctrl+Shift+P`)
    - And many more!

## Configuration

You can customize the extension's behavior in VS Code settings:

- `shortcutsHelper.cooldownInterval`: Time in milliseconds between recommendations (default: 300000ms / 5 mins).
- `shortcutsHelper.sessionRecommendationLimit`: Maximum number of recommendations to show per session (default: 3).
- `shortcutsHelper.debounceInterval`: Delay in milliseconds after typing or scrolling before analyzing events (default: 500ms).

## Commands

- `Shortcuts Helper: View Learned Shortcuts`: Opens a webview displaying all the shortcuts you have marked as learned.

## Release Notes

### 0.0.1

- Initial release with core tracking and recommendation engine.
- Support for text editing, navigation, and debugging shortcuts.
- "Tip of the Day" feature.
