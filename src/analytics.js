/**
 * analytics.js - Local Study Analytics
 * Tracks study patterns, streaks, and performance metrics
 */

import { getAnalytics, updateAnalytics } from './state.js';

/**
 * Record a card study event
 * @param {boolean} correct - Whether the answer was correct
 */
export function recordCardStudy(correct) {
    const analytics = getAnalytics();
    const today = getDateString(new Date());

    // Update totals
    const totalCardsStudied = (analytics.totalCardsStudied || 0) + 1;

    // Update daily stats
    const dailyStats = { ...analytics.dailyStats };
    if (!dailyStats[today]) {
        dailyStats[today] = { cards: 0, correct: 0, minutes: 0 };
    }
    dailyStats[today].cards += 1;
    if (correct) {
        dailyStats[today].correct += 1;
    }

    // Update streak
    const { streakDays, lastStudyDate } = calculateStreak(analytics.lastStudyDate, analytics.streakDays);

    updateAnalytics({
        totalCardsStudied,
        dailyStats,
        streakDays,
        lastStudyDate: today
    });
}

/**
 * Record study session time
 * @param {number} minutes - Minutes studied
 */
export function recordSessionTime(minutes) {
    const analytics = getAnalytics();
    const today = getDateString(new Date());

    const totalSessionMinutes = (analytics.totalSessionMinutes || 0) + minutes;

    const dailyStats = { ...analytics.dailyStats };
    if (!dailyStats[today]) {
        dailyStats[today] = { cards: 0, correct: 0, minutes: 0 };
    }
    dailyStats[today].minutes += minutes;

    updateAnalytics({
        totalSessionMinutes,
        dailyStats
    });
}

/**
 * Calculate streak based on last study date
 * @param {string} lastStudyDate - Last study date string
 * @param {number} currentStreak - Current streak count
 * @returns {Object} { streakDays, lastStudyDate }
 */
function calculateStreak(lastStudyDate, currentStreak = 0) {
    const today = getDateString(new Date());
    const yesterday = getDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

    if (lastStudyDate === today) {
        // Already studied today
        return { streakDays: currentStreak, lastStudyDate: today };
    } else if (lastStudyDate === yesterday) {
        // Continued streak
        return { streakDays: currentStreak + 1, lastStudyDate: today };
    } else if (!lastStudyDate) {
        // First study
        return { streakDays: 1, lastStudyDate: today };
    } else {
        // Streak broken
        return { streakDays: 1, lastStudyDate: today };
    }
}

/**
 * Get date string in YYYY-MM-DD format
 * @param {Date} date
 * @returns {string}
 */
function getDateString(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Get today's statistics
 * @returns {Object} { cards, correct, minutes, accuracy }
 */
export function getTodayStats() {
    const analytics = getAnalytics();
    const today = getDateString(new Date());
    const stats = analytics.dailyStats[today] || { cards: 0, correct: 0, minutes: 0 };

    return {
        ...stats,
        accuracy: stats.cards > 0 ? Math.round((stats.correct / stats.cards) * 100) : 0
    };
}

/**
 * Get this week's statistics
 * @returns {Object} { cards, correct, minutes, accuracy, daysStudied }
 */
export function getWeekStats() {
    const analytics = getAnalytics();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let cards = 0;
    let correct = 0;
    let minutes = 0;
    let daysStudied = 0;

    for (let i = 0; i < 7; i++) {
        const date = new Date(weekAgo.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = getDateString(date);
        const dayStats = analytics.dailyStats[dateStr];

        if (dayStats && dayStats.cards > 0) {
            cards += dayStats.cards;
            correct += dayStats.correct;
            minutes += dayStats.minutes;
            daysStudied++;
        }
    }

    return {
        cards,
        correct,
        minutes,
        daysStudied,
        accuracy: cards > 0 ? Math.round((correct / cards) * 100) : 0
    };
}

/**
 * Get streak information
 * @returns {Object} { current, best }
 */
export function getStreakInfo() {
    const analytics = getAnalytics();
    return {
        current: analytics.streakDays || 0,
        lastStudyDate: analytics.lastStudyDate
    };
}

/**
 * Get total statistics
 * @returns {Object}
 */
export function getTotalStats() {
    const analytics = getAnalytics();
    return {
        totalCards: analytics.totalCardsStudied || 0,
        totalMinutes: analytics.totalSessionMinutes || 0,
        totalHours: Math.round((analytics.totalSessionMinutes || 0) / 60 * 10) / 10
    };
}

/**
 * Get chart data for last N days
 * @param {number} days - Number of days to get
 * @returns {Array} [{ date, cards, correct, minutes }]
 */
export function getChartData(days = 7) {
    const analytics = getAnalytics();
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = getDateString(date);
        const dayStats = analytics.dailyStats[dateStr] || { cards: 0, correct: 0, minutes: 0 };

        data.push({
            date: dateStr,
            label: date.toLocaleDateString('en-US', { weekday: 'short' }),
            ...dayStats
        });
    }

    return data;
}

/**
 * Clean up old analytics data (keep last 90 days)
 */
export function cleanupOldData() {
    const analytics = getAnalytics();
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const cutoffStr = getDateString(cutoff);

    const dailyStats = {};
    for (const date in analytics.dailyStats) {
        if (date >= cutoffStr) {
            dailyStats[date] = analytics.dailyStats[date];
        }
    }

    updateAnalytics({ dailyStats });
}
