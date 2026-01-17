/**
 * render.js - DOM Rendering Functions
 * All UI rendering logic is centralized here
 */

import {
    getState, getAllSets, getSet, getActiveSet, getStarredCards, getDueCards,
    getLearnSession, getSettings, getFeatures, getTtsState
} from './state.js';
import { loadLearnSession } from './storage.js';
import {
    GRADES, GRADE_LABELS, GRADE_COLORS, getMasteryLevel, getMasteryLabel,
    getMasteryColor, getNextReviewText, estimateStudyTime
} from './spacedRep.js';
import { getTodayStats, getStreakInfo, getTotalStats } from './analytics.js';

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

export function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============================================================
// HOME SCREEN RENDERING
// ============================================================

export function renderHome(handlers) {
    renderHomeHeader(handlers);
    renderHomeQuickActions(handlers);
    renderHomeResumeSection(handlers);
    renderHomeSetGrid(handlers);
    renderHomeStats();
}

function renderHomeHeader(handlers) {
    const ttsState = getTtsState();
    const micIndicator = document.getElementById('micIndicator');

    if (micIndicator) {
        if (ttsState.usePremium && ttsState.elevenLabsKey) {
            micIndicator.classList.remove('text-slate-300');
            micIndicator.classList.add('text-green-500');
            micIndicator.setAttribute('title', 'Premium voices active');
        } else {
            micIndicator.classList.remove('text-green-500');
            micIndicator.classList.add('text-slate-300');
            micIndicator.setAttribute('title', 'Free voices (browser)');
        }
    }
}

