# Shortcuts Helper

A VS Code extension that intelligently tracks user interactions and suggests keyboard shortcuts to improve productivity.

## 🎯 Overview

Shortcuts Helper monitors your VS Code activity and provides contextual keyboard shortcut recommendations based on your actions. The extension learns which shortcuts you've already mastered and avoids repeating suggestions, creating a personalized learning experience.

## ✨ Current Features

### 1. **Intelligent Interaction Tracking**
Monitors 15+ different types of user interactions:
- Active editor changes
- Text editing and changes
- Selection changes
- File save operations
- Document close events
- Terminal changes
- Visible editors changes
- Window state changes
- Command execution
- Panel visibility changes
- IntelliSense triggers
- Peek definition triggers
- Quick fix triggers
- References triggers
- Zoom changes

### 2. **Context-Aware Recommendations**
- Analyzes user interactions in real-time
- Filters shortcuts based on the current context
- Only shows relevant shortcuts for the action you just performed
- Randomly selects from applicable shortcuts to provide variety

### 3. **Persistent Learning System**
- Tracks which shortcuts you've marked as learned
- Uses VS Code's `globalState` API for persistence across sessions
- Never shows the same shortcut twice after you've learned it
- Provides a "I got it! Don't show again" option in recommendations

### 4. **Configurable Behavior**
Two customizable settings:
- `shortcutsHelper.cooldownInterval` (default: 1000ms) - Minimum time between recommendations
- `shortcutsHelper.debounceInterval` (default: 500ms) - Delay after typing/scrolling before analyzing

### 5. **Comprehensive Shortcuts Database**
- 91 keyboard shortcuts loaded from `shortcuts.csv`
- Organized by interaction type for efficient lookup
- Includes shortcut key combinations and action descriptions

## 🏗️ Architecture

### Core Components

```
src/
├── extension.ts                    # Main entry point, wires all components together
├── tracker.ts                      # Monitors VS Code events and emits interaction events
├── analyzer.ts                     # Analyzes interactions and decides when to show recommendations
├── shortcuts-loader.ts             # Loads and manages shortcuts from CSV file
└── learned-shortcuts-manager.ts    # Tracks learned shortcuts with persistent storage
```

### Data Flow

```
User Action → Tracker → Analyzer → Shortcuts Loader + Learned Manager → Recommendation
```

1. **Tracker** listens to VS Code events and emits standardized interaction events
2. **Analyzer** receives events and applies filtering logic (cooldown, context, learned status)
3. **Shortcuts Loader** provides relevant shortcuts for the interaction type
4. **Learned Shortcuts Manager** filters out already-learned shortcuts
5. **Analyzer** displays recommendation with "I got it!" option

## 📊 Shortcuts Data

The extension uses `shortcuts.csv` with the following structure:
- **interactionType**: Type of user action that triggers this shortcut
- **implemented**: Whether the shortcut is currently tracked (boolean)
- **shortcut**: The keyboard combination (e.g., "Ctrl+K Ctrl+W")
- **action**: Description of what the shortcut does

## 🚀 Development Status

### ✅ Implemented
- Full interaction tracking system
- Context-aware recommendation engine
- Persistent learned shortcuts storage
- CSV-based shortcuts database
- Configurable cooldown and debounce
- User feedback mechanism ("I got it!" button)

### 🔄 Not Yet Implemented
- Statistics/analytics on learning progress
- Custom shortcut additions by users

## 🛠️ Building & Testing

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

## 📝 Configuration

Add to your VS Code `settings.json`:

```json
{
  "shortcutsHelper.cooldownInterval": 1000,
  "shortcutsHelper.debounceInterval": 500
}
```

## 🎓 How It Works

1. Extension activates on VS Code startup
2. Loads shortcuts database from `shortcuts.csv`
3. Begins monitoring user interactions
4. When a relevant action occurs:
   - Checks if cooldown period has passed
   - Finds shortcuts matching the interaction type
   - Filters by context (e.g., only if editor is active)
   - Removes already-learned shortcuts
   - Randomly selects one shortcut to recommend
   - Shows notification with "I got it!" option
5. If user clicks "I got it!", shortcut is marked as learned permanently

## 📂 Project Structure

```
shortcuts-helper/
├── src/                           # TypeScript source files
├── out/                           # Compiled JavaScript output
├── shortcuts.csv                  # Main shortcuts database (sorted)
├── older_shortcuts/               # Archive of previous shortcuts files
├── package.json                   # Extension manifest
└── tsconfig.json                  # TypeScript configuration
```

## 🔮 Future Enhancements

Potential areas for expansion:
- Visual dashboard showing learning progress
- Customizable recommendation frequency per shortcut type
- Import/export learned shortcuts
- Shortcut practice mode
- Team-wide shortcut recommendations
- Platform-specific shortcuts (Windows/Mac/Linux)
