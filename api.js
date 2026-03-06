// api.js
'use strict';

import {
    API_BASE, API_RETRY, API_RETRY_DELAY, MIN_CARDS,
    LOCAL_SUITS, LOCAL_VALUES, gameState, delay
} from './state.js';
import { setLoading, showApiWarning, hideApiWarning } from './ui.js';

let _localDeck = [];

export async function apiFetch(url, retries = API_RETRY) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.success === false) throw new Error(data.error || 'API error');
            return data;
        } catch (err) {
            if (attempt < retries) {
                await delay(API_RETRY_DELAY);
            } else {
                throw err;
            }
        }
    }
}

export async function getNewDeck() {
    setLoading(true);
    try {
        const data = await apiFetch(`${API_BASE}/new/shuffle/?deck_count=1`);
        gameState.deckId = data.deck_id;
        gameState.remainingCards = data.remaining;
        hideApiWarning();
    } catch (err) {
        console.warn('getNewDeck failed:', err);
        gameState.deckId = null;
        gameState.remainingCards = 52;
        showApiWarning();
    } finally {
        setLoading(false);
    }
}

export async function drawCards(n) {
    if (gameState.remainingCards < MIN_CARDS && gameState.deckId) {
        await reshuffleDeck();
    }

    if (gameState.deckId) {
        setLoading(true);
        try {
            const data = await apiFetch(`${API_BASE}/${gameState.deckId}/draw/?count=${n}`);
            gameState.remainingCards = data.remaining;
            setLoading(false);
            return data.cards;
        } catch (err) {
            console.warn('drawCards failed:', err);
            showApiWarning();
            setLoading(false);
        }
    }
    return localDrawCards(n);
}

export async function reshuffleDeck() {
    if (!gameState.deckId) return;
    try {
        const data = await apiFetch(`${API_BASE}/${gameState.deckId}/shuffle/`);
        gameState.remainingCards = data.remaining;
    } catch (err) {
        console.warn('reshuffle failed:', err);
    }
}

export function rebuildLocalDeck() {
    _localDeck = [];
    for (const suit of LOCAL_SUITS) {
        for (const value of LOCAL_VALUES) {
            const code = (value === '10' ? 'T' : value[0]) + suit[0];
            _localDeck.push({
                code,
                value,
                suit,
                image: `https://deckofcardsapi.com/static/img/${buildApiCode(value, suit)}.png`,
            });
        }
    }
    shuffle(_localDeck);
}

function buildApiCode(value, suit) {
    const v = value === '10' ? '0' : value[0];
    return v + suit[0];
}

function localDrawCards(n) {
    if (_localDeck.length < n) rebuildLocalDeck();
    return _localDeck.splice(0, n);
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
