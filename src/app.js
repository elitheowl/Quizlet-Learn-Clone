/**
 * app.js - Main Application Entry Point
 * Ties together all modules and handles event delegation
 */

import {
    getState, setState, getAllSets, getSet, getActiveSet, setActiveSetId,
    createSet, addSet, updateSet, deleteSet as deleteSetFromState,
    createCard, addCardToSet, updateCard, deleteCard as deleteCardFromState,
    toggleCardStar, getLearnSession, setLearnSession, clearLearnSession,
    createLearnSession, getDueCards, getStarredCards, getTtsState, updateTtsState,
    getSettings, updateKeyBindings, getFeatures, toggleFeature,
    initializeState, exportState, generateUUID
} from './state.js';

import {
    saveState, loadState, saveLearnSession, loadLearnSession, clearLearnSessionStorage,
    initAudioDB, exportSetToJSON, importSetFromJSON, downloadJSON, uploadJSON
} from './storage.js';

import {
    showHome, showSetView, showLearnMode, hideAllModals,
    showModal, hideModal, SECTIONS, MODALS, getCurrentSection, isModalOpen
} from './navigation.js';

import {
    renderHome, renderSetView, renderLearnMode, renderLearnQuestion,
    renderAnswerFeedback, renderLearnFeedback, renderLearnSummary,
    renderLearnCompletion, resetLearnUI, shuffleArray, escapeHtml
} from './render.js';

import { speak, stop as stopTTS, loadVoices, preCacheCards } from './tts.js';

import {
    calculateSM2, GRADES, GRADE_LABELS, getDueCards as getDueCardsFromArray,
    isCardDue, getMasteryLevel
} from './spacedRep.js';

import { recordCardStudy, recordSessionTime, cleanupOldData } from './analytics.js';

// ============================================================
// APPLICATION STATE
// ============================================================

let flashcardState = {
    currentIndex: 0,
    cardOrder: [],
    isFlipped: false
};

let learnState = {
    sessionStartTime: null,
    batchHistory: []
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('StudySet initializing...');

    // Initialize audio cache
    await initAudioDB();

    // Load saved state
    loadState();

    // Load saved learn session
    const savedSession = loadLearnSession();
    if (savedSession) {
        setLearnSession(savedSession);
    }

    // Load TTS voices
    loadVoices();

    // Clean up old analytics
    cleanupOldData();

    // Set up event listeners
    setupEventListeners();

    // Show home screen
    navigateToHome();

    console.log('StudySet ready!');
});

// ============================================================
// NAVIGATION HANDLERS
// ============================================================

function navigateToHome() {
    showHome(() => {
        renderHome({
            onCreateSet: () => showModal('createSetModal'),
            onSelectSet: navigateToSetView,
            onResumeSession: handleResumeSession,
            onStudy5Min: handleStudy5Min,
            onReviewDue: handleReviewAllDue,
            onRandomSet: handleRandomSet
        });
    });
}

function navigateToSetView(setId) {
    setActiveSetId(setId);
    saveState();

    // Initialize flashcard state
    const set = getSet(setId);
    if (set && set.cards.length > 0) {
        flashcardState.cardOrder = set.cards.map((_, i) => i);
        flashcardState.currentIndex = 0;
        flashcardState.isFlipped = false;
    }

    showSetView(setId, () => {
        renderSetView(setId, {
            currentIndex: flashcardState.currentIndex,
            cardOrder: flashcardState.cardOrder,
            onToggleStar: handleToggleStar,
            onSpeak: handleSpeak,
            onDeleteCard: handleDeleteCard,
            onUpdateCard: handleUpdateCard
        });
    });

    // Pre-cache starred cards and next cards
    if (set) {
        const starredCards = set.cards.filter(c => c.starred);
        const nextCards = set.cards.slice(0, 5);
        preCacheCards([...starredCards, ...nextCards]);
    }
}

