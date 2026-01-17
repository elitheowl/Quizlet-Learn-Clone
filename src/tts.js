/**
 * tts.js - Text-to-Speech with IndexedDB Caching
 * Supports browser TTS (offline) and ElevenLabs premium voices
 */

import { getTtsState, updateTtsState } from './state.js';
import { getCachedAudio, setCachedAudio } from './storage.js';

let currentAudio = null;
let isSpeaking = false;
let preCacheQueue = [];
let isPreCaching = false;

/**
 * Generate cache key for audio
 * @param {string} text
 * @param {string} voiceId
 * @returns {string}
 */
function getCacheKey(text, voiceId) {
    // Truncate text to avoid extremely long keys
    const shortText = text.substring(0, 100);
    return `${shortText}-${voiceId}`;
}

/**
 * Speak text using available TTS
 * @param {string} text - Text to speak
 * @param {Object} options - { onStart, onEnd, onError }
 */
export async function speak(text, options = {}) {
    if (!text) return;

    const { onStart, onEnd, onError } = options;

    // Cancel any existing speech
    stop();

    const ttsState = getTtsState();
    isSpeaking = true;

    if (onStart) onStart();

    try {
        // Try premium TTS if enabled and key exists
        if (ttsState.usePremium && ttsState.elevenLabsKey && ttsState.elevenLabsKey.length > 10) {
            await speakElevenLabs(text, ttsState, { onEnd, onError });
        } else {
            speakBrowser(text, { onEnd, onError });
        }
    } catch (err) {
        console.warn('TTS error:', err);
        if (onError) onError(err);
        isSpeaking = false;
    }
}

/**
 * Stop current speech
 */
export function stop() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    window.speechSynthesis.cancel();
    isSpeaking = false;
}

/**
 * Check if currently speaking
 * @returns {boolean}
 */
export function getIsSpeaking() {
    return isSpeaking;
}

/**
 * Speak using ElevenLabs API with caching
 */
async function speakElevenLabs(text, ttsState, { onEnd, onError }) {
    const voiceId = ttsState.selectedVoiceId;
    const cacheKey = getCacheKey(text, voiceId);

    // Check cache first
    const cachedBlob = await getCachedAudio(cacheKey);
    if (cachedBlob) {
        console.log('TTS cache hit');
        playAudioBlob(cachedBlob, { onEnd, onError });
        return;
    }

    console.log('TTS cache miss, fetching...');

    try {
        const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': ttsState.elevenLabsKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text,
                    model_id: 'eleven_turbo_v2_5',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        const audioBlob = await response.blob();

        // Cache the audio
        await setCachedAudio(cacheKey, audioBlob, ttsState.cacheSize || 50);

        playAudioBlob(audioBlob, { onEnd, onError });
    } catch (err) {
        console.warn('ElevenLabs failed, falling back to browser TTS:', err);
        speakBrowser(text, { onEnd, onError });
    }
}

/**
 * Play audio blob
 */
function playAudioBlob(blob, { onEnd, onError }) {
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onended = () => {
        isSpeaking = false;
        currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        if (onEnd) onEnd();
    };

    audio.onerror = (e) => {
        isSpeaking = false;
        currentAudio = null;
        URL.revokeObjectURL(audioUrl);
        if (onError) onError(e);
    };

    audio.play().catch(e => {
        console.error('Audio play error:', e);
        isSpeaking = false;
        if (onError) onError(e);
    });
}

/**
 * Speak using browser TTS (offline capable)
 */
function speakBrowser(text, { onEnd, onError }) {
    if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported');
        isSpeaking = false;
        if (onError) onError(new Error('Speech synthesis not supported'));
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;

    // Find preferred voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
        voices.find(v => v.name.includes('Microsoft Aria Online (Natural)')) ||
        voices.find(v => v.name.includes('Microsoft Jenny Online (Natural)')) ||
        voices.find(v => v.name.includes('Google US English')) ||
        voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
        voices.find(v => v.lang === 'en-US');

    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
        isSpeaking = false;
        if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
        isSpeaking = false;
        if (onError) onError(e);
    };

    window.speechSynthesis.speak(utterance);
}

/**
 * Pre-cache audio for cards (idle pre-caching)
 * @param {Array} cards - Cards to pre-cache
 */
export async function preCacheCards(cards) {
    const ttsState = getTtsState();

    // Only pre-cache for premium TTS
    if (!ttsState.usePremium || !ttsState.elevenLabsKey) {
        return;
    }

    // Add to queue
    preCacheQueue = cards.filter(c => c && c.term);

    if (!isPreCaching) {
        processPreCacheQueue();
    }
}

/**
 * Process pre-cache queue in idle time
 */
async function processPreCacheQueue() {
    if (preCacheQueue.length === 0) {
        isPreCaching = false;
        return;
    }

    isPreCaching = true;
    const ttsState = getTtsState();

    // Process one at a time, yielding to main thread
    const card = preCacheQueue.shift();
    if (!card) {
        isPreCaching = false;
        return;
    }

    const cacheKey = getCacheKey(card.term, ttsState.selectedVoiceId);

    // Check if already cached
    const existing = await getCachedAudio(cacheKey);
    if (!existing) {
        try {
            const response = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${ttsState.selectedVoiceId}/stream`,
                {
                    method: 'POST',
                    headers: {
                        'xi-api-key': ttsState.elevenLabsKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: card.term,
                        model_id: 'eleven_turbo_v2_5',
                        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                    })
                }
            );

            if (response.ok) {
                const blob = await response.blob();
                await setCachedAudio(cacheKey, blob, ttsState.cacheSize || 50);
                console.log('Pre-cached:', card.term);
            }
        } catch (e) {
            console.warn('Pre-cache failed for:', card.term);
        }
    }

    // Continue processing queue with delay
    if (preCacheQueue.length > 0) {
        setTimeout(processPreCacheQueue, 1000);
    } else {
        isPreCaching = false;
    }
}

/**
 * Get available browser voices
 * @returns {Array}
 */
export function getBrowserVoices() {
    if (!('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
}

/**
 * Load voices (call on init, voices may load async)
 */
export function loadVoices() {
    if ('speechSynthesis' in window) {
        // Voices may not be immediately available
        speechSynthesis.onvoiceschanged = () => {
            // Voices are now loaded
        };
        // Trigger voice loading
        speechSynthesis.getVoices();
    }
}
