// engine.js
'use strict';

import { gameState, r2, approxEq, delay } from './state.js';
import { getNewDeck, rebuildLocalDeck, drawCards } from './api.js';
import { evaluateHand, cardShortName } from './evaluator.js';
import { botChooseAction, botPick2 } from './bot.js';
import {
    renderGameState, hideLobby, hideAllModals, logEvent,
    showPick2UI, getValidActions, showActionButtons, hideActionButtons,
    showHandEndModal
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
        playerPickCards: [],
        botPickCards: [],
        dealerIsPlayer: Math.random() < 0.5,
        matchOver: false,
        lastHandResult: null,
    });

    applyVariantFromUI();
    applyMatchLengthFromUI();

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
    gameState.playerPickCards = [];
    gameState.botPickCards = [];
    gameState.pot = 0;
    gameState.playerBetThisStreet = 0;
    gameState.botBetThisStreet = 0;
    gameState.streetBet = 0;
    gameState.actionCount = 0;
    gameState.playerFolded = false;
    gameState.botFolded = false;
    gameState.pick2Selected = [];

    logEvent(`── Hand #${gameState.handNumber} ──`, 'log-hand');

    renderGameState();
    await delay(200);

    const { sb, bb } = gameState;
    const sbPlayer = gameState.dealerIsPlayer ? 'player' : 'bot';
    const bbPlayer = gameState.dealerIsPlayer ? 'bot' : 'player';

    postBlind(sbPlayer, sb);
    postBlind(bbPlayer, bb);
    gameState.streetBet = bb;

    logEvent(`Blinds posted — SB $${sb.toFixed(2)} / BB $${bb.toFixed(2)}`);
    renderGameState();

    const holeCount = gameState.variant === 'PICK2' ? 4 : 2;
    const drawnCards = await drawCards(holeCount * 2);

    if (gameState.variant === 'PICK2') {
        gameState.playerPickCards = drawnCards.slice(0, 4);
        gameState.botPickCards = drawnCards.slice(4, 8);
        gameState.botHoleCards = botPick2(gameState.botPickCards);
        showPick2UI(gameState.playerPickCards);
    } else {
        gameState.playerHoleCards = drawnCards.slice(0, 2);
        gameState.botHoleCards = drawnCards.slice(2, 4);
        renderGameState();
        await startBettingRound('PREFLOP_BETTING');
    }
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
    await delay(300);

    const cards = await drawCards(n);
    gameState.communityCards.push(...cards);

    const names = cards.map(cardShortName).join(' ');
    logEvent(`${streetName}: ${names}`, 'log-flop');
    logEvent(`— ${streetName} —`);

    renderGameState();
    await delay(400);
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
    if (playerResult.rank > botResult.rank) {
        outcome = 'win';
        potChange = gameState.pot;
        gameState.playerStack = r2(gameState.playerStack + gameState.pot);
        logEvent(`🏆 You win $${gameState.pot.toFixed(2)}!`, 'log-win');
    } else if (botResult.rank > playerResult.rank) {
        outcome = 'lose';
        potChange = -gameState.pot;
        gameState.botStack = r2(gameState.botStack + gameState.pot);
        logEvent(`Bot wins $${gameState.pot.toFixed(2)}.`, 'log-lose');
    } else {
        outcome = 'tie';
        potChange = 0;
        const half = r2(gameState.pot / 2);
        gameState.playerStack = r2(gameState.playerStack + half);
        gameState.botStack = r2(gameState.botStack + half);
        logEvent('🤝 Split pot.');
    }

    renderGameState();
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

function applyVariantFromUI() {
    const normal = document.getElementById('variant-normal');
    const pick2 = document.getElementById('variant-pick2');
    if (normal.classList.contains('active')) {
        gameState.variant = 'NORMAL';
    } else {
        gameState.variant = 'PICK2';
    }
}

function applyMatchLengthFromUI() {
    const bo3 = document.getElementById('match-bo3');
    if (bo3.classList.contains('active')) {
        gameState.matchLength = 'BO3';
        gameState.matchPointsNeeded = 2;
    } else {
        gameState.matchLength = 'BO5';
        gameState.matchPointsNeeded = 3;
    }
}