function navigateToLearnMode(setId, options = {}) {
    const { resume = false, mode = 'all' } = options;

    setActiveSetId(setId);
    const set = getSet(setId);
    if (!set) return;

    let session;

    // Always check for existing session for this set first
    const savedSession = loadLearnSession();
    if (savedSession && savedSession.setId === setId && savedSession.unseenIds.length > 0) {
        // Resume existing session
        session = savedSession;
    } else if (resume) {
        session = getLearnSession();
        if (!session || session.setId !== setId) {
            session = initializeNewSession(set, mode);
        }
    } else {
        session = initializeNewSession(set, mode);
    }

    if (!session) return;

    setLearnSession(session);
    saveLearnSession(session); // Immediate save
    learnState.sessionStartTime = Date.now();
    learnState.batchHistory = [];

    showLearnMode(setId, options, () => {
        resetLearnUI();
        nextQuestion();
    });
}

function initializeNewSession(set, mode) {
    let cards;

    if (mode === 'starred') {
        cards = set.cards.filter(c => c.starred);
    } else if (mode === 'due') {
        cards = set.cards.filter(c => isCardDue(c));
    } else {
        cards = set.cards;
    }

    if (cards.length < 2) {
        alert(`Need at least 2 cards. Found ${cards.length}.`);
        return null;
    }

    const shuffled = shuffleArray(cards);

    return createLearnSession(
        set.uuid,
        shuffled.map(c => c.uuid),
        mode
    );
}

// ============================================================
// LEARN MODE HANDLERS
// ============================================================

function nextQuestion() {
    const session = getLearnSession();
    const set = getActiveSet();
    if (!session || !set) return;

    // Check for batch summary
    if (session.questionsAnswered > 0 &&
        session.questionsAnswered % 10 === 0 &&
        learnState.batchHistory.length > 0) {
        renderLearnSummary(learnState.batchHistory);
        return;
    }

    // Check for completion
    if (session.unseenIds.length === 0) {
        handleLearnComplete();
        return;
    }

    // Get next question
    session.currentQuestionId = session.unseenIds[0];
    setLearnSession(session);
    saveLearnSession(session);

    resetLearnUI();
    renderLearnMode(session, set, {
        onGrade: handleGrade,
        onAnswer: handleMultipleChoiceAnswer,
        onWordClick: handleWordClick
    });

    // Auto-read if enabled
    const ttsState = getTtsState();
    if (ttsState.autoRead) {
        const card = set.cards.find(c => c.uuid === session.currentQuestionId);
        if (card) speak(card.definition);
    }
}

function handleGrade(grade) {
    const session = getLearnSession();
    const set = getActiveSet();
    if (!session || !set) return;

    const card = set.cards.find(c => c.uuid === session.currentQuestionId);
    if (!card) return;

    // Calculate new stats using SM-2
    const newStats = calculateSM2(card.stats, grade);
    updateCard(set.uuid, card.uuid, { stats: newStats });
    saveState();

    // Record analytics
    const isCorrect = grade >= GRADES.GOOD;
    recordCardStudy(isCorrect);

    // Update session
    session.questionsAnswered++;

    // Add to batch history
    learnState.batchHistory.push({
        card: { term: card.term, definition: card.definition },
        correct: isCorrect,
        grade: grade
    });

    if (grade >= GRADES.GOOD) {
        // Mastered - remove from unseen
        session.unseenIds.shift();
        session.masteredIds.push(card.uuid);
        session.correctCount++;
    } else {
        // Failed - re-insert for later review
        session.unseenIds.shift();
        const insertIndex = Math.min(session.unseenIds.length, Math.floor(Math.random() * 3) + 2);
        session.unseenIds.splice(insertIndex, 0, card.uuid);
    }

    setLearnSession(session);
    saveLearnSession(session);

    // Show brief feedback then next question
    if (grade >= GRADES.GOOD) {
        // Quick success animation
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.classList.add('progress-animating');
            setTimeout(() => progressBar.classList.remove('progress-animating'), 1000);
        }
        setTimeout(nextQuestion, 800);
    } else {
        renderLearnFeedback(false, card.term);
    }
}

