// engine.js
'use strict';

import { gameState, r2, approxEq, delay } from './state.js';
import { getNewDeck, rebuildLocalDeck, drawCards } from './api.js';
import { evaluateHand, cardShortName } from './evaluator.js';
import { botChooseAction, botRedrawDecision } from './bot.js';
import {
    renderGameState, hideLobby, hideAllModals, logEvent,
    showRedrawUI, getValidActions, showActionButtons, hideActionButtons,
    showHandEndModal, cardElement
} from './ui.js';

export async function startNewMatch() {
    Object.assign(gameState, {
        phase: 'LOBBY',
        playerPoints: 0,
        botPoints: 0,
        handNumber: 0,
        playerStack: 10,
        botStack: 10,
        pot: 0,
        communityCards: [],
        playerHoleCards: [],
        botHoleCards: [],
        dealerIsPlayer: Math.random() < 0.5,
        matchOver: false,
        lastHandResult: null,
    });

    document.getElementById('event-log').innerHTML = '';

    hideLobby();
    hideAllModals();
    renderGameState();

    logEvent('🃏 New match started!');
    await getNewDeck();
    rebuildLocalDeck();
    await startHand();
}

export async function resetForNewMatch() {
    document.getElementById('match-over-modal').classList.add('hidden');
    await startNewMatch();
}

export async function startHand() {
    gameState.handNumber++;
    gameState.phase = 'HAND_INIT';
    gameState.communityCards = [];
    gameState.playerHoleCards = [];
    gameState.botHoleCards = [];
    gameState.pot = 0;
    gameState.playerBetThisStreet = 0;
    gameState.botBetThisStreet = 0;
    gameState.streetBet = 0;
    gameState.actionCount = 0;
    gameState.playerFolded = false;
    gameState.botFolded = false;

    logEvent(`── Hand #${gameState.handNumber} ──`, 'log-hand');

    renderGameState();
    await delay(200);

    const { sb, bb } = gameState;
    const sbPlayer = gameState.dealerIsPlayer ? 'player' : 'bot';
    const bbPlayer = gameState.dealerIsPlayer ? 'bot' : 'player';

    postBlind(sbPlayer, sb);
    postBlind(bbPlayer, bb);
    gameState.streetBet = bb;

    renderGameState();

    gameState.uiDealing = true;
    const drawnCards = await drawCards(4);
    gameState.playerHoleCards = drawnCards.slice(0, 2);
    gameState.botHoleCards = drawnCards.slice(2, 4);

    const pContainer = document.getElementById('player-cards');
    const bContainer = document.getElementById('bot-cards');
    pContainer.innerHTML = '';
    bContainer.innerHTML = '';

    const p1 = cardElement(gameState.playerHoleCards[0], '', false, false); pContainer.appendChild(p1);
    await delay(150);
    const p2 = cardElement(gameState.playerHoleCards[1], '', false, false); pContainer.appendChild(p2);
    await delay(150);

    // Use card back styling for bot cards during deal
    const botCardBackHTML = '<div class="card-back-side" style="position:relative;width:100%;height:100%;border-radius:var(--card-radius);"></div>';

    const b1Outer = document.createElement('div'); b1Outer.className = 'card-container'; b1Outer.innerHTML = botCardBackHTML; bContainer.appendChild(b1Outer);
    await delay(150);
    const b2Outer = document.createElement('div'); b2Outer.className = 'card-container'; b2Outer.innerHTML = botCardBackHTML; bContainer.appendChild(b2Outer);
    await delay(150);

    p1.reveal();
    await delay(150);
    p2.reveal();
    await delay(300);

    gameState.uiDealing = false;
    renderGameState();

    gameState.phase = 'REDRAW';
    logEvent('— Redraw Phase —');
    showRedrawUI();
}

function postBlind(who, amount) {
    const actual = Math.min(amount, who === 'player' ? gameState.playerStack : gameState.botStack);
    if (who === 'player') {
        gameState.playerStack = r2(gameState.playerStack - actual);
        gameState.playerBetThisStreet = r2(gameState.playerBetThisStreet + actual);
    } else {
        gameState.botStack = r2(gameState.botStack - actual);
        gameState.botBetThisStreet = r2(gameState.botBetThisStreet + actual);
    }
    gameState.pot = r2(gameState.pot + actual);
}

