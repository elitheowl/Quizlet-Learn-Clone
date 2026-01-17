/**
 * spacedRep.js - SM-2 Spaced Repetition Algorithm
 * Implements SuperMemo 2 algorithm for optimal review scheduling
 */

// Grade definitions
export const GRADES = {
    AGAIN: 1,  // Complete blackout, wrong answer
    HARD: 2,   // Correct but with difficulty
    GOOD: 3,   // Correct with some hesitation
    EASY: 4    // Perfect recall, effortless
};

// Grade labels for UI
export const GRADE_LABELS = {
    [GRADES.AGAIN]: 'Again',
    [GRADES.HARD]: 'Hard',
    [GRADES.GOOD]: 'Good',
    [GRADES.EASY]: 'Easy'
};

// Grade colors for UI
export const GRADE_COLORS = {
    [GRADES.AGAIN]: { bg: 'bg-red-500', hover: 'hover:bg-red-600', text: 'text-white' },
    [GRADES.HARD]: { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', text: 'text-white' },
    [GRADES.GOOD]: { bg: 'bg-green-500', hover: 'hover:bg-green-600', text: 'text-white' },
    [GRADES.EASY]: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', text: 'text-white' }
};

// Minimum ease factor
const MIN_EASE = 1.3;

// Default intervals in days
const DEFAULT_INTERVALS = {
    FIRST: 1,      // First successful review
    SECOND: 6      // Second successful review
};

/**
 * Calculate new interval and ease based on SM-2 algorithm
 * @param {Object} stats - Current card stats { ease, interval, repetitions }
 * @param {number} grade - Grade from 1-4
 * @returns {Object} Updated stats { ease, interval, dueAt, repetitions }
 */
export function calculateSM2(stats, grade) {
    const { ease, interval, repetitions } = stats;
    const now = Date.now();

    let newEase = ease;
    let newInterval = interval;
    let newRepetitions = repetitions;

    if (grade === GRADES.AGAIN) {
        // Failed - reset to beginning
        newRepetitions = 0;
        newInterval = 1;
        // Decrease ease
        newEase = Math.max(MIN_EASE, ease - 0.2);
    } else {
        // Successful recall
        newRepetitions = repetitions + 1;

        // Calculate new interval
        if (newRepetitions === 1) {
            newInterval = DEFAULT_INTERVALS.FIRST;
        } else if (newRepetitions === 2) {
            newInterval = DEFAULT_INTERVALS.SECOND;
        } else {
            newInterval = Math.round(interval * ease);
        }

        // Adjust interval based on grade
        if (grade === GRADES.HARD) {
            newInterval = Math.max(1, Math.round(newInterval * 0.8));
            newEase = Math.max(MIN_EASE, ease - 0.15);
        } else if (grade === GRADES.GOOD) {
            // Standard progression
            newEase = ease; // No change
        } else if (grade === GRADES.EASY) {
            newInterval = Math.round(newInterval * 1.3);
            newEase = ease + 0.15;
        }
    }

    // Calculate due date
    const dueAt = now + (newInterval * 24 * 60 * 60 * 1000);

    return {
        ease: newEase,
        interval: newInterval,
        dueAt: dueAt,
        repetitions: newRepetitions,
        lastReviewed: now
    };
}

/**
 * Check if a card is due for review
 * @param {Object} card - Card object with stats
 * @returns {boolean}
 */
export function isCardDue(card) {
    if (!card.stats || !card.stats.dueAt) return true;
    return card.stats.dueAt <= Date.now();
}

/**
 * Get cards due for review from a set
 * @param {Array} cards - Array of card objects
 * @returns {Array} Cards that are due
 */
export function getDueCards(cards) {
    return cards.filter(isCardDue);
}

/**
 * Get next review date as human-readable string
 * @param {number} dueAt - Timestamp
 * @returns {string}
 */
export function getNextReviewText(dueAt) {
    if (!dueAt) return 'Now';

    const now = Date.now();
    const diff = dueAt - now;

    if (diff <= 0) return 'Now';

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return 'Now';
}

/**
 * Get mastery level based on stats
 * @param {Object} stats - Card stats
 * @returns {number} 0-5 mastery level
 */
export function getMasteryLevel(stats) {
    if (!stats) return 0;

    const { repetitions, ease, interval } = stats;

    if (repetitions === 0) return 0;
    if (repetitions === 1) return 1;
    if (repetitions === 2) return 2;
    if (interval >= 7 && ease >= 2.0) return 3;
    if (interval >= 21 && ease >= 2.3) return 4;
    if (interval >= 60 && ease >= 2.5) return 5;

    return Math.min(repetitions, 3);
}

/**
 * Get mastery level label
 * @param {number} level - 0-5
 * @returns {string}
 */
export function getMasteryLabel(level) {
    const labels = {
        0: 'New',
        1: 'Learning',
        2: 'Learning',
        3: 'Familiar',
        4: 'Known',
        5: 'Mastered'
    };
    return labels[level] || 'New';
}

/**
 * Get mastery color class
 * @param {number} level - 0-5
 * @returns {string}
 */
export function getMasteryColor(level) {
    const colors = {
        0: 'text-slate-400',
        1: 'text-red-500',
        2: 'text-orange-500',
        3: 'text-yellow-500',
        4: 'text-green-500',
        5: 'text-emerald-600'
    };
    return colors[level] || 'text-slate-400';
}

/**
 * Sort cards by due date (most urgent first)
 * @param {Array} cards - Array of cards
 * @returns {Array} Sorted cards
 */
export function sortByDueDate(cards) {
    return [...cards].sort((a, b) => {
        const aDue = a.stats?.dueAt || 0;
        const bDue = b.stats?.dueAt || 0;
        return aDue - bDue;
    });
}

/**
 * Get estimated study time in minutes
 * @param {number} cardCount - Number of cards
 * @param {number} secondsPerCard - Average time per card (default 10)
 * @returns {number} Minutes
 */
export function estimateStudyTime(cardCount, secondsPerCard = 10) {
    return Math.ceil((cardCount * secondsPerCard) / 60);
}
