/**
 * storage.js - Persistence Layer
 * Handles localStorage for state and IndexedDB for audio cache
 */

import { SCHEMA_VERSION, initializeState, exportState, createDefaultState } from './state.js';

// Storage keys
const STORAGE_KEYS = {
    STATE: 'studyset_state',
    LEARN_SESSION: 'studyset_learn_session',
    VERSION: 'studyset_version'
};

// IndexedDB config
const AUDIO_DB_NAME = 'studyset_audio_cache';
const AUDIO_STORE_NAME = 'audio';

let audioDB = null;

// ============================================================
// LOCALSTORAGE OPERATIONS
// ============================================================

export function saveState(state) {
    try {
        const data = exportState();
        localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(data));
        localStorage.setItem(STORAGE_KEYS.VERSION, String(SCHEMA_VERSION));
        return true;
    } catch (e) {
        console.error('Failed to save state:', e);
        return false;
    }
}

export function loadState() {
    try {
        const savedVersion = localStorage.getItem(STORAGE_KEYS.VERSION);
        const savedData = localStorage.getItem(STORAGE_KEYS.STATE);

        if (!savedData) {
            return initializeState(null);
        }

        let data = JSON.parse(savedData);

        // Migration if needed
        if (savedVersion && parseInt(savedVersion) < SCHEMA_VERSION) {
            data = migrateState(data, parseInt(savedVersion));
        }

        return initializeState(data);
    } catch (e) {
        console.error('Failed to load state:', e);
        return initializeState(null);
    }
}

// Migrate state between schema versions
function migrateState(data, fromVersion) {
    console.log(`Migrating state from v${fromVersion} to v${SCHEMA_VERSION}`);

    // Version 1 -> 2: Add stats to cards, convert IDs
    if (fromVersion < 2) {
        for (const setId in data.allSets) {
            const set = data.allSets[setId];

            // Add meta if missing
            if (!set.meta) {
                set.meta = {
                    schemaVersion: 1,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
            }

            // Migrate cards
            set.cards = set.cards.map(card => {
                // Convert old ID to UUID if needed
                if (typeof card.id === 'number') {
                    card.uuid = card.id.toString();
                    delete card.id;
                }

                // Add stats if missing
                if (!card.stats) {
                    card.stats = {
                        ease: 2.5,
                        interval: 1,
                        dueAt: Date.now(),
                        repetitions: 0,
                        lastReviewed: null
                    };
                }

                // Add meta if missing
                if (!card.meta) {
                    card.meta = {
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                }

                return card;
            });

            // Convert set ID if needed
            if (!set.uuid) {
                set.uuid = setId;
            }
        }

        data.schemaVersion = 2;
    }

    return data;
}

// ============================================================
// LEARN SESSION PERSISTENCE
// ============================================================

export function saveLearnSession(session) {
    try {
        if (!session) {
            localStorage.removeItem(STORAGE_KEYS.LEARN_SESSION);
            return true;
        }

        const data = {
            ...session,
            savedAt: Date.now()
        };
        localStorage.setItem(STORAGE_KEYS.LEARN_SESSION, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Failed to save learn session:', e);
        return false;
    }
}

export function loadLearnSession() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.LEARN_SESSION);
        if (!data) return null;

        const session = JSON.parse(data);

        // Check if session is too old (7 days)
        if (Date.now() - session.savedAt > 7 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem(STORAGE_KEYS.LEARN_SESSION);
            return null;
        }

        return session;
    } catch (e) {
        console.error('Failed to load learn session:', e);
        return null;
    }
}

export function clearLearnSessionStorage() {
    localStorage.removeItem(STORAGE_KEYS.LEARN_SESSION);
}

// ============================================================
// INDEXEDDB AUDIO CACHE
// ============================================================