function getBetAmount() {
    const bb = gameState.bb;
    if (gameState.phase === 'TURN_BETTING' || gameState.phase === 'RIVER_BETTING') return r2(bb * 2);
    return bb;
}

export async function startBettingRound(phase) {
    gameState.phase = phase;
    gameState.actionCount = 0;
    gameState.streetBet = 0;
    gameState.playerBetThisStreet = 0;
    gameState.botBetThisStreet = 0;

    if (phase === 'PREFLOP_BETTING') {
        const sb = gameState.sb, bb = gameState.bb;
        if (gameState.dealerIsPlayer) {
            gameState.playerBetThisStreet = sb;
            gameState.botBetThisStreet = bb;
        } else {
            gameState.botBetThisStreet = sb;
            gameState.playerBetThisStreet = bb;
        }
        gameState.streetBet = bb;
        gameState.currentActor = gameState.dealerIsPlayer ? 'player' : 'bot';
    } else {
        gameState.currentActor = gameState.dealerIsPlayer ? 'bot' : 'player';
    }

    renderGameState();
    await nextActorActs();
}

async function nextActorActs() {
    if (gameState.currentActor === 'player') {
        showActionButtons();
    } else {
        hideActionButtons();
        // Use delay from state
        const { BOT_MIN_DELAY, BOT_MAX_DELAY } = await import('./state.js');
        await delay(BOT_MIN_DELAY + Math.random() * (BOT_MAX_DELAY - BOT_MIN_DELAY));
        const validActions = getValidActions('bot');
        const action = botChooseAction(validActions, gameState.phase);
        await handleAction(action, 'bot');
    }
}

export async function handlePlayerAction(action) {
    if (gameState.currentActor !== 'player') return;
    if (gameState.phase.indexOf('BETTING') === -1) return;

    const valid = getValidActions('player');
    if (!valid.includes(action)) return;

    hideActionButtons();
    await handleAction(action, 'player');
}

async function handleAction(action, who) {
    const isPlayer = (who === 'player');
    const name = isPlayer ? 'You' : 'Bot';

    if (action === 'FOLD') {
        if (isPlayer) gameState.playerFolded = true;
        else gameState.botFolded = true;
        logEvent(`${name}: FOLD`);
        await endHandByFold(who);
        return;
    }

    if (action === 'CHECK') {
        logEvent(`${name}: CHECK`);
        gameState.actionCount++;
    }

    if (action === 'BET') {
        const betAmt = getBetAmount();
        const stack = isPlayer ? gameState.playerStack : gameState.botStack;
        const actual = Math.min(betAmt, stack);
        if (isPlayer) {
            gameState.playerStack = r2(gameState.playerStack - actual);
            gameState.playerBetThisStreet = r2(gameState.playerBetThisStreet + actual);
        } else {
            gameState.botStack = r2(gameState.botStack - actual);
            gameState.botBetThisStreet = r2(gameState.botBetThisStreet + actual);
        }
        gameState.streetBet = r2(Math.max(gameState.playerBetThisStreet, gameState.botBetThisStreet));
        gameState.pot = r2(gameState.pot + actual);
        logEvent(`${name}: BET $${actual.toFixed(2)}`);
        gameState.actionCount++;
        gameState.currentActor = isPlayer ? 'bot' : 'player';
        renderGameState();
        await nextActorActs();
        return;
    }

    if (action === 'CALL') {
        const myBet = isPlayer ? gameState.playerBetThisStreet : gameState.botBetThisStreet;
        const toCall = r2(gameState.streetBet - myBet);
        const stack = isPlayer ? gameState.playerStack : gameState.botStack;
        const actual = Math.min(toCall, stack);
        if (isPlayer) {
            gameState.playerStack = r2(gameState.playerStack - actual);
            gameState.playerBetThisStreet = r2(gameState.playerBetThisStreet + actual);
        } else {
            gameState.botStack = r2(gameState.botStack - actual);
            gameState.botBetThisStreet = r2(gameState.botBetThisStreet + actual);
        }
        gameState.pot = r2(gameState.pot + actual);
        logEvent(`${name}: CALL $${actual.toFixed(2)}`);
        gameState.actionCount++;
        renderGameState();
        await advanceToNextStreet();
        return;
    }

    if (gameState.actionCount >= 2 &&
        approxEq(gameState.playerBetThisStreet, gameState.botBetThisStreet)) {
        renderGameState();
        await advanceToNextStreet();
        return;
    }
    gameState.currentActor = isPlayer ? 'bot' : 'player';
    renderGameState();
    await nextActorActs();
}