function handleMultipleChoiceAnswer(isCorrect, selectedBtn, correctId) {
    const session = getLearnSession();
    const set = getActiveSet();
    if (!session || !set) return;

    const card = set.cards.find(c => c.uuid === session.currentQuestionId);
    if (!card) return;

    // Show feedback
    renderAnswerFeedback(selectedBtn, correctId, isCorrect);

    // Record analytics
    recordCardStudy(isCorrect);

    // Update mastery
    if (isCorrect) {
        card.masteryLevel = (card.masteryLevel || 0) + 1;
    } else {
        card.masteryLevel = 0;
    }
    updateCard(set.uuid, card.uuid, { masteryLevel: card.masteryLevel });
    saveState();

    // Update session
    session.questionsAnswered++;
    learnState.batchHistory.push({
        card: { term: card.term, definition: card.definition },
        correct: isCorrect
    });

    if (isCorrect) {
        session.unseenIds.shift();
        session.masteredIds.push(card.uuid);
        session.correctCount++;
    } else {
        session.unseenIds.shift();
        const insertIndex = Math.min(session.unseenIds.length, Math.floor(Math.random() * 3) + 2);
        session.unseenIds.splice(insertIndex, 0, card.uuid);
    }

    setLearnSession(session);
    saveLearnSession(session);

    setTimeout(() => {
        if (isCorrect) {
            nextQuestion();
        } else {
            renderLearnFeedback(false, card.term);
        }
    }, 1000);
}

function handleLearnComplete() {
    const session = getLearnSession();

    // Record session time
    if (learnState.sessionStartTime) {
        const minutes = Math.round((Date.now() - learnState.sessionStartTime) / 60000);
        recordSessionTime(minutes);
    }

    clearLearnSessionStorage();
    clearLearnSession();
    renderLearnCompletion();
}

function handleResumeSession(savedSession) {
    navigateToLearnMode(savedSession.setId, { resume: true, mode: savedSession.mode });
}

function handleContinueLearning() {
    learnState.batchHistory = [];
    resetLearnUI();
    nextQuestion();
}

function handleExitLearn() {
    const session = getLearnSession();

    // Record session time
    if (learnState.sessionStartTime) {
        const minutes = Math.round((Date.now() - learnState.sessionStartTime) / 60000);
        if (minutes > 0) recordSessionTime(minutes);
    }

    // Save session if not complete
    if (session && session.unseenIds.length > 0) {
        saveLearnSession(session);
    } else {
        clearLearnSessionStorage();
        clearLearnSession();
    }

    stopTTS();
    navigateToSetView(getState().activeSetId);
}

// ============================================================
// QUICK ACTION HANDLERS
// ============================================================

function handleStudy5Min() {
    const allSets = getAllSets();
    const setIds = Object.keys(allSets);
    if (setIds.length === 0) return;

    // Find set with most due cards
    let bestSetId = setIds[0];
    let maxDue = 0;

    setIds.forEach(id => {
        const due = getDueCards(id).length;
        if (due > maxDue) {
            maxDue = due;
            bestSetId = id;
        }
    });

    navigateToLearnMode(bestSetId, { mode: maxDue > 0 ? 'due' : 'all' });
}

function handleReviewAllDue() {
    const allSets = getAllSets();
    const setIds = Object.keys(allSets);

    // Find first set with due cards
    for (const id of setIds) {
        const due = getDueCards(id).length;
        if (due >= 2) {
            navigateToLearnMode(id, { mode: 'due' });
            return;
        }
    }

    alert('No cards are due for review!');
}

function handleRandomSet() {
    const allSets = getAllSets();
    const setIds = Object.keys(allSets).filter(id => allSets[id].cards.length >= 2);

    if (setIds.length === 0) {
        alert('No sets with enough cards to study!');
        return;
    }

    const randomId = setIds[Math.floor(Math.random() * setIds.length)];
    navigateToLearnMode(randomId, { mode: 'all' });
}

// ============================================================
// CARD HANDLERS
// ============================================================

