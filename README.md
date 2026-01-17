# StudySet - A Quizlet Clone

A production-quality desktop flashcard application built with Electron, featuring SM-2 spaced repetition, audio caching, and designed for Tauri migration.

## Features

### 📚 Core Features
- **Multiple Study Sets**: Create, manage, and organize up to 50 study sets
- **Flashcard Management**: Add, edit, delete, and star flashcards (up to 500 per set)
- **Bulk Import**: Paste term-definition pairs with automatic delimiter detection
- **Inline Editing**: Click directly on terms/definitions to edit them

### 🏠 Home Screen
- Visual grid of all study sets with progress indicators
- **Quick Actions**: Study 5 min, Review Due Cards, Random Set
- **Resume Section**: Pick up interrupted sessions exactly where you left off
- Study streak and daily statistics

### 🎴 Set View
- **Interactive Flashcard Carousel**: 
  - Click or press Space to flip
  - Arrow keys (←/→) to navigate
  - Shuffle button for random order
- **Term List**: View all cards with mastery levels and due dates
- **Per-term Controls**: Star toggle, TTS listen button, inline editing
- **Three Study Modes**: Learn All, Study Starred, Review Due

### 📖 Learn Mode
- **SM-2 Spaced Repetition** (toggleable):
  - Confidence grading: Again (1), Hard (2), Good (3), Easy (4)
  - Optimized review intervals for long-term retention
  - Due date tracking per card
- **Multiple Choice Mode**: Alternative to SM-2 grading
- **Progress Tracking**: Visual progress bar and batch summaries
- **Session Auto-Save**: Progress saved after every answer

### 🔊 Text-to-Speech
- **Browser TTS**: Free, offline-capable using Web Speech API
- **Premium TTS**: ElevenLabs integration for ultra-realistic voices
- **IndexedDB Audio Cache**: 
  - 50MB default / 100MB max with LRU eviction
  - Instant replay for cached audio
  - Idle pre-caching for starred and upcoming cards

### ⌨️ Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Flip flashcard |
| `←` / `→` | Navigate cards |
| `1` | Grade: Again |
| `2` | Grade: Hard |
| `3` | Grade: Good |
| `4` | Grade: Easy |
| `S` | Toggle star |
| `L` | Listen (TTS) |
| `Escape` | Exit/Close |

All shortcuts are customizable via Learn Settings.

### 📊 Analytics
- Cards studied per day
- Session duration tracking
- Study streaks
- Per-set mastery progress

### 📦 Import/Export
- Export sets as JSON for backup or sharing
- Import JSON sets into the app

## Session Resume Behavior

1. **Auto-Save**: Session state is saved after every answered question
2. **Resume Prompt**: On Home screen, "Pick up where you left off" shows if a saved session exists
3. **Session Data**: Stores card IDs (not duplicates), progress, and mode
4. **Expiry**: Sessions expire after 7 days of inactivity
5. **Clear on Complete**: Session is automatically cleared when all cards are mastered

## Spaced Repetition (SM-2)

The app implements the SuperMemo 2 algorithm:

- **Ease Factor**: Starts at 2.5, adjusts based on performance
- **Intervals**: 1 day → 6 days → exponential growth
- **Grading Impact**:
  - **Again (1)**: Reset interval to 1 day, decrease ease
  - **Hard (2)**: Interval × 0.8, slight ease decrease
  - **Good (3)**: Standard progression
  - **Easy (4)**: Interval × 1.3, increase ease

Toggle SM-2 on/off via the settings cog in Learn Mode.

## TTS Audio Caching

- **Storage**: IndexedDB database `studyset_audio_cache`
- **Key Format**: `${term}-${voiceId}` (truncated to 100 chars)
- **Cache Size**: Configurable, default 50MB with LRU eviction
- **Pre-caching**: Starred cards and next 5 cards are pre-cached in idle time
- **Fallback**: Browser TTS used if ElevenLabs fails or cache is cold

## Project Structure

```
/
├── index.html              # Main UI with all sections
├── main.js                 # Electron main process
├── preload.js              # Electron bridge
├── package.json
└── src/
    ├── app.js              # Entry point, event handlers
    ├── state.js            # Central state management
    ├── navigation.js       # Section show/hide logic
    ├── render.js           # DOM rendering functions
    ├── storage.js          # localStorage + IndexedDB
    ├── tts.js              # Text-to-speech + caching
    ├── spacedRep.js        # SM-2 algorithm
    └── analytics.js        # Local study tracking
```

## Getting Started

### Prerequisites
- Node.js 16+
- npm 8+

### Installation
```bash
npm install
```

### Running the App
```bash
npm start
```

### Building for Distribution
```bash
npm run build
```

## Tauri Migration

This app is designed for seamless migration to Tauri:

### Ready for Migration
- All state uses `localStorage` / `IndexedDB` (no Electron IPC)
- TTS uses standard Web APIs
- No `require()` in frontend modules
- ES Modules used throughout

### Migration Steps

```bash
# 1. Install Tauri CLI
npm install -D @tauri-apps/cli

# 2. Initialize Tauri project
npx tauri init

# 3. Configure tauri.conf.json
# Set distDir to "./" and devPath to point to index.html

# 4. Build for Windows
npx tauri build

# 5. Build for Android
npx tauri android init
npx tauri android build
```

### Platform Adapter Pattern
The frontend uses web-standard APIs exclusively. For platform-specific features (file dialogs, notifications), implement adapters in the Tauri Rust backend.

## Data Storage

| Data | Storage | Key |
|------|---------|-----|
| Study Sets | localStorage | `studyset_state` |
| Learn Session | localStorage | `studyset_learn_session` |
| Schema Version | localStorage | `studyset_version` |
| Audio Cache | IndexedDB | `studyset_audio_cache` |

All persisted data includes `schemaVersion`, `createdAt`, and `updatedAt` for migrations.

## Limits

- Maximum **50** study sets
- Maximum **500** cards per set
- Audio cache: **50-100MB** with LRU eviction
- Session expiry: **7 days**

## License

ISC
