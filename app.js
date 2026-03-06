/* ============================================================
   app.js — ♠ Poker Duel  (vanilla JS, no frameworks)
   Deck of Cards API: https://deckofcardsapi.com/api/deck/
   ============================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────
const API_BASE    = 'https://deckofcardsapi.com/api/deck';
const API_RETRY   = 3;       // max retries on failure
const API_RETRY_DELAY = 1000; // ms between retries
const MIN_CARDS   = 20;      // reshuffle if fewer remain
const TIMER_SECS  = 10;      // decision timer seconds
const BOT_MIN_DELAY = 500;   // ms bot "thinking" delay
const BOT_MAX_DELAY = 900;

// ── Round to 2 decimal places (avoids float drift) ──────────
const r2 = x => Math.round(x * 100) / 100;
const approxEq = (a, b) => Math.abs(a - b) < 0.005;

// ── Game State ───────────────────────────────────────────────
const gameState = {
  phase:             'LOBBY',
  variant:           'NORMAL',   // 'NORMAL' | 'PICK2'
  matchLength:       'BO3',      // 'BO3' | 'BO5'
  matchPointsNeeded: 2,
  playerPoints:      0,
  botPoints:         0,
  handNumber:        0,
  deckId:            null,
  remainingCards:    0,
  playerStack:       10,
  botStack:          10,
  pot:               0,
  playerBetThisStreet: 0,
  botBetThisStreet:    0,
  streetBet:         0,          // highest bet placed on this street
  playerHoleCards:   [],
  botHoleCards:      [],
  playerPickCards:   [],         // 4 cards shown in PICK2
  botPickCards:      [],
  communityCards:    [],
  dealerIsPlayer:    true,       // true = player has the dealer button
  sb:                0.10,
  bb:                0.20,
  currentActor:      'player',   // 'player' | 'bot'
  actionCount:       0,          // actions taken this street
  timerActive:       false,
  timerInterval:     null,
  timerSeconds:      TIMER_SECS,
  matchOver:         false,
  lastHandResult:    null,       // 'win' | 'lose' | 'tie'
  pick2Selected:     [],         // indices selected in Pick-2 UI
  apiLoading:        false,
  playerFolded:      false,
  botFolded:         false,
};

// ================================================================
// API HELPERS
// ================================================================

/** Fetch with automatic retries. Returns parsed JSON or throws. */
async function apiFetch(url, retries = API_RETRY) {
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

/** Create a new shuffled deck; stores deckId + remainingCards. */
async function getNewDeck() {
  setLoading(true);
  try {
    const data = await apiFetch(`${API_BASE}/new/shuffle/?deck_count=1`);
    gameState.deckId          = data.deck_id;
    gameState.remainingCards  = data.remaining;
    hideApiWarning();
  } catch (err) {
    console.warn('getNewDeck failed:', err);
    // Fallback: generate a local virtual deck id so the game keeps working
    gameState.deckId         = null;
    gameState.remainingCards = 52;
    showApiWarning();
  } finally {
    setLoading(false);
  }
}

/** Draw N cards from the API deck (or local fallback). */
async function drawCards(n) {
  // Reshuffle if running low
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
      // Fall through to local fallback
    }
  }

  // Local fallback: generate pseudo-random cards
  return localDrawCards(n);
}

/** Reshuffle the API deck in place. */
async function reshuffleDeck() {
  if (!gameState.deckId) return;
  try {
    const data = await apiFetch(`${API_BASE}/${gameState.deckId}/shuffle/`);
    gameState.remainingCards = data.remaining;
  } catch (err) {
    console.warn('reshuffle failed:', err);
  }
}

// ── Local card fallback (no API) ─────────────────────────────
const LOCAL_SUITS  = ['SPADES','HEARTS','DIAMONDS','CLUBS'];
const LOCAL_VALUES = ['2','3','4','5','6','7','8','9','10','JACK','QUEEN','KING','ACE'];
let _localDeck = [];