function handleToggleStar(cardId) {
    const setId = getState().activeSetId;
    toggleCardStar(setId, cardId);
    saveState();

    // Re-render term list
    renderSetView(setId, {
        currentIndex: flashcardState.currentIndex,
        cardOrder: flashcardState.cardOrder,
        onToggleStar: handleToggleStar,
        onSpeak: handleSpeak,
        onDeleteCard: handleDeleteCard,
        onUpdateCard: handleUpdateCard
    });
}

function handleDeleteCard(cardId) {
    const setId = getState().activeSetId;
    deleteCardFromState(setId, cardId);
    saveState();

    // Re-initialize flashcard order
    const set = getSet(setId);
    if (set && set.cards.length > 0) {
        flashcardState.cardOrder = set.cards.map((_, i) => i);
        flashcardState.currentIndex = Math.min(flashcardState.currentIndex, set.cards.length - 1);
    } else {
        flashcardState.cardOrder = [];
        flashcardState.currentIndex = 0;
    }

    navigateToSetView(setId);
}

function handleUpdateCard(cardId, field, value) {
    const setId = getState().activeSetId;
    if (field === 'term') {
        updateCard(setId, cardId, { term: value });
    } else if (field === 'definition') {
        updateCard(setId, cardId, { definition: value });
    }
    saveState();
}

function handleSpeak(text) {
    speak(text);
}

// ============================================================
// FLASHCARD HANDLERS
// ============================================================

function flipFlashcard() {
    const flashcard = document.getElementById('flashcard');
    if (!flashcard) return;

    flashcardState.isFlipped = !flashcardState.isFlipped;
    flashcard.classList.toggle('flipped', flashcardState.isFlipped);
}

function nextFlashcard() {
    const set = getActiveSet();
    if (!set || set.cards.length === 0) return;

    flashcardState.currentIndex = (flashcardState.currentIndex + 1) % set.cards.length;
    flashcardState.isFlipped = false;
    updateFlashcardDisplay();
}

function prevFlashcard() {
    const set = getActiveSet();
    if (!set || set.cards.length === 0) return;

    flashcardState.currentIndex = (flashcardState.currentIndex - 1 + set.cards.length) % set.cards.length;
    flashcardState.isFlipped = false;
    updateFlashcardDisplay();
}

function shuffleFlashcards() {
    const set = getActiveSet();
    if (!set || set.cards.length === 0) return;

    flashcardState.cardOrder = shuffleArray(flashcardState.cardOrder);
    flashcardState.currentIndex = 0;
    flashcardState.isFlipped = false;
    updateFlashcardDisplay();
}

function updateFlashcardDisplay() {
    const set = getActiveSet();
    if (!set) return;

    const flashcard = document.getElementById('flashcard');
    const front = document.getElementById('flashcardFront');
    const back = document.getElementById('flashcardBack');
    const counter = document.getElementById('flashcardCounter');

    const actualIndex = flashcardState.cardOrder[flashcardState.currentIndex];
    const card = set.cards[actualIndex];

    if (!card) return;

    if (front) front.textContent = card.term;
    if (back) back.textContent = card.definition;
    if (counter) counter.textContent = `${flashcardState.currentIndex + 1} / ${set.cards.length}`;
    if (flashcard) flashcard.classList.remove('flipped');
}

// ============================================================
// DICTIONARY HANDLER
// ============================================================

async function handleWordClick(word, x, y) {
    // Remove existing popup
    document.querySelector('.dictionary-popup')?.remove();

    const popup = document.createElement('div');
    popup.className = 'dictionary-popup';
    popup.textContent = 'Loading...';
    popup.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
    popup.style.top = `${y + 20}px`;
    document.body.appendChild(popup);

    const closePopup = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closePopup);
        }
    };
    setTimeout(() => document.addEventListener('click', closePopup), 100);

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            const entry = data[0];
            const meaning = entry.meanings[0];
            const definition = meaning.definitions[0].definition;
            popup.innerHTML = `
                <strong class="block text-indigo-600 mb-1">${escapeHtml(entry.word)}</strong>
                <span class="text-xs text-slate-500 italic block mb-1">${meaning.partOfSpeech}</span>
                <p class="text-sm">${escapeHtml(definition)}</p>
            `;
        } else {
            popup.textContent = `No definition found for "${word}".`;
        }
    } catch {
        popup.textContent = 'Error fetching definition.';
    }
}

