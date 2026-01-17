/**
 * navigation.js - Section Navigation
 * Explicit show/hide functions for all app sections
 */

// Section IDs
const SECTIONS = {
    HOME: 'homeSection',
    SET_VIEW: 'setViewSection',
    LEARN: 'learnSection'
};

// Modal IDs
const MODALS = {
    SETTINGS: 'settingsModal',
    CREATE_SET: 'createSetModal',
    ADD_CARD: 'addCardModal',
    BULK_IMPORT: 'bulkImportModal',
    LEARN_SETTINGS: 'learnSettingsModal',
    KEYBOARD_SETTINGS: 'keyboardSettingsModal'
};

// Current navigation state
let currentSection = SECTIONS.HOME;
let navigationHistory = [];

/**
 * Hide all main sections
 */
function hideAllSections() {
    Object.values(SECTIONS).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

/**
 * Hide all modals
 */
export function hideAllModals() {
    Object.values(MODALS).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

/**
 * Show the home section
 * @param {Function} renderCallback - Callback to render home content
 */
export function showHome(renderCallback) {
    hideAllSections();
    hideAllModals();

    const homeSection = document.getElementById(SECTIONS.HOME);
    if (homeSection) {
        homeSection.classList.remove('hidden');
    }

    currentSection = SECTIONS.HOME;
    navigationHistory = [SECTIONS.HOME];

    if (renderCallback) {
        renderCallback();
    }

    // Update URL hash for bookmarking (optional)
    history.replaceState({ section: 'home' }, '', '#home');
}

/**
 * Show the set view section
 * @param {string} setId - Set to display
 * @param {Function} renderCallback - Callback to render set view
 */
export function showSetView(setId, renderCallback) {
    hideAllSections();
    hideAllModals();

    const setViewSection = document.getElementById(SECTIONS.SET_VIEW);
    if (setViewSection) {
        setViewSection.classList.remove('hidden');
    }

    currentSection = SECTIONS.SET_VIEW;
    navigationHistory.push(SECTIONS.SET_VIEW);

    if (renderCallback) {
        renderCallback(setId);
    }

    history.replaceState({ section: 'set', setId }, '', `#set/${setId}`);
}

/**
 * Show learn mode section
 * @param {string} setId - Set to learn
 * @param {Object} options - { resume, mode }
 * @param {Function} renderCallback - Callback to render learn mode
 */
export function showLearnMode(setId, options = {}, renderCallback) {
    hideAllSections();
    hideAllModals();

    const learnSection = document.getElementById(SECTIONS.LEARN);
    if (learnSection) {
        learnSection.classList.remove('hidden');
    }

    currentSection = SECTIONS.LEARN;
    navigationHistory.push(SECTIONS.LEARN);

    if (renderCallback) {
        renderCallback(setId, options);
    }

    history.replaceState({ section: 'learn', setId }, '', `#learn/${setId}`);
}

/**
 * Navigate back
 * @param {Object} callbacks - { home, setView }
 */
export function navigateBack(callbacks = {}) {
    navigationHistory.pop(); // Remove current
    const previous = navigationHistory[navigationHistory.length - 1];

    if (previous === SECTIONS.SET_VIEW && callbacks.setView) {
        showSetView(null, callbacks.setView);
    } else {
        showHome(callbacks.home);
    }
}

/**
 * Get current section
 * @returns {string}
 */
export function getCurrentSection() {
    return currentSection;
}

/**
 * Show a modal
 * @param {string} modalId - Modal element ID
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');

        // Focus first input if exists
        const firstInput = modal.querySelector('input, textarea, select');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

/**
 * Hide a modal
 * @param {string} modalId - Modal element ID
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Toggle a modal
 * @param {string} modalId - Modal element ID
 */
export function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

/**
 * Check if a section is visible
 * @param {string} sectionId - Section ID
 * @returns {boolean}
 */
export function isSectionVisible(sectionId) {
    const section = document.getElementById(sectionId);
    return section && !section.classList.contains('hidden');
}

/**
 * Check if any modal is open
 * @returns {boolean}
 */
export function isModalOpen() {
    return Object.values(MODALS).some(id => {
        const modal = document.getElementById(id);
        return modal && !modal.classList.contains('hidden');
    });
}

// Export section/modal constants
export { SECTIONS, MODALS };