function rebuildLocalDeck() {
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
  const v = value === '10' ? '0' : value[0]; // API uses '0' for 10
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

// ================================================================
// CARD UTILITIES
// ================================================================

function cardNumericValue(card) {
  const map = { ACE: 14, KING: 13, QUEEN: 12, JACK: 11, '10': 10 };
  return map[card.value] || parseInt(card.value, 10);
}

function suitSymbol(suit) {
  return { SPADES: '♠', HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣' }[suit] || suit;
}

function suitColor(suit) {
  return (suit === 'HEARTS' || suit === 'DIAMONDS') ? 'red' : 'black';
}

/** Short display like "A♠" or "10♥" */
function cardShortName(card) {
  const vmap = { ACE:'A', KING:'K', QUEEN:'Q', JACK:'J', '10':'10' };
  const v = vmap[card.value] || card.value;
  return `${v}${suitSymbol(card.suit)}`;
}

/** Return an <img>-containing div element for a face-up card. */
function cardElement(card, extraClass = '') {
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

// ================================================================
// HAND EVALUATOR — 7-card Texas Hold'em
// ================================================================

/**
 * Returns all k-element combinations of arr.
 * e.g. getCombinations([1,2,3,4,5,6,7], 5) → 21 arrays
 */
function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst    = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Evaluate a 5-card hand.
 * Returns { rank: Number, name: String, cards: Card[] }
 * rank uses: category(0-8) * 1e10 + tiebreaker (base-15 encoded)
 */
function evaluate5Card(cards5) {
  const vals  = cards5.map(cardNumericValue).sort((a, b) => b - a);
  const suits = cards5.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Straight detection (also A-low: A-2-3-4-5)
  let isStraight     = false;
  let straightHigh   = vals[0];
  const uniqueVals   = [...new Set(vals)];
  if (uniqueVals.length === 5 && vals[0] - vals[4] === 4) {
    isStraight = true;
    straightHigh = vals[0];
  }
  if (!isStraight && vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) {
    isStraight   = true;
    straightHigh = 5;
  }

  // Count occurrences
  const cnt = {};
  for (const v of vals) cnt[v] = (cnt[v] || 0) + 1;
  // Sort groups by count desc, then value desc
  const groups = Object.entries(cnt)
    .map(([v, c]) => ({ v: +v, c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);

  // Tiebreaker helper: encode values in base 15
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
  // High card
  rank = 0; name = 'High Card';
  return { rank: rank * 1e10 + enc(...vals), name, cards: cards5 };
}

/**
 * Best 5-card hand from up to 7 cards.
 * Returns { rank, name, cards }.
 */
function evaluateHand(cards) {
  if (cards.length < 5) {
    // Not enough for a full evaluation — return placeholder
    return { rank: -1, name: '(incomplete)', cards };
  }
  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const res = evaluate5Card(combo);
    if (!best || res.rank > best.rank) best = res;
  }
  return best;
}

// ================================================================
// BOT AI
// ================================================================

/** Score a single hole-card pair for preflop strength (0–10). */
function scorePreflopHand(cards2) {
  const v0 = cardNumericValue(cards2[0]);
  const v1 = cardNumericValue(cards2[1]);
  const hi = Math.max(v0, v1), lo = Math.min(v0, v1);
  const suited = cards2[0].suit === cards2[1].suit;

  if (hi === lo)           return 10; // pair
  if (hi === 14 && lo >= 11) return 9; // AK,AQ,AJ
  if (hi === 13 && lo >= 12) return 8; // KQ, KJ
  if (hi === 14 && lo >= 10) return 7; // AT
  if (suited && hi - lo <= 2) return 6; // suited connectors
  if (hi >= 12 && lo >= 10)   return 5; // broadway
  if (hi >= 11)               return 4; // high card combos
  return Math.max(0, hi + lo - 18);    // low cards
}

/**
 * Choose bot action given valid actions and current game phase.
 * Returns one of the valid actions.
 */
function botChooseAction(validActions, phase) {
  const rand = Math.random();

  if (phase === 'PREFLOP_BETTING') {
    const score = scorePreflopHand(gameState.botHoleCards);
    if (validActions.includes('BET') || validActions.includes('CALL')) {
      // Strong hand: BET/CALL aggressively
      if (score >= 7) {
        return validActions.includes('BET') ? 'BET' : 'CALL';
      }
      // Medium hand: sometimes bet/call
      if (score >= 5) {
        if (validActions.includes('BET'))  return rand < 0.5 ? 'BET'  : 'CHECK';
        if (validActions.includes('CALL')) return rand < 0.65 ? 'CALL' : 'FOLD';
      }
      // Weak hand
      if (validActions.includes('CHECK')) return 'CHECK';
      return rand < 0.35 ? 'CALL' : 'FOLD';
    }
    return validActions[0]; // fallback
  }

  // Post-flop: evaluate current best hand
  const allCards = [...gameState.botHoleCards, ...gameState.communityCards];
  const result   = allCards.length >= 5 ? evaluateHand(allCards) : null;
  const category = result ? Math.floor(result.rank / 1e10) : -1;

  // Check for 4-card flush or open-ended straight draw
  const hasDraw = checkDraw(gameState.botHoleCards, gameState.communityCards);

  if (category >= 2) {
    // Two pair or better: aggressive
    if (validActions.includes('BET'))  return 'BET';
    if (validActions.includes('CALL')) return 'CALL';
    return validActions[0];
  }
  if (category === 1) {
    // One pair: mix
    if (validActions.includes('BET'))  return rand < 0.30 ? 'BET'  : 'CHECK';
    if (validActions.includes('CALL')) return rand < 0.60 ? 'CALL' : 'FOLD';
    return 'CHECK';
  }
  if (hasDraw) {
    // Drawing hand: check or call
    if (validActions.includes('CHECK')) return 'CHECK';
    if (validActions.includes('CALL'))  return rand < 0.70 ? 'CALL' : 'FOLD';
  }
  // Air: mostly check/fold, occasional bluff
  if (validActions.includes('CHECK')) return rand < 0.85 ? 'CHECK' : 'BET';
  if (validActions.includes('FOLD'))  return rand < 0.80 ? 'FOLD'  : 'CALL';
  return validActions[0];
}

/** Returns true if the bot has a 4-flush or open-ended straight draw. */
function checkDraw(holeCards, community) {
  const all = [...holeCards, ...community];
  if (all.length < 4) return false;
  // 4-flush
  for (const suit of LOCAL_SUITS) {
    if (all.filter(c => c.suit === suit).length >= 4) return true;
  }
  // OESD: 4 consecutive card values
  const sorted = [...new Set(all.map(cardNumericValue))].sort((a, b) => a - b);
  for (let i = 0; i <= sorted.length - 4; i++) {
    if (sorted[i + 3] - sorted[i] === 3) return true;
  }
  return false;
}

/**
 * Choose the best 2 from 4 cards (PICK2 variant).
 * Tries all C(4,2)=6 pairs and picks the highest-scoring one.
 */
function botPick2(cards4) {
  const pairs = getCombinations(cards4, 2);
  let bestPair  = pairs[0];
  let bestScore = -1;

  for (const pair of pairs) {
    const score = scorePreflopHand(pair);
    if (score > bestScore) { bestScore = score; bestPair = pair; }
  }
  return bestPair;
}

// ================================================================
// TIMER
// ================================================================

function startDecisionTimer() {
  stopTimer();
  gameState.timerSeconds = TIMER_SECS;
  gameState.timerActive  = true;
  updateTimerDisplay();

  gameState.timerInterval = setInterval(() => {
    gameState.timerSeconds--;
    updateTimerDisplay();
    if (gameState.timerSeconds <= 0) {
      stopTimer();
      // Auto-action: fold if facing bet, else check
      const autoAction = approxEq(gameState.streetBet, gameState.playerBetThisStreet) ? 'CHECK' : 'FOLD';
      logEvent(`⏱ Time! Auto-${autoAction}`);
      handlePlayerAction(autoAction);
    }
  }, 1000);
}

function stopTimer() {
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
  }
  gameState.timerActive  = false;
  gameState.timerSeconds = TIMER_SECS;
  updateTimerDisplay();
}

// ================================================================
// GAME FLOW — STATE MACHINE
// ================================================================

/** Start or reset the entire match. Called from UI. */
async function startNewMatch() {
  stopTimer();

  // Reset game state
  Object.assign(gameState, {
    phase:             'LOBBY',
    playerPoints:      0,
    botPoints:         0,
    handNumber:        0,
    playerStack:       10,
    botStack:          10,
    pot:               0,
    communityCards:    [],
    playerHoleCards:   [],
    botHoleCards:      [],
    playerPickCards:   [],
    botPickCards:      [],
    dealerIsPlayer:    Math.random() < 0.5,
    matchOver:         false,
    lastHandResult:    null,
  });

  // Respect current UI toggle settings
  applyVariantFromUI();
  applyMatchLengthFromUI();

  // Clear event log
  document.getElementById('event-log').innerHTML = '';

  hideLobby();
  hideAllModals();
  renderGameState();

  logEvent('🃏 New match started!');
  await getNewDeck();
  rebuildLocalDeck(); // also prepare local fallback
  await startHand();
}

/** Also called from "Play Again" in match-over modal. */
async function resetForNewMatch() {
  document.getElementById('match-over-modal').classList.add('hidden');
  await startNewMatch();
}

/** Begin a new hand: post blinds, deal cards, enter first betting round. */
async function startHand() {
  gameState.handNumber++;
  gameState.phase          = 'HAND_INIT';
  gameState.communityCards = [];
  gameState.playerHoleCards = [];
  gameState.botHoleCards    = [];
  gameState.playerPickCards = [];
  gameState.botPickCards    = [];
  gameState.pot             = 0;
  gameState.playerBetThisStreet = 0;
  gameState.botBetThisStreet    = 0;
  gameState.streetBet       = 0;
  gameState.actionCount     = 0;
  gameState.playerFolded    = false;
  gameState.botFolded       = false;
  gameState.pick2Selected   = [];

  logEvent(`── Hand #${gameState.handNumber} ──`, 'log-hand');

  renderGameState();
  await delay(200);

  // ── Post blinds ──────────────────────────────────────────────
  // Heads-up: dealer = SB
  const { sb, bb } = gameState;
  const sbPlayer = gameState.dealerIsPlayer ? 'player' : 'bot';
  const bbPlayer = gameState.dealerIsPlayer ? 'bot'    : 'player';

  postBlind(sbPlayer, sb);
  postBlind(bbPlayer, bb);
  gameState.streetBet = bb;

  logEvent(`Blinds posted — SB $${sb.toFixed(2)} / BB $${bb.toFixed(2)}`);
  renderGameState();

  // ── Deal hole cards ──────────────────────────────────────────
  const holeCount = gameState.variant === 'PICK2' ? 4 : 2;
  const drawnCards = await drawCards(holeCount * 2); // player + bot

  if (gameState.variant === 'PICK2') {
    gameState.playerPickCards = drawnCards.slice(0, 4);
    gameState.botPickCards    = drawnCards.slice(4, 8);
    gameState.botHoleCards    = botPick2(gameState.botPickCards);
    showPick2UI(gameState.playerPickCards);
    // Flow continues once player confirms pick-2
  } else {
    gameState.playerHoleCards = drawnCards.slice(0, 2);
    gameState.botHoleCards    = drawnCards.slice(2, 4);
    renderGameState();
    await startBettingRound('PREFLOP_BETTING');
  }
}

/** Deduct blind from stack, add to pot, track bet. */
function postBlind(who, amount) {
  const actual = Math.min(amount, who === 'player' ? gameState.playerStack : gameState.botStack);
  if (who === 'player') {
    gameState.playerStack          = r2(gameState.playerStack - actual);
    gameState.playerBetThisStreet  = r2(gameState.playerBetThisStreet + actual);
  } else {
    gameState.botStack             = r2(gameState.botStack - actual);
    gameState.botBetThisStreet     = r2(gameState.botBetThisStreet + actual);
  }
  gameState.pot = r2(gameState.pot + actual);
}

/** Returns fixed bet size for the current phase. */
function getBetAmount() {
  const bb = gameState.bb;
  if (gameState.phase === 'TURN_BETTING' || gameState.phase === 'RIVER_BETTING') return r2(bb * 2);
  return bb;
}

/** Set up the betting state for a new street and kick off action. */
async function startBettingRound(phase) {
  gameState.phase       = phase;
  gameState.actionCount = 0;
  gameState.streetBet   = 0;
  gameState.playerBetThisStreet = 0;
  gameState.botBetThisStreet    = 0;

  // Preflop: SB (dealer) acts first. Post-flop: non-dealer acts first.
  if (phase === 'PREFLOP_BETTING') {
    // Restore blind amounts as "bets this street" so call/raise math works
    const sb = gameState.sb, bb = gameState.bb;
    if (gameState.dealerIsPlayer) {
      gameState.playerBetThisStreet = sb;
      gameState.botBetThisStreet    = bb;
    } else {
      gameState.botBetThisStreet    = sb;
      gameState.playerBetThisStreet = bb;
    }
    gameState.streetBet    = bb;
    gameState.currentActor = gameState.dealerIsPlayer ? 'player' : 'bot';
  } else {
    gameState.currentActor = gameState.dealerIsPlayer ? 'bot' : 'player';
  }

  renderGameState();
  await nextActorActs();
}

/** Prompt the current actor to act. */
async function nextActorActs() {
  if (gameState.currentActor === 'player') {
    showActionButtons();
    startDecisionTimer();
  } else {
    hideActionButtons();
    await delay(BOT_MIN_DELAY + Math.random() * (BOT_MAX_DELAY - BOT_MIN_DELAY));
    const validActions = getValidActions('bot');
    const action = botChooseAction(validActions, gameState.phase);
    await handleAction(action, 'bot');
  }
}

/** Determine valid actions for an actor given current bet state. */
function getValidActions(who) {
  const myBet = who === 'player' ? gameState.playerBetThisStreet : gameState.botBetThisStreet;
  if (gameState.streetBet > myBet + 0.001) {
    return ['CALL', 'FOLD'];
  }
  return ['CHECK', 'BET'];
}

/** Called when player taps an action button. */
async function handlePlayerAction(action) {
  if (gameState.currentActor !== 'player') return;
  if (gameState.phase.indexOf('BETTING') === -1) return;

  const valid = getValidActions('player');
  if (!valid.includes(action)) return; // guard against stale clicks

  stopTimer();
  hideActionButtons();
  await handleAction(action, 'player');
}

/** Core action handler (shared by player and bot). */
async function handleAction(action, who) {
  const isPlayer = (who === 'player');
  const name     = isPlayer ? 'You' : 'Bot';

  if (action === 'FOLD') {
    if (isPlayer) gameState.playerFolded = true;
    else          gameState.botFolded    = true;
    logEvent(`${name}: FOLD`);
    await endHandByFold(who);
    return;
  }

  if (action === 'CHECK') {
    logEvent(`${name}: CHECK`);
    gameState.actionCount++;
  }

  if (action === 'BET') {
    const betAmt  = getBetAmount();
    const stack   = isPlayer ? gameState.playerStack : gameState.botStack;
    const actual  = Math.min(betAmt, stack);
    if (isPlayer) {
      gameState.playerStack         = r2(gameState.playerStack - actual);
      gameState.playerBetThisStreet = r2(gameState.playerBetThisStreet + actual);
    } else {
      gameState.botStack            = r2(gameState.botStack - actual);
      gameState.botBetThisStreet    = r2(gameState.botBetThisStreet + actual);
    }
    gameState.streetBet = r2(Math.max(gameState.playerBetThisStreet, gameState.botBetThisStreet));
    gameState.pot       = r2(gameState.pot + actual);
    logEvent(`${name}: BET $${actual.toFixed(2)}`);
    gameState.actionCount++;
    renderGameState();
    // Other player must now act
    gameState.currentActor = isPlayer ? 'bot' : 'player';
    await nextActorActs();
    return;
  }

  if (action === 'CALL') {
    const myBet  = isPlayer ? gameState.playerBetThisStreet : gameState.botBetThisStreet;
    const toCall = r2(gameState.streetBet - myBet);
    const stack  = isPlayer ? gameState.playerStack : gameState.botStack;
    const actual = Math.min(toCall, stack);
    if (isPlayer) {
      gameState.playerStack         = r2(gameState.playerStack - actual);
      gameState.playerBetThisStreet = r2(gameState.playerBetThisStreet + actual);
    } else {
      gameState.botStack            = r2(gameState.botStack - actual);
      gameState.botBetThisStreet    = r2(gameState.botBetThisStreet + actual);
    }
    gameState.pot       = r2(gameState.pot + actual);
    logEvent(`${name}: CALL $${actual.toFixed(2)}`);
    gameState.actionCount++;
    renderGameState();
    await advanceToNextStreet();
    return;
  }

  // CHECK path: check if both players have checked (bets equal + actionCount >= 2)
  renderGameState();
  if (gameState.actionCount >= 2 &&
      approxEq(gameState.playerBetThisStreet, gameState.botBetThisStreet)) {
    await advanceToNextStreet();
    return;
  }
  // Switch actor
  gameState.currentActor = isPlayer ? 'bot' : 'player';
  await nextActorActs();
}

/** Move to the next street (or showdown). */
async function advanceToNextStreet() {
  switch (gameState.phase) {
    case 'PREFLOP_BETTING': await dealCommunity(3, 'DEAL_FLOP',  'FLOP_BETTING',  'Flop');   break;
    case 'FLOP_BETTING':    await dealCommunity(1, 'DEAL_TURN',  'TURN_BETTING',  'Turn');   break;
    case 'TURN_BETTING':    await dealCommunity(1, 'DEAL_RIVER', 'RIVER_BETTING', 'River');  break;
    case 'RIVER_BETTING':   await runShowdown(); break;
    default: break;
  }
}

/** Deal n community cards, update street label, start next betting round. */
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

/** Called when one player folds. Award pot to winner. */
async function endHandByFold(folder) {
  stopTimer();
  hideActionButtons();

  const winnerIsPlayer = (folder === 'bot');
  const potWon         = gameState.pot;

  if (winnerIsPlayer) {
    gameState.playerStack = r2(gameState.playerStack + potWon);
  } else {
    gameState.botStack    = r2(gameState.botStack    + potWon);
  }

  const outcome = winnerIsPlayer ? 'win' : 'lose';
  logEvent(winnerIsPlayer ? `You win $${potWon.toFixed(2)} (bot folded)` : `Bot wins $${potWon.toFixed(2)} (you folded)`, winnerIsPlayer ? 'log-win' : 'log-lose');

  renderGameState();
  await endHand(outcome, potWon, '(fold)', '(fold)');
}

/** Reveal cards and determine winner. */
async function runShowdown() {
  gameState.phase = 'SHOWDOWN';
  renderGameState();
  await delay(400);

  const playerCards = [...gameState.playerHoleCards, ...gameState.communityCards];
  const botCards    = [...gameState.botHoleCards,    ...gameState.communityCards];

  const playerResult = evaluateHand(playerCards);
  const botResult    = evaluateHand(botCards);

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
    gameState.botStack    = r2(gameState.botStack    + half);
    logEvent('🤝 Split pot.');
  }

  renderGameState();
  await endHand(outcome, potChange, playerResult.name, botResult.name);
}

/** Apply match points, check for match end, show modal. */
async function endHand(outcome, potChange, playerHandName, botHandName) {
  gameState.phase          = 'HAND_END';
  gameState.lastHandResult = outcome;

  let playerPts = 0, botPts = 0;
  if (outcome === 'win')  { gameState.playerPoints = r2(gameState.playerPoints + 1); playerPts = 1; }
  else if (outcome === 'lose') { gameState.botPoints = r2(gameState.botPoints + 1); botPts = 1; }
  else { // tie
    gameState.playerPoints = r2(gameState.playerPoints + 0.5);
    gameState.botPoints    = r2(gameState.botPoints    + 0.5);
    playerPts = botPts = 0.5;
  }

  // Rebuy if a stack busted
  if (gameState.playerStack <= 0) { gameState.playerStack = 10; logEvent('You rebought to $10.00'); }
  if (gameState.botStack    <= 0) { gameState.botStack    = 10; logEvent('Bot rebought to $10.00');  }

  // Rotate dealer
  gameState.dealerIsPlayer = !gameState.dealerIsPlayer;

  renderGameState();

  const matchOver = gameState.playerPoints >= gameState.matchPointsNeeded ||
                    gameState.botPoints    >= gameState.matchPointsNeeded;

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

// ================================================================
// PICK-2 VARIANT UI
// ================================================================

function showPick2UI(cards4) {
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

function pick2CardClick(idx) {
  const sel = gameState.pick2Selected;
  const pos  = sel.indexOf(idx);
  if (pos === -1) {
    if (sel.length < 2) sel.push(idx);
  } else {
    sel.splice(pos, 1);
  }
  // Update visual state
  document.querySelectorAll('.pick2-card').forEach((el, i) => {
    el.classList.toggle('selected', sel.includes(i));
  });
  updatePick2Count();
  document.getElementById('btn-pick2-confirm').disabled = sel.length !== 2;
}

function updatePick2Count() {
  const n = gameState.pick2Selected.length;
  document.getElementById('pick2-count').textContent = `Select 2 cards (${n} / 2 selected)`;
}

function confirmPick2() {
  if (gameState.pick2Selected.length !== 2) return;
  const cards4 = gameState.playerPickCards;
  gameState.playerHoleCards = gameState.pick2Selected.map(i => cards4[i]);

  // Visual feedback: fade out discarded cards
  document.querySelectorAll('.pick2-card').forEach((el, i) => {
    if (!gameState.pick2Selected.includes(i)) el.classList.add('discarded');
  });

  setTimeout(async () => {
    document.getElementById('pick2-overlay').classList.add('hidden');
    renderGameState();
    await startBettingRound('PREFLOP_BETTING');
  }, 350);
}

// ================================================================
// MODAL
// ================================================================

async function showHandEndModal({ outcome, playerHandName, botHandName, potChange, ptsText, matchOver }) {
  const modal   = document.getElementById('hand-end-modal');
  const outcomeEl = document.getElementById('modal-outcome');

  const label = outcome === 'win' ? '🏆 You Win!' : outcome === 'lose' ? '💀 You Lose' : '🤝 Tie';
  outcomeEl.textContent = label;
  outcomeEl.className   = `modal-outcome ${outcome}`;

  document.getElementById('modal-player-hand').textContent = playerHandName;
  document.getElementById('modal-bot-hand').textContent    = botHandName;

  const chipSign = potChange > 0 ? '+' : '';
  document.getElementById('modal-pot-change').innerHTML =
    `Chips: <strong>${chipSign}$${Math.abs(potChange).toFixed(2)}</strong>`;
  document.getElementById('modal-points-change').innerHTML =
    `Match: <strong>${ptsText}</strong>`;

  modal.classList.remove('hidden');

  // Store matchOver for use in closeHandModal
  modal.dataset.matchOver = matchOver ? '1' : '0';
}

function closeHandModal() {
  const modal    = document.getElementById('hand-end-modal');
  const matchOver = modal.dataset.matchOver === '1';
  modal.classList.add('hidden');

  if (matchOver) {
    showMatchOverModal();
  } else {
    startHand(); // async, no await needed here
  }
}

function showMatchOverModal() {
  gameState.matchOver = true;
  const pWon = gameState.playerPoints >= gameState.matchPointsNeeded;
  const outcome = document.getElementById('match-outcome');
  outcome.textContent  = pWon ? '🏆 You Win the Match!' : '💀 Bot Wins the Match';
  outcome.className    = `modal-outcome ${pWon ? 'win' : 'lose'}`;
  document.getElementById('match-summary').innerHTML =
    `Final score: You <strong>${gameState.playerPoints}</strong> – Bot <strong>${gameState.botPoints}</strong>`;
  document.getElementById('match-over-modal').classList.remove('hidden');
  logEvent(pWon ? '🏆 YOU WIN THE MATCH!' : '💀 Bot wins the match.', pWon ? 'log-win' : 'log-lose');
}

function hideAllModals() {
  document.getElementById('hand-end-modal').classList.add('hidden');
  document.getElementById('match-over-modal').classList.add('hidden');
}

// ================================================================
// EVENT LOG
// ================================================================

function logEvent(text, cssClass = '') {
  const log   = document.getElementById('event-log');
  const entry = document.createElement('div');
  entry.className = `log-entry${cssClass ? ' ' + cssClass : ''}`;
  entry.textContent = text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function toggleEventLog() {
  const log    = document.getElementById('event-log');
  const toggle = document.getElementById('event-log-toggle');
  const open   = log.classList.toggle('open');
  toggle.classList.toggle('expanded', open);
  toggle.setAttribute('aria-expanded', open);
  toggle.textContent = (open ? '▲' : '▼') + ' Event Log';
  if (open) log.scrollTop = log.scrollHeight;
}

// ================================================================
// UI RENDERING
// ================================================================

function renderGameState() {
  updateScoreDisplay();
  updateStackDisplays();
  updatePotDisplay();
  updateCardDisplays();
  updateActionButtons();
  updateStreetLabel();
  updateTimerDisplay();
  updateDealerChips();
  updateBetChips();
  updateHandNumber();
}

function updateScoreDisplay() {
  const fmt = n => (n % 1 === 0 ? String(n) : n.toFixed(1));
  document.getElementById('player-points').textContent = fmt(gameState.playerPoints);
  document.getElementById('bot-points').textContent    = fmt(gameState.botPoints);
}

function updateStackDisplays() {
  document.getElementById('player-stack').textContent = gameState.playerStack.toFixed(2);
  document.getElementById('bot-stack').textContent    = gameState.botStack.toFixed(2);
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
  pc.classList.toggle('visible', gameState.dealerIsPlayer  && gameState.phase !== 'LOBBY');
  bc.classList.toggle('visible', !gameState.dealerIsPlayer && gameState.phase !== 'LOBBY');
}

function updateBetChips() {
  const pc     = document.getElementById('player-bet-chip');
  const bc     = document.getElementById('bot-bet-chip');
  const pBet   = gameState.playerBetThisStreet;
  const bBet   = gameState.botBetThisStreet;
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
  // Bot hole cards
  const botCardArea = document.getElementById('bot-cards');
  if (gameState.phase === 'SHOWDOWN' || gameState.phase === 'HAND_END') {
    // Reveal bot cards
    botCardArea.innerHTML = '';
    for (const card of gameState.botHoleCards) {
      botCardArea.appendChild(cardElement(card));
    }
    // Add placeholder if no cards yet
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

  // Player hole cards
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

  // Community cards
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

  // Zone winner/loser styling at showdown
  const pZone = document.getElementById('player-zone');
  pZone.classList.remove('winner', 'loser');
  if (gameState.phase === 'HAND_END' || gameState.phase === 'SHOWDOWN') {
    if (gameState.lastHandResult === 'win')  pZone.classList.add('winner');
    if (gameState.lastHandResult === 'lose') pZone.classList.add('loser');
  }
}

function updateActionButtons() {
  const container = document.getElementById('action-buttons');
  const lobby     = document.getElementById('lobby-area');

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

  const checkBtn = document.getElementById('btn-check');
  const betBtn   = document.getElementById('btn-bet');
  const callBtn  = document.getElementById('btn-call');
  const foldBtn  = document.getElementById('btn-fold');

  checkBtn.style.display = valid.includes('CHECK') ? '' : 'none';
  betBtn.style.display   = valid.includes('BET')   ? '' : 'none';
  callBtn.style.display  = valid.includes('CALL')  ? '' : 'none';
  foldBtn.style.display  = valid.includes('FOLD')  ? '' : 'none';

  // Label bet amount
  const betAmt  = getBetAmount();
  document.getElementById('bet-amount-label').textContent  = `$${betAmt.toFixed(2)}`;
  const toCall  = r2(gameState.streetBet - gameState.playerBetThisStreet);
  document.getElementById('call-amount-label').textContent = `$${Math.max(0, toCall).toFixed(2)}`;
}

function updateStreetLabel() {
  const lbl    = document.getElementById('street-label');
  const labels = {
    LOBBY:           '— Waiting to Start —',
    HAND_INIT:       '● Dealing…',
    PREFLOP_BETTING: '● Pre-Flop',
    DEAL_FLOP:       '● Dealing Flop…',
    FLOP_BETTING:    '● Flop',
    DEAL_TURN:       '● Dealing Turn…',
    TURN_BETTING:    '● Turn',
    DEAL_RIVER:      '● Dealing River…',
    RIVER_BETTING:   '● River',
    SHOWDOWN:        '★ Showdown',
    HAND_END:        '—',
  };
  lbl.textContent = labels[gameState.phase] || gameState.phase;
}

function updateTimerDisplay() {
  const bar   = document.getElementById('timer-bar');
  const label = document.getElementById('timer-label');
  if (!gameState.timerActive) {
    bar.style.width  = '0%';
    bar.className    = 'timer-bar';
    label.textContent = '';
    return;
  }
  const pct = (gameState.timerSeconds / TIMER_SECS) * 100;
  bar.style.width   = `${pct}%`;
  label.textContent = `${gameState.timerSeconds}s`;
  bar.classList.remove('mid', 'low');
  if (pct <= 30) bar.classList.add('low');
  else if (pct <= 60) bar.classList.add('mid');
}

// ── Button visibility helpers ────────────────────────────────
function showActionButtons() { document.getElementById('action-buttons').classList.remove('hidden'); }
function hideActionButtons() { document.getElementById('action-buttons').classList.add('hidden');    }
function hideLobby()         { document.getElementById('lobby-area').classList.add('hidden');        }

// ── Loading / warning ────────────────────────────────────────
function setLoading(on) {
  gameState.apiLoading = on;
  document.getElementById('loading-spinner').classList.toggle('hidden', !on);
  // Disable buttons while loading
  document.querySelectorAll('.action-btn').forEach(b => { b.disabled = on; });
}
function showApiWarning() { document.getElementById('api-warning').classList.remove('hidden'); }
function hideApiWarning() { document.getElementById('api-warning').classList.add('hidden');    }

// ================================================================
// TOGGLE HANDLERS
// ================================================================

function applyVariantFromUI() {
  const normal = document.getElementById('variant-normal');
  const pick2  = document.getElementById('variant-pick2');
  if (normal.classList.contains('active')) {
    gameState.variant = 'NORMAL';
  } else {
    gameState.variant = 'PICK2';
  }
}

function applyMatchLengthFromUI() {
  const bo3 = document.getElementById('match-bo3');
  if (bo3.classList.contains('active')) {
    gameState.matchLength       = 'BO3';
    gameState.matchPointsNeeded = 2;
  } else {
    gameState.matchLength       = 'BO5';
    gameState.matchPointsNeeded = 3;
  }
}

function handleVariantToggle(e) {
  if (gameState.phase !== 'LOBBY') return; // only change between matches
  const btn = e.currentTarget;
  document.querySelectorAll('#variant-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function handleMatchLengthToggle(e) {
  if (gameState.phase !== 'LOBBY') return;
  const btn = e.currentTarget;
  document.querySelectorAll('#match-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ================================================================
// UTILITY
// ================================================================

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ================================================================
// INIT
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Wire up variant toggles
  document.querySelectorAll('#variant-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', handleVariantToggle);
  });
  // Wire up match-length toggles
  document.querySelectorAll('#match-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', handleMatchLengthToggle);
  });

  // Initial render
  renderGameState();

  // Seed the local fallback deck immediately so first draw is instant
  rebuildLocalDeck();
});