// ============================================================
// SET MANAGEMENT HANDLERS
// ============================================================

function handleCreateSet(name) {
    const allSets = getAllSets();
    if (Object.keys(allSets).length >= 50) {
        alert('Maximum 50 sets reached!');
        return null;
    }

    const set = createSet(name);
    addSet(set);
    saveState();
    return set.uuid;
}

function handleDeleteCurrentSet() {
    const setId = getState().activeSetId;
    const allSets = getAllSets();

    if (Object.keys(allSets).length <= 1) {
        alert("You can't delete your only set!");
        return;
    }

    const set = getSet(setId);
    if (!confirm(`Delete "${set?.name}" and all its cards?`)) return;

    // Clear saved session if it's for this set
    const session = getLearnSession();
    if (session && session.setId === setId) {
        clearLearnSessionStorage();
        clearLearnSession();
    }

    deleteSetFromState(setId);
    saveState();
    navigateToHome();
}

// ============================================================
// BULK IMPORT HANDLER
// ============================================================

function handleBulkImport() {
    const text = document.getElementById('importText')?.value?.trim();
    const delimiter = document.getElementById('importDelimiter')?.value;

    if (!text) {
        alert('Please paste some text to import.');
        return;
    }

    const pairs = parseImportText(text, delimiter);

    if (pairs.length === 0) {
        alert('No valid pairs found.');
        return;
    }

    if (pairs.length > 500) {
        alert(`Too many cards (${pairs.length}). Max 500.`);
        return;
    }

    const previewCount = Math.min(5, pairs.length);
    let preview = `Found ${pairs.length} cards:\n\n`;
    for (let i = 0; i < previewCount; i++) {
        preview += `${i + 1}. ${pairs[i].term} → ${pairs[i].definition.substring(0, 30)}...\n`;
    }
    preview += '\nImport these cards?';

    if (confirm(preview)) {
        const setId = getState().activeSetId;
        pairs.forEach((pair, i) => {
            const card = createCard(pair.term, pair.definition);
            try {
                addCardToSet(setId, card);
            } catch {
                // Max cards reached
            }
        });

        saveState();
        hideModal('bulkImportModal');
        document.getElementById('importText').value = '';
        navigateToSetView(setId);
        alert(`Added ${pairs.length} cards!`);
    }
}

function parseImportText(text, delimiter) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    const pairs = [];

    let actualDelim = delimiter;
    if (delimiter === 'auto') {
        actualDelim = detectDelimiter(text);
    }

    if (actualDelim === 'newline') {
        for (let i = 0; i < lines.length - 1; i += 2) {
            if (lines[i] && lines[i + 1]) {
                pairs.push({ term: lines[i], definition: lines[i + 1] });
            }
        }
    } else if (actualDelim === 'tab') {
        lines.forEach(line => {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                pairs.push({ term: parts[0].trim(), definition: parts.slice(1).join('\t').trim() });
            }
        });
    } else {
        lines.forEach(line => {
            const idx = line.indexOf(actualDelim);
            if (idx > 0) {
                pairs.push({
                    term: line.substring(0, idx).trim(),
                    definition: line.substring(idx + 1).trim()
                });
            }
        });
    }

    return pairs.filter(p => p.term && p.definition);
}

function detectDelimiter(text) {
    const lines = text.split(/\n/).filter(l => l.trim());
    const candidates = [':', ';', ',', '\t'];

    for (const char of candidates) {
        const hits = lines.filter(l => l.includes(char)).length;
        if (hits > lines.length * 0.5) return char === '\t' ? 'tab' : char;
    }

    return 'newline';
}

// ============================================================
// SETTINGS HANDLERS
// ============================================================

