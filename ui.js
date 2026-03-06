// ui.js
'use strict';

import { gameState, r2, approxEq } from './state.js';
import { cardShortName } from './evaluator.js';
import { startHand, startBettingRound } from './engine.js';

export function cardElement(card, extraClass = '') {
    const wrap = document.createElement('div');
    wrap.className = `card-img-wrap${extraClass ? ' ' + extraClass : ''}`;
    const img = document.createElement('img');
    img.src = card.image;
    img.alt = cardShortName(card);
    img.loading = 'lazy';
    img.onerror = () => { wrap.textContent = cardShortName(card); wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1rem;'; };
    wrap.appendChild(img);
    return wrap;
}

export function setLoading(on) {
    gameState.apiLoading = on;
    document.getElementById('loading-spinner').classList.toggle('hidden', !on);
    document.querySelectorAll('.action-btn').forEach(b => { b.disabled = on; });
}

export function showApiWarning() { document.getElementById('api-warning').classList.remove('hidden'); }
export function hideApiWarning() { document.getElementById('api-warning').classList.add('hidden'); }

export function showActionButtons() { document.getElementById('action-buttons').classList.remove('hidden'); }
export function hideActionButtons() { document.getElementById('action-buttons').classList.add('hidden'); }
export function hideLobby() { document.getElementById('lobby-area').classList.add('hidden'); }

export function showPick2UI(cards4, onConfirmCb) {
    gameState.pick2Selected = [];
    const container = document.getElementById('pick2-cards');
    container.innerHTML = '';

    cards4.forEach((card, i) => {
        const el = document.createElement('div');
        el.className = 'pick2-card';
        const img = document.createElement('img');
        img.src = card.image;
        img.alt = cardShortName(card);
        img.onerror = () => { el.textContent = cardShortName(card); };
        el.appendChild(img);
        el.addEventListener('click', () => pick2CardClick(i));
        el.dataset.index = i;
        container.appendChild(el);
    });

    updatePick2Count();
    document.getElementById('pick2-overlay').classList.remove('hidden');
    document.getElementById('lobby-area').classList.add('hidden');
}

export function pick2CardClick(idx) {
    const sel = gameState.pick2Selected;
    const pos = sel.indexOf(idx);
    if (pos === -1) {
        if (sel.length < 2) sel.push(idx);
    } else {
        sel.splice(pos, 1);
    }
    document.querySelectorAll('.pick2-card').forEach((el, i) => {
        el.classList.toggle('selected', sel.includes(i));
    });
    updatePick2Count();
    document.getElementById('btn-pick2-confirm').disabled = sel.length !== 2;
}

export function confirmPick2() {
    if (gameState.pick2Selected.length !== 2) return;
    const cards4 = gameState.playerPickCards;
    gameState.playerHoleCards = gameState.pick2Selected.map(i => cards4[i]);

    document.querySelectorAll('.pick2-card').forEach((el, i) => {
        if (!gameState.pick2Selected.includes(i)) el.classList.add('discarded');
    });

    setTimeout(async () => {
        document.getElementById('pick2-overlay').classList.add('hidden');
        renderGameState();
        await startBettingRound('PREFLOP_BETTING');
    }, 350);
}

function updatePick2Count() {
    const n = gameState.pick2Selected.length;
    document.getElementById('pick2-count').textContent = `Select 2 cards (${n} / 2 selected)`;
}

export async function showHandEndModal({ outcome, playerHandName, botHandName, potChange, ptsText, matchOver }) {
    const modal = document.getElementById('hand-end-modal');
    const outcomeEl = document.getElementById('modal-outcome');

    const label = outcome === 'win' ? '🏆 You Win!' : outcome === 'lose' ? '💀 You Lose' : '🤝 Tie';
    outcomeEl.textContent = label;
    outcomeEl.className = `modal-outcome ${outcome}`;

    document.getElementById('modal-player-hand').textContent = playerHandName;
    document.getElementById('modal-bot-hand').textContent = botHandName;

    const chipSign = potChange > 0 ? '+' : '';
    document.getElementById('modal-pot-change').innerHTML =
        `Chips: <strong>${chipSign}$${Math.abs(potChange).toFixed(2)}</strong>`;
    document.getElementById('modal-points-change').innerHTML =
        `Match: <strong>${ptsText}</strong>`;

    modal.classList.remove('hidden');
    modal.dataset.matchOver = matchOver ? '1' : '0';
}

export function closeHandModal() {
    const modal = document.getElementById('hand-end-modal');
    const matchOver = modal.dataset.matchOver === '1';
    modal.classList.add('hidden');

    if (matchOver) {
        showMatchOverModal();
    } else {
        startHand();
    }
}

export function hideAllModals() {
    document.getElementById('hand-end-modal').classList.add('hidden');
    document.getElementById('match-over-modal').classList.add('hidden');
}

export function showMatchOverModal() {
    const modal = document.getElementById('match-over-modal');
    const outcomeEl = document.getElementById('match-outcome');
    const summaryEl = document.getElementById('match-summary');

    if (gameState.playerPoints >= gameState.matchPointsNeeded) {
        outcomeEl.textContent = '🏆 Match Winner!';
        outcomeEl.className = 'modal-outcome win';
        summaryEl.textContent = `You defeated the Bot ${gameState.playerPoints} to ${gameState.botPoints}.`;
    } else {
        outcomeEl.textContent = '💀 Match Lost';
        outcomeEl.className = 'modal-outcome lose';
        summaryEl.textContent = `The Bot defeated you ${gameState.botPoints} to ${gameState.playerPoints}.`;
    }

    modal.classList.remove('hidden');
}

export function logEvent(text, cssClass = '') {
    const log = document.getElementById('event-log');
    const entry = document.createElement('div');
    entry.className = `log-entry${cssClass ? ' ' + cssClass : ''}`;
    entry.textContent = text;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

export function toggleEventLog() {
    const log = document.getElementById('event-log');
    const toggle = document.getElementById('event-log-toggle');
    const open = log.classList.toggle('open');
    toggle.classList.toggle('expanded', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.textContent = (open ? '▲' : '▼') + ' Event Log';
    if (open) log.scrollTop = log.scrollHeight;
}

// Reused UI renderers
export function renderGameState() {
    updateScoreDisplay();
    updateStackDisplays();
    updatePotDisplay();
    updateCardDisplays();
    updateActionButtons();
    updateStreetLabel();
    updateDealerChips();
    updateBetChips();
    updateHandNumber();
}

function updateScoreDisplay() {
    const fmt = n => (n % 1 === 0 ? String(n) : n.toFixed(1));
    document.getElementById('player-points').textContent = fmt(gameState.playerPoints);
    document.getElementById('bot-points').textContent = fmt(gameState.botPoints);
}

function updateStackDisplays() {
    document.getElementById('player-stack').textContent = gameState.playerStack.toFixed(2);
    document.getElementById('bot-stack').textContent = gameState.botStack.toFixed(2);
}

function updatePotDisplay() {
    document.getElementById('pot-display').textContent = `Pot: $${gameState.pot.toFixed(2)}`;
}

function updateHandNumber() {
    document.getElementById('hand-number').textContent =
        gameState.handNumber ? `Hand #${gameState.handNumber}` : 'Hand #0';
}

function updateDealerChips() {
    const pc = document.getElementById('player-dealer-chip');
    const bc = document.getElementById('bot-dealer-chip');
    pc.classList.toggle('visible', gameState.dealerIsPlayer && gameState.phase !== 'LOBBY');
    bc.classList.toggle('visible', !gameState.dealerIsPlayer && gameState.phase !== 'LOBBY');
}

function updateBetChips() {
    const pc = document.getElementById('player-bet-chip');
    const bc = document.getElementById('bot-bet-chip');
    const pBet = gameState.playerBetThisStreet;
    const bBet = gameState.botBetThisStreet;
    const inGame = gameState.phase !== 'LOBBY' && gameState.phase !== 'HAND_END';

    if (inGame && pBet > 0) {
        pc.textContent = `$${pBet.toFixed(2)}`;
        pc.classList.remove('hidden');
    } else { pc.classList.add('hidden'); }

    if (inGame && bBet > 0) {
        bc.textContent = `$${bBet.toFixed(2)}`;
        bc.classList.remove('hidden');
    } else { bc.classList.add('hidden'); }
}

function updateCardDisplays() {
    const botCardArea = document.getElementById('bot-cards');
    if (gameState.phase === 'SHOWDOWN' || gameState.phase === 'HAND_END') {
        botCardArea.innerHTML = '';
        for (const card of gameState.botHoleCards) {
            botCardArea.appendChild(cardElement(card));
        }
        if (!gameState.botHoleCards.length) {
            for (let i = 0; i < 2; i++) {
                const b = document.createElement('div'); b.className = 'card-back';
                botCardArea.appendChild(b);
            }
        }
    } else if (gameState.phase === 'LOBBY') {
        botCardArea.innerHTML = '<div class="card-back"></div><div class="card-back"></div>';
    } else if (gameState.botHoleCards.length > 0) {
        botCardArea.innerHTML = '';
        for (let i = 0; i < gameState.botHoleCards.length; i++) {
            const b = document.createElement('div'); b.className = 'card-back';
            botCardArea.appendChild(b);
        }
    }

    const playerCardArea = document.getElementById('player-cards');
    playerCardArea.innerHTML = '';
    if (gameState.playerHoleCards.length > 0) {
        for (const card of gameState.playerHoleCards) {
            playerCardArea.appendChild(cardElement(card));
        }
    } else {
        for (let i = 0; i < 2; i++) {
            const s = document.createElement('div'); s.className = 'card-slot';
            playerCardArea.appendChild(s);
        }
    }

    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`comm-${i}`);
        slot.innerHTML = '';
        if (gameState.communityCards[i]) {
            slot.className = '';
            slot.appendChild(cardElement(gameState.communityCards[i]));
        } else {
            slot.className = 'card-slot';
        }
    }

    const pZone = document.getElementById('player-zone');
    pZone.classList.remove('winner', 'loser');
    if (gameState.phase === 'HAND_END' || gameState.phase === 'SHOWDOWN') {
        if (gameState.lastHandResult === 'win') pZone.classList.add('winner');
        if (gameState.lastHandResult === 'lose') pZone.classList.add('loser');
    }
}

export function getValidActions(who) {
    const myBet = who === 'player' ? gameState.playerBetThisStreet : gameState.botBetThisStreet;
    if (!approxEq(gameState.streetBet, myBet) && gameState.streetBet > myBet) {
        return ['CALL', 'FOLD'];
    }
    return ['CHECK', 'BET'];
}

function updateActionButtons() {
    const container = document.getElementById('action-buttons');
    const lobby = document.getElementById('lobby-area');

    if (gameState.phase === 'LOBBY') {
        container.classList.add('hidden');
        lobby.classList.remove('hidden');
        return;
    }
    if (gameState.phase === 'HAND_END' || gameState.phase === 'SHOWDOWN') {
        container.classList.add('hidden');
        lobby.classList.add('hidden');
        return;
    }
    lobby.classList.add('hidden');

    if (gameState.phase.indexOf('BETTING') === -1 ||
        gameState.currentActor !== 'player') {
        container.classList.add('hidden');
        return;
    }

    const valid = getValidActions('player');
    container.classList.remove('hidden');

    document.getElementById('btn-check').style.display = valid.includes('CHECK') ? '' : 'none';
    document.getElementById('btn-bet').style.display = valid.includes('BET') ? '' : 'none';
    document.getElementById('btn-call').style.display = valid.includes('CALL') ? '' : 'none';
    document.getElementById('btn-fold').style.display = valid.includes('FOLD') ? '' : 'none';

    const bb = gameState.bb;
    const betAmt = (gameState.phase === 'TURN_BETTING' || gameState.phase === 'RIVER_BETTING') ? r2(bb * 2) : bb;
    document.getElementById('bet-amount-label').textContent = `$${betAmt.toFixed(2)}`;

    const toCall = r2(gameState.streetBet - gameState.playerBetThisStreet);
    document.getElementById('call-amount-label').textContent = `$${Math.max(0, toCall).toFixed(2)}`;
}

function updateStreetLabel() {
    const lbl = document.getElementById('street-label');
    const labels = {
        LOBBY: '— Waiting to Start —',
        HAND_INIT: '● Dealing…',
        PREFLOP_BETTING: '● Pre-Flop',
        DEAL_FLOP: '● Dealing Flop…',
        FLOP_BETTING: '● Flop',
        DEAL_TURN: '● Dealing Turn…',
        TURN_BETTING: '● Turn',
        DEAL_RIVER: '● Dealing River…',
        RIVER_BETTING: '● River',
        SHOWDOWN: '★ Showdown',
        HAND_END: '—',
    };
    lbl.textContent = labels[gameState.phase] || gameState.phase;
}
