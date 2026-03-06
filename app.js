// app.js
'use strict';

import { gameState } from './state.js';
import { rebuildLocalDeck } from './api.js';
import { renderGameState, closeHandModal, toggleEventLog, confirmPick2 } from './ui.js';
import { startNewMatch, resetForNewMatch, handlePlayerAction, startBettingRound } from './engine.js';

// Bind globally to support legacy inline onclick= functions from HTML.
window.startNewMatch = startNewMatch;
window.resetForNewMatch = resetForNewMatch;
window.handlePlayerAction = handlePlayerAction;
window.closeHandModal = closeHandModal;
window.toggleEventLog = toggleEventLog;
window.confirmPick2 = confirmPick2;

// Handling toggle functions
window.handleVariantToggle = function (e) {
  if (gameState.phase !== 'LOBBY') return;
  const btn = e.currentTarget;
  document.querySelectorAll('#variant-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.handleMatchLengthToggle = function (e) {
  if (gameState.phase !== 'LOBBY') return;
  const btn = e.currentTarget;
  document.querySelectorAll('#match-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

document.querySelectorAll('#variant-toggle .toggle-btn').forEach(btn => {
  btn.addEventListener('click', window.handleVariantToggle);
});
document.querySelectorAll('#match-toggle .toggle-btn').forEach(btn => {
  btn.addEventListener('click', window.handleMatchLengthToggle);
});

renderGameState();
rebuildLocalDeck();