function renderHomeQuickActions(handlers) {
    const container = document.getElementById('homeQuickActions');
    if (!container) return;

    const allSets = getAllSets();
    const setIds = Object.keys(allSets);

    if (setIds.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    // Calculate due cards across all sets
    let totalDue = 0;
    setIds.forEach(id => {
        const set = allSets[id];
        totalDue += getDueCards(id).length;
    });

    const dueBtn = document.getElementById('quickActionDue');
    if (dueBtn) {
        dueBtn.querySelector('.due-count').textContent = totalDue;
        dueBtn.disabled = totalDue === 0;
    }
}

function renderHomeResumeSection(handlers) {
    const container = document.getElementById('homeResumeSection');
    const card = document.getElementById('homeResumeCard');
    if (!container || !card) return;

    const savedSession = loadLearnSession();
    const allSets = getAllSets();

    if (savedSession && allSets[savedSession.setId]) {
        const set = allSets[savedSession.setId];
        const total = savedSession.unseenIds.length + savedSession.masteredIds.length;
        const mastered = savedSession.masteredIds.length;
        const progress = total > 0 ? Math.round((mastered / total) * 100) : 0;

        container.classList.remove('hidden');
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-lg text-slate-800 truncate">${escapeHtml(set.name)}</h3>
                    <p class="text-sm text-slate-500">
                        ${mastered} of ${total} cards • ${savedSession.mode === 'starred' ? 'Starred' : savedSession.mode === 'due' ? 'Due' : 'All'}
                    </p>
                </div>
                <div class="flex items-center gap-4">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-indigo-600">${progress}%</div>
                        <div class="text-xs text-slate-400">Complete</div>
                    </div>
                    <span class="material-symbols-outlined text-indigo-600 text-3xl">play_arrow</span>
                </div>
            </div>
            <div class="mt-3 w-full bg-slate-200 rounded-full h-2">
                <div class="bg-indigo-600 h-2 rounded-full transition-all" style="width: ${progress}%"></div>
            </div>
        `;

        card.onclick = () => handlers.onResumeSession?.(savedSession);
    } else {
        container.classList.add('hidden');
    }
}

function renderHomeSetGrid(handlers) {
    const grid = document.getElementById('homeSetGrid');
    if (!grid) return;

    const allSets = getAllSets();
    const setIds = Object.keys(allSets);

    if (setIds.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-16">
                <span class="material-symbols-outlined text-7xl text-slate-300 mb-4">library_books</span>
                <h3 class="text-xl font-semibold text-slate-600 mb-2">No study sets yet</h3>
                <p class="text-slate-400 mb-6">Create your first set to get started!</p>
                <button id="emptyCreateSetBtn" class="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-indigo-700 transition-all">
                    <span class="material-symbols-outlined">add</span>
                    Create Set
                </button>
            </div>
        `;

        document.getElementById('emptyCreateSetBtn')?.addEventListener('click', handlers.onCreateSet);
        return;
    }

    grid.innerHTML = setIds.map(setId => {
        const set = allSets[setId];
        const cardCount = set.cards.length;
        const starredCount = set.cards.filter(c => c.starred).length;
        const dueCount = getDueCards(setId).length;
        const masteredCount = set.cards.filter(c => getMasteryLevel(c.stats) >= 4).length;
        const progress = cardCount > 0 ? Math.round((masteredCount / cardCount) * 100) : 0;

        return `
            <button class="set-card group bg-white p-5 rounded-xl shadow-sm border border-slate-200 text-left
                          hover:shadow-lg hover:border-indigo-300 hover:scale-[1.02] transition-all duration-200"
                    data-set-id="${setId}" aria-label="Open ${escapeHtml(set.name)}">
                <h3 class="font-semibold text-lg text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors truncate">
                    ${escapeHtml(set.name)}
                </h3>
                <div class="flex flex-wrap items-center gap-3 text-sm text-slate-500 mb-3">
                    <span class="flex items-center gap-1">
                        <span class="material-symbols-outlined text-base">style</span>
                        ${cardCount}
                    </span>
                    ${starredCount > 0 ? `
                        <span class="flex items-center gap-1 text-yellow-600">
                            <span class="material-symbols-outlined text-base filled">star</span>
                            ${starredCount}
                        </span>
                    ` : ''}
                    ${dueCount > 0 ? `
                        <span class="flex items-center gap-1 text-orange-500">
                            <span class="material-symbols-outlined text-base">schedule</span>
                            ${dueCount} due
                        </span>
                    ` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div class="bg-green-500 h-1.5 rounded-full transition-all" style="width: ${progress}%"></div>
                    </div>
                    <span class="text-xs text-slate-400">${progress}%</span>
                </div>
            </button>
        `;
    }).join('');

    grid.querySelectorAll('.set-card').forEach(card => {
        card.addEventListener('click', () => {
            handlers.onSelectSet?.(card.dataset.setId);
        });
    });
}

function renderHomeStats() {
    const container = document.getElementById('homeStats');
    if (!container) return;

    const todayStats = getTodayStats();
    const streakInfo = getStreakInfo();
    const totalStats = getTotalStats();

    container.innerHTML = `
        <div class="flex items-center gap-2 text-sm">
            <span class="material-symbols-outlined text-orange-500">local_fire_department</span>
            <span class="font-medium">${streakInfo.current}</span>
            <span class="text-slate-400">day streak</span>
        </div>
        <div class="w-px h-4 bg-slate-200"></div>
        <div class="flex items-center gap-2 text-sm">
            <span class="material-symbols-outlined text-indigo-500">school</span>
            <span class="font-medium">${todayStats.cards}</span>
            <span class="text-slate-400">today</span>
        </div>
    `;
}

// ============================================================
// SET VIEW RENDERING
// ============================================================

export function renderSetView(setId, handlers) {
    const set = getSet(setId);
    if (!set) return;

    renderSetViewHeader(set, handlers);
    renderFlashcardCarousel(set, handlers);
    renderSetViewActions(set, handlers);
    renderTermList(set, handlers);
}

function renderSetViewHeader(set, handlers) {
    const title = document.getElementById('setViewTitle');
    const cardCount = document.getElementById('setViewCardCount');
    const starredCount = document.getElementById('setViewStarredCount');
    const dueCount = document.getElementById('setViewDueCount');

    if (title) title.textContent = set.name;
    if (cardCount) cardCount.textContent = set.cards.length;
    if (starredCount) starredCount.textContent = set.cards.filter(c => c.starred).length;
    if (dueCount) {
        const due = set.cards.filter(c => c.stats?.dueAt <= Date.now()).length;
        dueCount.textContent = due;
    }
}

function renderFlashcardCarousel(set, handlers) {
    const flashcard = document.getElementById('flashcard');
    const flashcardFront = document.getElementById('flashcardFront');
    const flashcardBack = document.getElementById('flashcardBack');
    const flashcardCounter = document.getElementById('flashcardCounter');
    const noCardsMessage = document.getElementById('noCardsMessage');

    if (!flashcard) return;

    if (set.cards.length === 0) {
        flashcard.classList.add('hidden');
        if (noCardsMessage) noCardsMessage.classList.remove('hidden');
        if (flashcardCounter) flashcardCounter.textContent = '0 / 0';
        return;
    }

    flashcard.classList.remove('hidden');
    if (noCardsMessage) noCardsMessage.classList.add('hidden');

    const index = handlers.currentIndex || 0;
    const order = handlers.cardOrder || set.cards.map((_, i) => i);
    const actualIndex = order[index % order.length];
    const card = set.cards[actualIndex];

    if (!card) return;

    if (flashcardFront) flashcardFront.textContent = card.term;
    if (flashcardBack) flashcardBack.textContent = card.definition;
    if (flashcardCounter) flashcardCounter.textContent = `${index + 1} / ${set.cards.length}`;

    // Reset flip state
    flashcard.classList.remove('flipped');
}

function renderSetViewActions(set, handlers) {
    const learnBtn = document.getElementById('setViewLearnBtn');
    const starredBtn = document.getElementById('setViewStarredBtn');
    const dueBtn = document.getElementById('setViewDueBtn');

    const starredCount = set.cards.filter(c => c.starred).length;
    const dueCount = set.cards.filter(c => c.stats?.dueAt <= Date.now()).length;

    if (learnBtn) {
        learnBtn.disabled = set.cards.length < 2;
    }
    if (starredBtn) {
        starredBtn.disabled = starredCount < 2;
    }
    if (dueBtn) {
        dueBtn.disabled = dueCount < 2;
        const countSpan = dueBtn.querySelector('.due-count');
        if (countSpan) countSpan.textContent = dueCount;
    }
}

function renderTermList(set, handlers) {
    const container = document.getElementById('setViewTermList');
    if (!container) return;

    if (set.cards.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <span class="material-symbols-outlined text-5xl mb-3">note_add</span>
                <p class="text-lg">No cards yet</p>
                <p class="text-sm">Add cards to start studying!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = set.cards.map((card, index) => {
        const mastery = getMasteryLevel(card.stats);
        const masteryLabel = getMasteryLabel(mastery);
        const masteryColor = getMasteryColor(mastery);
        const nextReview = getNextReviewText(card.stats?.dueAt);

        return `
            <div class="term-item group flex items-start gap-3 p-4 bg-white rounded-lg border border-slate-200 
                        hover:border-slate-300 hover:shadow-sm transition-all" data-card-id="${card.uuid}">
                <button class="star-btn flex-shrink-0 p-1.5 rounded-lg transition-all
                               ${card.starred ? 'text-yellow-500 bg-yellow-50' : 'text-slate-300 hover:text-yellow-400 hover:bg-yellow-50'}"
                        data-card-id="${card.uuid}" aria-label="${card.starred ? 'Unstar' : 'Star'}">
                    <span class="material-symbols-outlined ${card.starred ? 'filled' : ''}">star</span>
                </button>
                
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="term-text font-medium text-slate-800" 
                              contenteditable="true" 
                              data-card-id="${card.uuid}" 
                              data-field="term">${escapeHtml(card.term)}</span>
                        <span class="text-xs px-2 py-0.5 rounded-full ${masteryColor} bg-slate-100">${masteryLabel}</span>
                        ${card.stats?.dueAt ? `<span class="text-xs text-slate-400">${nextReview}</span>` : ''}
                    </div>
                    <p class="def-text text-sm text-slate-500" 
                       contenteditable="true" 
                       data-card-id="${card.uuid}" 
                       data-field="definition">${escapeHtml(card.definition)}</p>
                </div>
                
                <div class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="speak-btn p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            data-term="${escapeHtml(card.term)}" aria-label="Listen">
                        <span class="material-symbols-outlined">volume_up</span>
                    </button>
                    <button class="delete-card-btn p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            data-card-id="${card.uuid}" aria-label="Delete">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Event listeners
    container.querySelectorAll('.star-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlers.onToggleStar?.(btn.dataset.cardId);
        });
    });

    container.querySelectorAll('.speak-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handlers.onSpeak?.(btn.dataset.term);
        });
    });

    container.querySelectorAll('.delete-card-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this card?')) {
                handlers.onDeleteCard?.(btn.dataset.cardId);
            }
        });
    });

    // Inline editing
    container.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.addEventListener('blur', () => {
            handlers.onUpdateCard?.(el.dataset.cardId, el.dataset.field, el.textContent.trim());
        });

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
            if (e.key === 'Escape') {
                // Revert would require storing original value
                el.blur();
            }
        });
    });
}

// ============================================================
// LEARN MODE RENDERING
// ============================================================

export function renderLearnMode(session, set, handlers) {
    renderLearnProgress(session);
    renderLearnQuestion(session, set, handlers);
}

function renderLearnProgress(session) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const total = session.unseenIds.length + session.masteredIds.length;
    const mastered = session.masteredIds.length;
    const progress = total > 0 ? (mastered / total) * 100 : 0;

    if (progressBar) progressBar.style.width = `${progress}%`;
    if (progressText) progressText.textContent = `${mastered} / ${total}`;
}

export function renderLearnQuestion(session, set, handlers) {
    const questionText = document.getElementById('questionText');
    const gradeButtons = document.getElementById('gradeButtons');
    const answerOptions = document.getElementById('answerOptions');

    if (!session.currentQuestionId) return;

    const card = set.cards.find(c => c.uuid === session.currentQuestionId);
    if (!card) return;

    // Render question (definition)
    if (questionText) {
        questionText.innerHTML = '';
        const words = card.definition.split(/\s+/);
        words.forEach(word => {
            const span = document.createElement('span');
            span.textContent = word + ' ';
            span.className = 'clickable-word cursor-pointer hover:bg-indigo-100 rounded px-0.5 transition-colors';
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                handlers.onWordClick?.(word.replace(/[.,!?;:'"()]/g, ''), e.clientX, e.clientY);
            });
            questionText.appendChild(span);
        });
    }

    // Render grade buttons (SM-2 style)
    if (gradeButtons) {
        // Always use multiple choice mode
        gradeButtons.classList.add('hidden');
        if (answerOptions) answerOptions.classList.remove('hidden');
        renderMultipleChoice(session, set, handlers);
    }
}

function renderMultipleChoice(session, set, handlers) {
    const answerOptions = document.getElementById('answerOptions');
    if (!answerOptions) return;

    const currentCard = set.cards.find(c => c.uuid === session.currentQuestionId);
    if (!currentCard) return;

    let options = [currentCard];
    const otherCards = set.cards.filter(c => c.uuid !== currentCard.uuid);
    const shuffled = shuffleArray(otherCards);

    const numOptions = Math.min(4, set.cards.length);
    while (options.length < numOptions && shuffled.length > 0) {
        options.push(shuffled.pop());
    }

    options = shuffleArray(options);

    answerOptions.innerHTML = options.map(card => `
        <button class="answer-btn w-full text-left p-4 border-2 border-slate-300 rounded-lg 
                       hover:bg-slate-50 hover:border-indigo-400 transition-all"
                data-id="${card.uuid}">
            ${escapeHtml(card.term)}
        </button>
    `).join('');

    answerOptions.querySelectorAll('.answer-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const isCorrect = btn.dataset.id === currentCard.uuid;
            handlers.onAnswer?.(isCorrect, btn, currentCard.uuid);
        });
    });
}

export function renderAnswerFeedback(selectedBtn, correctId, isCorrect) {
    const answerOptions = document.getElementById('answerOptions');
    if (!answerOptions) return;

    answerOptions.querySelectorAll('.answer-btn').forEach(btn => {
        btn.disabled = true;
        btn.classList.remove('hover:bg-slate-50', 'hover:border-indigo-400');

        if (btn.dataset.id === correctId) {
            btn.classList.remove('border-slate-300');
            btn.classList.add('bg-green-100', 'border-green-500', 'text-green-800');
        } else if (btn === selectedBtn && !isCorrect) {
            btn.classList.remove('border-slate-300');
            btn.classList.add('bg-red-100', 'border-red-500', 'text-red-800');
        }
    });
}

export function renderLearnFeedback(isCorrect, correctAnswer) {
    const feedbackSection = document.getElementById('feedbackSection');
    const feedbackTitle = document.getElementById('feedbackTitle');
    const feedbackText = document.getElementById('feedbackText');
    const learnContent = document.getElementById('learnContent');

    if (!feedbackSection) return;

    if (learnContent) learnContent.classList.add('hidden');
    feedbackSection.classList.remove('hidden');

    if (isCorrect) {
        feedbackTitle.textContent = 'Correct!';
        feedbackTitle.className = 'text-xl font-bold text-green-600';
        feedbackText.textContent = 'Great job! Keep going!';
    } else {
        feedbackTitle.textContent = 'Not quite...';
        feedbackTitle.className = 'text-xl font-bold text-red-600';
        feedbackText.textContent = `The correct answer was "${correctAnswer}". We'll ask this again later.`;
    }
}

export function renderLearnSummary(batchHistory) {
    const summaryScreen = document.getElementById('summaryScreen');
    const summaryCorrect = document.getElementById('summaryCorrect');
    const summaryMissed = document.getElementById('summaryMissed');
    const summaryList = document.getElementById('summaryList');
    const learnContent = document.getElementById('learnContent');
    const feedbackSection = document.getElementById('feedbackSection');

    if (!summaryScreen) return;

    if (learnContent) learnContent.classList.add('hidden');
    if (feedbackSection) feedbackSection.classList.add('hidden');
    summaryScreen.classList.remove('hidden');

    const correct = batchHistory.filter(h => h.correct).length;
    const missed = batchHistory.length - correct;

    if (summaryCorrect) summaryCorrect.textContent = correct;
    if (summaryMissed) summaryMissed.textContent = missed;

    if (summaryList) {
        summaryList.innerHTML = batchHistory.map(item => `
            <div class="flex justify-between items-center p-3 rounded-lg ${item.correct ? 'bg-green-50' : 'bg-red-50'} mb-2">
                <div class="min-w-0">
                    <p class="font-medium text-slate-800 truncate">${escapeHtml(item.card?.term || 'Unknown')}</p>
                    <p class="text-sm text-slate-500 truncate">${escapeHtml(item.card?.definition || '')}</p>
                </div>
                <span class="${item.correct ? 'text-green-600' : 'text-red-600'} font-semibold ml-4">
                    ${item.correct ? 'Correct' : 'Missed'}
                </span>
            </div>
        `).join('');
    }
}

export function renderLearnCompletion() {
    const completionScreen = document.getElementById('completionScreen');
    const learnContent = document.getElementById('learnContent');
    const feedbackSection = document.getElementById('feedbackSection');
    const summaryScreen = document.getElementById('summaryScreen');

    if (learnContent) learnContent.classList.add('hidden');
    if (feedbackSection) feedbackSection.classList.add('hidden');
    if (summaryScreen) summaryScreen.classList.add('hidden');
    if (completionScreen) completionScreen.classList.remove('hidden');
}

export function resetLearnUI() {
    const learnContent = document.getElementById('learnContent');
    const feedbackSection = document.getElementById('feedbackSection');
    const summaryScreen = document.getElementById('summaryScreen');
    const completionScreen = document.getElementById('completionScreen');

    if (learnContent) learnContent.classList.remove('hidden');
    if (feedbackSection) feedbackSection.classList.add('hidden');
    if (summaryScreen) summaryScreen.classList.add('hidden');
    if (completionScreen) completionScreen.classList.add('hidden');
}
