// app.js
'use strict';

import { gameState } from './state.js';
import { rebuildLocalDeck } from './api.js';
import { renderGameState, closeHandModal, toggleEventLog, confirmRedraw, confirmRedrawCard } from './ui.js';
import { startNewMatch, resetForNewMatch, handlePlayerAction, startBettingRound } from './engine.js';

// Bind globally to support legacy inline onclick= functions from HTML.
window.startNewMatch = startNewMatch;
window.resetForNewMatch = resetForNewMatch;
window.handlePlayerAction = handlePlayerAction;
window.closeHandModal = closeHandModal;
window.toggleEventLog = toggleEventLog;
window.confirmRedraw = confirmRedraw;
window.confirmRedrawCard = confirmRedrawCard;

renderGameState();
rebuildLocalDeck();
