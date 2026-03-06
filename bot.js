// bot.js
'use strict';

import { gameState } from './state.js';
import { scorePreflopHand, evaluateHand, checkDraw, getCombinations } from './evaluator.js';

export function botChooseAction(validActions, phase) {
    const rand = Math.random();

    const isDealer = !gameState.dealerIsPlayer;
    const myBet = gameState.botBetThisStreet;
    const toCall = gameState.streetBet - myBet;
    const potSize = gameState.pot;

    // Pot odds = amount to call / (pot size + amount to call)
    // e.g. Call $2 to win $10 pot -> 2 / 12 = 16.6% equity needed to call
    const potOdds = toCall > 0 ? toCall / (potSize + toCall) : 0;

    if (phase === 'PREFLOP_BETTING') {
        const score = scorePreflopHand(gameState.botHoleCards);
        if (validActions.includes('BET') || validActions.includes('CALL')) {
            if (score >= 7) {
                return validActions.includes('BET') ? 'BET' : 'CALL';
            }
            if (score >= 5) {
                if (validActions.includes('BET')) return rand < (isDealer ? 0.6 : 0.4) ? 'BET' : 'CHECK';
                if (validActions.includes('CALL')) return rand < (potOdds < 0.3 ? 0.8 : 0.5) ? 'CALL' : 'FOLD';
            }
            if (validActions.includes('CHECK')) return 'CHECK';
            return rand < (potOdds < 0.2 ? 0.5 : 0.2) ? 'CALL' : 'FOLD';
        }
        return validActions[0];
    }

    const allCards = [...gameState.botHoleCards, ...gameState.communityCards];
    const result = allCards.length >= 5 ? evaluateHand(allCards) : null;
    const category = result ? Math.floor(result.rank / 1e10) : -1;

    const hasDraw = checkDraw(gameState.botHoleCards, gameState.communityCards);

    if (category >= 2) {
        if (validActions.includes('BET')) return 'BET';
        if (validActions.includes('CALL')) return 'CALL';
        return validActions[0];
    }

    if (category === 1) {
        if (validActions.includes('BET')) return rand < (isDealer ? 0.4 : 0.2) ? 'BET' : 'CHECK';
        if (validActions.includes('CALL')) return rand < (potOdds < 0.35 ? 0.8 : 0.4) ? 'CALL' : 'FOLD';
        return 'CHECK';
    }

    if (hasDraw) {
        if (validActions.includes('CHECK')) return 'CHECK';
        // If pot odds are very good (e.g. facing a min-bet), call the draw. Draw odds are typically ~20-30%
        if (validActions.includes('CALL')) return (potOdds < 0.25 || rand < 0.5) ? 'CALL' : 'FOLD';
    }

    if (validActions.includes('CHECK')) {
        // Bluff more frequently if in position
        const bluffRate = isDealer ? 0.25 : 0.10;
        return rand < bluffRate ? 'BET' : 'CHECK';
    }

    if (validActions.includes('FOLD')) {
        // Bluff-raise incredibly rarely, mostly fold
        return rand < 0.05 ? 'CALL' : 'FOLD';
    }

    return validActions[0];
}

export function botPick2(cards4) {
    const pairs = getCombinations(cards4, 2);
    let bestPair = pairs[0];
    let bestScore = -1;

    for (const pair of pairs) {
        const score = scorePreflopHand(pair);
        if (score > bestScore) { bestScore = score; bestPair = pair; }
    }
    return bestPair;
}