async function advanceToNextStreet() {
    switch (gameState.phase) {
        case 'PREFLOP_BETTING': await dealCommunity(3, 'DEAL_FLOP', 'FLOP_BETTING', 'Flop'); break;
        case 'FLOP_BETTING': await dealCommunity(1, 'DEAL_TURN', 'TURN_BETTING', 'Turn'); break;
        case 'TURN_BETTING': await dealCommunity(1, 'DEAL_RIVER', 'RIVER_BETTING', 'River'); break;
        case 'RIVER_BETTING': await runShowdown(); break;
        default: break;
    }
}

async function dealCommunity(n, dealPhase, bettingPhase, streetName) {
    gameState.phase = dealPhase;
    renderGameState();
    await delay(200);

    gameState.uiDealing = true;
    const cards = await drawCards(n);
    const oldLen = gameState.communityCards.length;
    gameState.communityCards.push(...cards);

    const names = cards.map(cardShortName).join(' ');
    logEvent(`${streetName}: ${names}`);

    let revealDelay = 200;
    if (n === 1 && oldLen === 3) revealDelay = 350; // Turn
    if (n === 1 && oldLen === 4) revealDelay = 500; // River

    for (let i = 0; i < n; i++) {
        const slot = document.getElementById(`comm-${oldLen + i}`);
        slot.className = '';
        slot.innerHTML = '';
        const cEl = cardElement(cards[i], '', false, false);
        slot.appendChild(cEl);

        await delay(50);
        cEl.reveal();
        await delay(revealDelay);
    }

    gameState.uiDealing = false;
    renderGameState();
    await delay(200);
    await startBettingRound(bettingPhase);
}

async function endHandByFold(folder) {
    hideActionButtons();

    const winnerIsPlayer = (folder === 'bot');
    const potWon = gameState.pot;

    if (winnerIsPlayer) {
        gameState.playerStack = r2(gameState.playerStack + potWon);
    } else {
        gameState.botStack = r2(gameState.botStack + potWon);
    }

    const outcome = winnerIsPlayer ? 'win' : 'lose';
    logEvent(winnerIsPlayer ? `You win $${potWon.toFixed(2)} (bot folded)` : `Bot wins $${potWon.toFixed(2)} (you folded)`, winnerIsPlayer ? 'log-win' : 'log-lose');

    renderGameState();
    const potDisplay = document.getElementById('pot-display');
    const animClass = winnerIsPlayer ? 'pot-win-player' : 'pot-win-bot';
    potDisplay.classList.add(animClass);
    await delay(700);
    potDisplay.classList.remove(animClass);
    await delay(300);

    await endHand(outcome, potWon, '(fold)', '(fold)');
}

