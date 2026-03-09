// bot.js
'use strict';

import { gameState } from './state.js';
import { scorePreflopHand, evaluateHand, checkDraw, getCombinations } from './evaluator.js';

export function botChooseAction(validActions, phase) {
    const rand = Math.random();

    if (validActions.includes('BET') && rand < 0.3) return 'BET';
    if (validActions.includes('CALL') && rand < 0.8) return 'CALL';
    if (validActions.includes('CHECK') && rand < 0.8) return 'CHECK';
    if (validActions.includes('FOLD') && rand < 0.2) return 'FOLD';

    return validActions[0];
}

export function botRedrawDecision() {
    const rand = Math.random();
    if (rand < 0.4) return -1;  // Keep
    if (rand < 0.7) return 0;   // Swap first card
    return 1;                   // Swap second card
}
