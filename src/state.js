/**
 * state.js - Central State Management
 * All application state is managed here with UUID-based IDs
 */

// Generate UUID v4
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Current schema version for migrations
export const SCHEMA_VERSION = 2;

// Default state shape
export function createDefaultState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        allSets: {},
        activeSetId: null,
        learnSession: null,
        ttsState: {
            elevenLabsKey: '',
            autoRead: false,
            usePremium: false,
            selectedVoiceId: '21m00Tcm4TlvDq8ikWAM',
            isSpeaking: false,
            cacheSize: 50 // MB
        },
        features: {
            spacedRepetition: false,
            analytics: true
        },
        analytics: {
            totalCardsStudied: 0,
            totalSessionMinutes: 0,
            streakDays: 0,
            lastStudyDate: null,
            dailyStats: {}
        },
        settings: {
            keyBindings: {
                flip: 'Space',
                grade1: '1',
                grade2: '2',
                grade3: '3',
                grade4: '4',
                star: 's',
                listen: 'l',
                prev: 'ArrowLeft',
                next: 'ArrowRight',
                exit: 'Escape'
            }
        }
    };
}

// Create a new study set
export function createSet(name) {
    const now = Date.now();
    return {
        uuid: generateUUID(),
        name: name.trim(),
        cards: [],
        meta: {
            schemaVersion: 1,
            createdAt: now,
            updatedAt: now
        }
    };
}

// Create a new card with SM-2 defaults
export function createCard(term, definition) {
    const now = Date.now();
    return {
        uuid: generateUUID(),
        term: term.trim(),
        definition: definition.trim(),
        starred: false,
        masteryLevel: 0,
        stats: {
            ease: 2.5,
            interval: 1,
            dueAt: now,
            repetitions: 0,
            lastReviewed: null
        },
        meta: {
            createdAt: now,
            updatedAt: now
        }
    };
}

// Create a learn session
export function createLearnSession(setId, cardIds, mode = 'all') {
    return {
        version: 1,
        setId: setId,
        unseenIds: [...cardIds],
        masteredIds: [],
        currentQuestionId: null,
        questionsAnswered: 0,
        correctCount: 0,
        mode: mode,
        batchHistory: [],
        startedAt: Date.now(),
        savedAt: Date.now()
    };
}

// Global state object
let state = createDefaultState();

// Get current state (read-only copy)
export function getState() {
    return state;
}

// Update state with partial updates
export function setState(updates) {
    state = { ...state, ...updates };
    return state;
}

// Get all sets
export function getAllSets() {
    return state.allSets;
}

// Get a specific set
export function getSet(setId) {
    return state.allSets[setId] || null;
}

// Add a new set
export function addSet(set) {
    state.allSets[set.uuid] = set;
    return set;
}

// Update a set
export function updateSet(setId, updates) {
    if (!state.allSets[setId]) return null;
    state.allSets[setId] = {
        ...state.allSets[setId],
        ...updates,
        meta: {
            ...state.allSets[setId].meta,
            updatedAt: Date.now()
        }
    };
    return state.allSets[setId];
}

// Delete a set
export function deleteSet(setId) {
    if (!state.allSets[setId]) return false;
    delete state.allSets[setId];
    if (state.activeSetId === setId) {
        state.activeSetId = Object.keys(state.allSets)[0] || null;
    }
    return true;
}

// Get active set
export function getActiveSet() {
    return state.activeSetId ? state.allSets[state.activeSetId] : null;
}

// Set active set
export function setActiveSetId(setId) {
    state.activeSetId = setId;
}

// Get a card from a set
export function getCard(setId, cardId) {
    const set = state.allSets[setId];
    if (!set) return null;
    return set.cards.find(c => c.uuid === cardId) || null;
}

// Add card to set
export function addCardToSet(setId, card) {
    const set = state.allSets[setId];
    if (!set) return null;

    // Limit to 500 cards
    if (set.cards.length >= 500) {
        throw new Error('Maximum 500 cards per set');
    }

    set.cards.push(card);
    set.meta.updatedAt = Date.now();
    return card;
}

// Update a card
export function updateCard(setId, cardId, updates) {
    const set = state.allSets[setId];
    if (!set) return null;

    const cardIndex = set.cards.findIndex(c => c.uuid === cardId);
    if (cardIndex === -1) return null;

    set.cards[cardIndex] = {
        ...set.cards[cardIndex],
        ...updates,
        meta: {
            ...set.cards[cardIndex].meta,
            updatedAt: Date.now()
        }
    };
    set.meta.updatedAt = Date.now();
    return set.cards[cardIndex];
}

// Delete a card
export function deleteCard(setId, cardId) {
    const set = state.allSets[setId];
    if (!set) return false;

    const initialLength = set.cards.length;
    set.cards = set.cards.filter(c => c.uuid !== cardId);
    set.meta.updatedAt = Date.now();
    return set.cards.length < initialLength;
}

// Toggle card star
export function toggleCardStar(setId, cardId) {
    const card = getCard(setId, cardId);
    if (!card) return null;
    return updateCard(setId, cardId, { starred: !card.starred });
}

// Get learn session
export function getLearnSession() {
    return state.learnSession;
}

// Set learn session
export function setLearnSession(session) {
    state.learnSession = session;
}

// Clear learn session
export function clearLearnSession() {
    state.learnSession = null;
}

// Get TTS state
export function getTtsState() {
    return state.ttsState;
}

// Update TTS state
export function updateTtsState(updates) {
    state.ttsState = { ...state.ttsState, ...updates };
}

// Get features
export function getFeatures() {
    return state.features;
}

// Toggle feature
export function toggleFeature(featureName) {
    if (state.features.hasOwnProperty(featureName)) {
        state.features[featureName] = !state.features[featureName];
    }
}

// Get analytics
export function getAnalytics() {
    return state.analytics;
}

// Update analytics
export function updateAnalytics(updates) {
    state.analytics = { ...state.analytics, ...updates };
}

// Get settings
export function getSettings() {
    return state.settings;
}

// Update key bindings
export function updateKeyBindings(bindings) {
    state.settings.keyBindings = { ...state.settings.keyBindings, ...bindings };
}

// Get cards due for review (SM-2)
export function getDueCards(setId) {
    const set = state.allSets[setId];
    if (!set) return [];

    const now = Date.now();
    return set.cards.filter(card => card.stats.dueAt <= now);
}

// Get starred cards
export function getStarredCards(setId) {
    const set = state.allSets[setId];
    if (!set) return [];
    return set.cards.filter(card => card.starred);
}

// Initialize state from loaded data
export function initializeState(loadedState) {
    if (loadedState) {
        state = { ...createDefaultState(), ...loadedState };
    }
    return state;
}

// Export state for saving
export function exportState() {
    return {
        schemaVersion: state.schemaVersion,
        allSets: state.allSets,
        activeSetId: state.activeSetId,
        ttsState: state.ttsState,
        features: state.features,
        analytics: state.analytics,
        settings: state.settings
    };
}