async function runShowdown() {
    gameState.phase = 'SHOWDOWN';
    renderGameState();
    await delay(400);

    const playerCards = [...gameState.playerHoleCards, ...gameState.communityCards];
    const botCards = [...gameState.botHoleCards, ...gameState.communityCards];

    const playerResult = evaluateHand(playerCards);
    const botResult = evaluateHand(botCards);

    logEvent(`You: ${playerResult.name}  |  Bot: ${botResult.name}`);

    let outcome, potChange;
    let winningCards = [];
    if (playerResult.rank > botResult.rank) {
        outcome = 'win';
        potChange = gameState.pot;
        gameState.playerStack = r2(gameState.playerStack + gameState.pot);
        winningCards = playerResult.cards;
        logEvent(`🏆 You win! ${playerResult.name} beats ${botResult.name}`, 'log-win');
    } else if (botResult.rank > playerResult.rank) {
        outcome = 'lose';
        potChange = -gameState.pot;
        gameState.botStack = r2(gameState.botStack + gameState.pot);
        winningCards = botResult.cards;
        logEvent(`Bot wins. ${botResult.name} beats ${playerResult.name}`, 'log-lose');
    } else {
        outcome = 'tie';
        potChange = 0;
        const half = r2(gameState.pot / 2);
        gameState.playerStack = r2(gameState.playerStack + half);
        gameState.botStack = r2(gameState.botStack + half);
        logEvent(`🤝 Tie. Both have ${playerResult.name}`);
    }

    renderGameState();

    if (winningCards && winningCards.length > 0) {
        const winningNames = winningCards.map(c => cardShortName(c));
        document.querySelectorAll('.card-container').forEach(el => {
            const img = el.querySelector('img');
            if (img && winningNames.includes(img.alt)) {
                el.classList.add('winning-card');
            }
        });

        const potDisplay = document.getElementById('pot-display');
        const animClass = outcome === 'win' ? 'pot-win-player' : 'pot-win-bot';
        potDisplay.classList.add(animClass);
        await delay(700);
        potDisplay.classList.remove(animClass);
        await delay(1000);
    } else {
        await delay(1500);
    }

    await endHand(outcome, potChange, playerResult.name, botResult.name);
}

async function endHand(outcome, potChange, playerHandName, botHandName) {
    gameState.phase = 'HAND_END';
    gameState.lastHandResult = outcome;

    let playerPts = 0, botPts = 0;
    if (outcome === 'win') { gameState.playerPoints = r2(gameState.playerPoints + 1); playerPts = 1; }
    else if (outcome === 'lose') { gameState.botPoints = r2(gameState.botPoints + 1); botPts = 1; }
    else {
        gameState.playerPoints = r2(gameState.playerPoints + 0.5);
        gameState.botPoints = r2(gameState.botPoints + 0.5);
        playerPts = botPts = 0.5;
    }

    if (gameState.playerStack <= 0) { gameState.playerStack = 10; logEvent('You rebought to $10.00'); }
    if (gameState.botStack <= 0) { gameState.botStack = 10; logEvent('Bot rebought to $10.00'); }

    gameState.dealerIsPlayer = !gameState.dealerIsPlayer;

    renderGameState();

    const playerScores = document.getElementById('player-points');
    const botScores = document.getElementById('bot-points');
    if (outcome === 'win' || outcome === 'tie') playerScores.classList.add('score-pulse');
    if (outcome === 'lose' || outcome === 'tie') botScores.classList.add('score-pulse');
    setTimeout(() => {
        playerScores.classList.remove('score-pulse');
        botScores.classList.remove('score-pulse');
    }, 700);

    const matchOver = gameState.playerPoints >= gameState.matchPointsNeeded ||
        gameState.botPoints >= gameState.matchPointsNeeded;

    const ptsText = outcome === 'tie'
        ? 'Each player +0.5 match pt'
        : `${outcome === 'win' ? 'You' : 'Bot'} +1 match pt`;

    await showHandEndModal({
        outcome,
        playerHandName,
        botHandName,
        potChange,
        ptsText,
        matchOver,
    });
}

export async function handleRedrawPhase(playerSwapIndex) {
    if (playerSwapIndex !== -1) {
        logEvent('You swapped a card.');
        const newCard = await drawCards(1);
        gameState.playerHoleCards[playerSwapIndex] = newCard[0];
    } else {
        logEvent('You kept your hand.');
    }

    renderGameState();
    await delay(300);

    const botSwapIndex = botRedrawDecision();
    if (botSwapIndex !== -1) {
        logEvent('Opponent swapped a card.');
        const newCard = await drawCards(1);
        gameState.botHoleCards[botSwapIndex] = newCard[0];
    } else {
        logEvent('Opponent kept their hand.');
    }

    renderGameState();
    await delay(600);

    await startBettingRound('PREFLOP_BETTING');
}