function handleSaveSettings() {
    const key = document.getElementById('elevenLabsKey')?.value?.trim() || '';
    const autoRead = document.getElementById('settingAutoRead')?.checked || false;
    const usePremium = document.getElementById('settingUsePremium')?.checked || false;
    const voiceId = document.getElementById('voiceSelector')?.value || '21m00Tcm4TlvDq8ikWAM';

    updateTtsState({
        elevenLabsKey: key,
        autoRead: autoRead,
        usePremium: usePremium,
        selectedVoiceId: voiceId
    });

    saveState();
    hideModal('settingsModal');

    // Update mic indicator
    const micIndicator = document.getElementById('micIndicator');
    if (micIndicator) {
        if (usePremium && key) {
            micIndicator.classList.remove('text-slate-300');
            micIndicator.classList.add('text-green-500');
        } else {
            micIndicator.classList.remove('text-green-500');
            micIndicator.classList.add('text-slate-300');
        }
    }
}

function handleToggleSM2() {
    toggleFeature('spacedRepetition');
    saveState();

    // Update UI
    const checkbox = document.getElementById('settingSM2');
    if (checkbox) {
        checkbox.checked = getFeatures().spacedRepetition;
    }
}

function handleExportSet() {
    const set = getActiveSet();
    if (!set) return;

    const json = exportSetToJSON(set);
    const filename = `${set.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    downloadJSON(json, filename);
}

async function handleImportSet() {
    const jsonString = await uploadJSON();
    if (!jsonString) return;

    const data = importSetFromJSON(jsonString);
    if (!data) {
        alert('Invalid JSON file.');
        return;
    }

    const newSet = createSet(data.name + ' (imported)');
    data.cards.forEach(c => {
        const card = createCard(c.term, c.definition);
        if (c.starred) card.starred = true;
        newSet.cards.push(card);
    });

    addSet(newSet);
    saveState();
    navigateToSetView(newSet.uuid);
    alert(`Imported "${data.name}" with ${data.cards.length} cards!`);
}

function handleSaveKeyBindings() {
    const bindings = {};
    const inputs = document.querySelectorAll('#keyboardSettingsModal input[data-key]');
    inputs.forEach(input => {
        bindings[input.dataset.key] = input.value || input.dataset.default;
    });

    updateKeyBindings(bindings);
    saveState();
    hideModal('keyboardSettingsModal');
}

// ============================================================
// KEYBOARD HANDLER
// ============================================================

function handleKeyboard(e) {
    // Don't handle if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    // Don't handle if modal is open (except Escape)
    if (isModalOpen() && e.key !== 'Escape') {
        return;
    }

    const settings = getSettings();
    const keys = settings.keyBindings;
    const section = getCurrentSection();

    // Escape - close modal or exit
    if (e.key === 'Escape') {
        if (isModalOpen()) {
            hideAllModals();
        } else if (section === 'learnSection') {
            handleExitLearn();
        }
        return;
    }

    // Set View keyboard controls
    if (section === 'setViewSection') {
        if (e.key === keys.prev || e.key === 'ArrowLeft') {
            e.preventDefault();
            prevFlashcard();
        } else if (e.key === keys.next || e.key === 'ArrowRight') {
            e.preventDefault();
            nextFlashcard();
        } else if (e.key === ' ' || e.key === keys.flip) {
            e.preventDefault();
            flipFlashcard();
        } else if (e.key.toLowerCase() === keys.listen.toLowerCase()) {
            const set = getActiveSet();
            if (set && set.cards.length > 0) {
                const idx = flashcardState.cardOrder[flashcardState.currentIndex];
                speak(set.cards[idx]?.term);
            }
        }
    }

    // Learn Mode keyboard controls
    if (section === 'learnSection') {
        const features = getFeatures();

        if (features.spacedRepetition) {
            // Grade keys (1-4)
            if (e.key === keys.grade1 || e.key === '1') {
                handleGrade(GRADES.AGAIN);
            } else if (e.key === keys.grade2 || e.key === '2') {
                handleGrade(GRADES.HARD);
            } else if (e.key === keys.grade3 || e.key === '3') {
                handleGrade(GRADES.GOOD);
            } else if (e.key === keys.grade4 || e.key === '4') {
                handleGrade(GRADES.EASY);
            }
        }

        if (e.key.toLowerCase() === keys.listen.toLowerCase()) {
            const session = getLearnSession();
            const set = getActiveSet();
            if (session && set) {
                const card = set.cards.find(c => c.uuid === session.currentQuestionId);
                if (card) speak(card.definition);
            }
        }
    }
}

// ============================================================
// EVENT LISTENERS SETUP
// ============================================================

function setupEventListeners() {
    // Home screen
    document.getElementById('homeCreateSetBtn')?.addEventListener('click', () => {
        showModal('createSetModal');
        document.getElementById('createSetNameInput').value = '';
        document.getElementById('createSetNameInput').focus();
    });

    document.getElementById('homeSettingsBtn')?.addEventListener('click', () => {
        loadSettingsModal();
        showModal('settingsModal');
    });

    document.getElementById('quickActionStudy')?.addEventListener('click', handleStudy5Min);
    document.getElementById('quickActionDue')?.addEventListener('click', handleReviewAllDue);
    document.getElementById('quickActionRandom')?.addEventListener('click', handleRandomSet);

    // Create Set Modal
    document.getElementById('createSetCloseBtn')?.addEventListener('click', () => hideModal('createSetModal'));
    document.getElementById('createSetForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('createSetNameInput').value.trim();
        if (name) {
            const newId = handleCreateSet(name);
            if (newId) {
                hideModal('createSetModal');
                navigateToSetView(newId);
            }
        }
    });

    // Set View
    document.getElementById('setViewBackBtn')?.addEventListener('click', navigateToHome);
    document.getElementById('setViewLearnBtn')?.addEventListener('click', () => {
        navigateToLearnMode(getState().activeSetId, { mode: 'all' });
    });
    document.getElementById('setViewStarredBtn')?.addEventListener('click', () => {
        navigateToLearnMode(getState().activeSetId, { mode: 'starred' });
    });
    document.getElementById('setViewDueBtn')?.addEventListener('click', () => {
        navigateToLearnMode(getState().activeSetId, { mode: 'due' });
    });
    document.getElementById('setViewDeleteBtn')?.addEventListener('click', handleDeleteCurrentSet);

    // Flashcard
    document.getElementById('flashcard')?.addEventListener('click', flipFlashcard);
    document.getElementById('flashcardPrev')?.addEventListener('click', (e) => { e.stopPropagation(); prevFlashcard(); });
    document.getElementById('flashcardNext')?.addEventListener('click', (e) => { e.stopPropagation(); nextFlashcard(); });
    document.getElementById('flashcardShuffle')?.addEventListener('click', (e) => { e.stopPropagation(); shuffleFlashcards(); });
    document.getElementById('flashcardSpeak')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const set = getActiveSet();
        if (set && set.cards.length > 0) {
            const idx = flashcardState.cardOrder[flashcardState.currentIndex];
            speak(set.cards[idx]?.term);
        }
    });

    // Add Card Modal
    document.getElementById('setViewAddCardBtn')?.addEventListener('click', () => {
        showModal('addCardModal');
        document.getElementById('addCardTermInput').value = '';
        document.getElementById('addCardDefInput').value = '';
        document.getElementById('addCardTermInput').focus();
    });
    document.getElementById('addCardCloseBtn')?.addEventListener('click', () => hideModal('addCardModal'));
    document.getElementById('addCardForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const term = document.getElementById('addCardTermInput').value.trim();
        const def = document.getElementById('addCardDefInput').value.trim();
        if (term && def) {
            const card = createCard(term, def);
            try {
                addCardToSet(getState().activeSetId, card);
                saveState();
                document.getElementById('addCardTermInput').value = '';
                document.getElementById('addCardDefInput').value = '';
                document.getElementById('addCardTermInput').focus();
                navigateToSetView(getState().activeSetId);
            } catch (err) {
                alert(err.message);
            }
        }
    });

    // Bulk Import Modal
    document.getElementById('bulkImportBtn')?.addEventListener('click', () => {
        showModal('bulkImportModal');
        document.getElementById('importText').value = '';
    });
    document.getElementById('bulkImportCloseBtn')?.addEventListener('click', () => hideModal('bulkImportModal'));
    document.getElementById('importBtn')?.addEventListener('click', handleBulkImport);

    // Learn Mode
    document.getElementById('learnExitBtn')?.addEventListener('click', handleExitLearn);
    document.getElementById('nextQuestionBtn')?.addEventListener('click', nextQuestion);
    document.getElementById('continueBtn')?.addEventListener('click', handleContinueLearning);
    document.getElementById('restartLearnBtn')?.addEventListener('click', () => {
        const session = getLearnSession();
        navigateToLearnMode(getState().activeSetId, { mode: session?.mode || 'all' });
    });
    document.getElementById('backToSetBtn')?.addEventListener('click', () => {
        clearLearnSessionStorage();
        clearLearnSession();
        navigateToSetView(getState().activeSetId);
    });
    document.getElementById('speakBtn')?.addEventListener('click', () => {
        const questionText = document.getElementById('questionText')?.textContent;
        if (questionText) speak(questionText);
    });

    // Learn Settings
    document.getElementById('learnSettingsBtn')?.addEventListener('click', () => {
        loadLearnSettingsModal();
        showModal('learnSettingsModal');
    });
    document.getElementById('learnSettingsCloseBtn')?.addEventListener('click', () => hideModal('learnSettingsModal'));
    document.getElementById('settingSM2')?.addEventListener('change', handleToggleSM2);
    document.getElementById('exportSetBtn')?.addEventListener('click', handleExportSet);
    document.getElementById('importSetBtn')?.addEventListener('click', handleImportSet);
    document.getElementById('keyboardSettingsBtn')?.addEventListener('click', () => {
        loadKeyboardSettingsModal();
        showModal('keyboardSettingsModal');
    });

    // Settings Modal
    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => hideModal('settingsModal'));
    document.getElementById('saveSettingsBtn')?.addEventListener('click', handleSaveSettings);
    document.getElementById('settingUsePremium')?.addEventListener('change', (e) => {
        const container = document.getElementById('premiumSettingsContainer');
        if (container) {
            container.classList.toggle('hidden', !e.target.checked);
        }
    });

    // Keyboard Settings Modal
    document.getElementById('keyboardSettingsCloseBtn')?.addEventListener('click', () => hideModal('keyboardSettingsModal'));
    document.getElementById('saveKeyBindingsBtn')?.addEventListener('click', handleSaveKeyBindings);

    // Modal overlays
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', hideAllModals);
    });

    // Global keyboard handler
    document.addEventListener('keydown', handleKeyboard);

    // Save on page unload
    window.addEventListener('beforeunload', () => {
        const session = getLearnSession();
        if (session && session.unseenIds.length > 0) {
            saveLearnSession(session);
        }
        saveState();
    });
}

function loadSettingsModal() {
    const ttsState = getTtsState();

    const keyInput = document.getElementById('elevenLabsKey');
    const autoReadCheck = document.getElementById('settingAutoRead');
    const usePremiumCheck = document.getElementById('settingUsePremium');
    const voiceSelect = document.getElementById('voiceSelector');
    const premiumContainer = document.getElementById('premiumSettingsContainer');

    if (keyInput) keyInput.value = ttsState.elevenLabsKey || '';
    if (autoReadCheck) autoReadCheck.checked = ttsState.autoRead || false;
    if (usePremiumCheck) usePremiumCheck.checked = ttsState.usePremium || false;
    if (voiceSelect) voiceSelect.value = ttsState.selectedVoiceId || '21m00Tcm4TlvDq8ikWAM';
    if (premiumContainer) {
        premiumContainer.classList.toggle('hidden', !ttsState.usePremium);
    }
}

function loadLearnSettingsModal() {
    const features = getFeatures();
    const sm2Check = document.getElementById('settingSM2');
    if (sm2Check) sm2Check.checked = features.spacedRepetition;
}

function loadKeyboardSettingsModal() {
    const settings = getSettings();
    const keys = settings.keyBindings;

    Object.entries(keys).forEach(([key, value]) => {
        const input = document.querySelector(`#keyboardSettingsModal input[data-key="${key}"]`);
        if (input) input.value = value;
    });
}