export async function initAudioDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(AUDIO_DB_NAME, 1);

        request.onerror = () => {
            console.warn('IndexedDB not available');
            resolve(null);
        };

        request.onsuccess = (event) => {
            audioDB = event.target.result;
            console.log('Audio cache DB initialized');
            resolve(audioDB);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
                const store = db.createObjectStore(AUDIO_STORE_NAME, { keyPath: 'key' });
                store.createIndex('accessedAt', 'accessedAt', { unique: false });
            }
        };
    });
}

export async function getCachedAudio(key) {
    if (!audioDB) return null;

    return new Promise((resolve) => {
        try {
            const tx = audioDB.transaction(AUDIO_STORE_NAME, 'readwrite');
            const store = tx.objectStore(AUDIO_STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                if (request.result) {
                    // Update access time
                    const entry = request.result;
                    entry.accessedAt = Date.now();
                    store.put(entry);
                    resolve(entry.blob);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => resolve(null);
        } catch (e) {
            resolve(null);
        }
    });
}

export async function setCachedAudio(key, blob, maxSizeMB = 50) {
    if (!audioDB) return false;

    try {
        const tx = audioDB.transaction(AUDIO_STORE_NAME, 'readwrite');
        const store = tx.objectStore(AUDIO_STORE_NAME);

        await new Promise((resolve, reject) => {
            const request = store.put({
                key: key,
                blob: blob,
                size: blob.size,
                accessedAt: Date.now()
            });
            request.onsuccess = resolve;
            request.onerror = reject;
        });

        // Evict old entries if over limit
        await evictOldAudioEntries(maxSizeMB);
        return true;
    } catch (e) {
        console.warn('Failed to cache audio:', e);
        return false;
    }
}

async function evictOldAudioEntries(maxSizeMB) {
    if (!audioDB) return;

    const maxBytes = maxSizeMB * 1024 * 1024;

    return new Promise((resolve) => {
        try {
            const tx = audioDB.transaction(AUDIO_STORE_NAME, 'readwrite');
            const store = tx.objectStore(AUDIO_STORE_NAME);
            const index = store.index('accessedAt');
            const request = index.openCursor();

            let totalSize = 0;
            const entries = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    entries.push({
                        key: cursor.value.key,
                        size: cursor.value.size || 0
                    });
                    totalSize += cursor.value.size || 0;
                    cursor.continue();
                } else {
                    // Evict oldest if over limit
                    if (totalSize > maxBytes) {
                        let removed = 0;
                        for (const entry of entries) {
                            if (totalSize - removed <= maxBytes * 0.8) break;
                            store.delete(entry.key);
                            removed += entry.size;
                        }
                    }
                    resolve();
                }
            };

            request.onerror = () => resolve();
        } catch (e) {
            resolve();
        }
    });
}

export async function clearAudioCache() {
    if (!audioDB) return;

    return new Promise((resolve) => {
        try {
            const tx = audioDB.transaction(AUDIO_STORE_NAME, 'readwrite');
            const store = tx.objectStore(AUDIO_STORE_NAME);
            store.clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        } catch (e) {
            resolve(false);
        }
    });
}

// ============================================================
// JSON EXPORT/IMPORT
// ============================================================

export function exportSetToJSON(set) {
    const exportData = {
        version: 1,
        exportedAt: Date.now(),
        set: {
            name: set.name,
            cards: set.cards.map(card => ({
                term: card.term,
                definition: card.definition,
                starred: card.starred
            }))
        }
    };

    return JSON.stringify(exportData, null, 2);
}

export function importSetFromJSON(jsonString) {
    try {
        const data = JSON.parse(jsonString);

        if (!data.set || !data.set.name || !Array.isArray(data.set.cards)) {
            throw new Error('Invalid JSON format');
        }

        return {
            name: data.set.name,
            cards: data.set.cards.map(card => ({
                term: card.term || '',
                definition: card.definition || '',
                starred: card.starred || false
            }))
        };
    } catch (e) {
        console.error('Failed to parse JSON:', e);
        return null;
    }
}

export function downloadJSON(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function uploadJSON() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        };
        input.click();
    });
}
