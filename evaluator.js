// evaluator.js
'use strict';

import { LOCAL_SUITS } from './state.js';

export function cardNumericValue(card) {
    const map = { ACE: 14, KING: 13, QUEEN: 12, JACK: 11, '10': 10 };
    return map[card.value] || parseInt(card.value, 10);
}

export function suitSymbol(suit) {
    return { SPADES: '♠', HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣' }[suit] || suit;
}

export function cardShortName(card) {
    const vmap = { ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J', '10': '10' };
    const v = vmap[card.value] || card.value;
    return `${v}${suitSymbol(card.suit)}`;
}

export function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = getCombinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

export function evaluate5Card(cards5) {
    const vals = cards5.map(cardNumericValue).sort((a, b) => b - a);
    const suits = cards5.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);

    let isStraight = false;
    let straightHigh = vals[0];
    const uniqueVals = [...new Set(vals)];
    if (uniqueVals.length === 5 && vals[0] - vals[4] === 4) {
        isStraight = true;
        straightHigh = vals[0];
    }
    if (!isStraight && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
        isStraight = true;
        straightHigh = 5;
    }

    const cnt = {};
    for (const v of vals) cnt[v] = (cnt[v] || 0) + 1;
    const groups = Object.entries(cnt)
        .map(([v, c]) => ({ v: +v, c }))
        .sort((a, b) => b.c - a.c || b.v - a.v);

    const enc = (...vs) => vs.reduce((acc, v) => acc * 15 + v, 0);

    let rank, name;
    if (isFlush && isStraight) {
        rank = 8;
        name = straightHigh === 14 ? 'Royal Flush' : 'Straight Flush';
        return { rank: rank * 1e10 + straightHigh, name, cards: cards5 };
    }
    if (groups[0].c === 4) {
        rank = 7; name = 'Four of a Kind';
        return { rank: rank * 1e10 + enc(groups[0].v, groups[1].v), name, cards: cards5 };
    }
    if (groups[0].c === 3 && groups[1].c === 2) {
        rank = 6; name = 'Full House';
        return { rank: rank * 1e10 + enc(groups[0].v, groups[1].v), name, cards: cards5 };
    }
    if (isFlush) {
        rank = 5; name = 'Flush';
        return { rank: rank * 1e10 + enc(...vals), name, cards: cards5 };
    }
    if (isStraight) {
        rank = 4; name = 'Straight';
        return { rank: rank * 1e10 + straightHigh, name, cards: cards5 };
    }
    if (groups[0].c === 3) {
        rank = 3; name = 'Three of a Kind';
        const kickers = groups.filter(g => g.c === 1).map(g => g.v);
        return { rank: rank * 1e10 + enc(groups[0].v, kickers[0], kickers[1]), name, cards: cards5 };
    }
    if (groups[0].c === 2 && groups[1].c === 2) {
        rank = 2; name = 'Two Pair';
        const kicker = groups.find(g => g.c === 1).v;
        const p1 = groups[0].v, p2 = groups[1].v;
        return { rank: rank * 1e10 + enc(p1, p2, kicker), name, cards: cards5 };
    }
    if (groups[0].c === 2) {
        rank = 1; name = 'One Pair';
        const kickers = groups.filter(g => g.c === 1).map(g => g.v);
        return { rank: rank * 1e10 + enc(groups[0].v, kickers[0], kickers[1], kickers[2]), name, cards: cards5 };
    }
    rank = 0; name = 'High Card';
    return { rank: rank * 1e10 + enc(...vals), name, cards: cards5 };
}

export function evaluateHand(cards) {
    if (cards.length < 5) return { rank: -1, name: '(incomplete)', cards };
    const combos = getCombinations(cards, 5);
    let best = null;
    for (const combo of combos) {
        const res = evaluate5Card(combo);
        if (!best || res.rank > best.rank) best = res;
    }
    return best;
}

export function scorePreflopHand(cards2) {
    const v0 = cardNumericValue(cards2[0]);
    const v1 = cardNumericValue(cards2[1]);
    const hi = Math.max(v0, v1), lo = Math.min(v0, v1);
    const suited = cards2[0].suit === cards2[1].suit;

    if (hi === lo) return 10;
    if (hi === 14 && lo >= 11) return 9;
    if (hi === 13 && lo >= 12) return 8;
    if (hi === 14 && lo >= 10) return 7;
    if (suited && hi - lo <= 2) return 6;
    if (hi >= 12 && lo >= 10) return 5;
    if (hi >= 11) return 4;
    return Math.max(0, hi + lo - 18);
}

export function checkDraw(holeCards, community) {
    const all = [...holeCards, ...community];
    if (all.length < 4) return false;
    for (const suit of LOCAL_SUITS) {
        if (all.filter(c => c.suit === suit).length >= 4) return true;
    }
    const sorted = [...new Set(all.map(cardNumericValue))].sort((a, b) => a - b);
    for (let i = 0; i <= sorted.length - 4; i++) {
        if (sorted[i + 3] - sorted[i] === 3) return true;
    }
    return false;
}
