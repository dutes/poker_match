// state.js
'use strict';

export const API_BASE = 'https://deckofcardsapi.com/api/deck';
export const API_RETRY = 3;
export const API_RETRY_DELAY = 1000;
export const MIN_CARDS = 20;
export const BOT_MIN_DELAY = 500;
export const BOT_MAX_DELAY = 900;

export const LOCAL_SUITS = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'];
export const LOCAL_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING', 'ACE'];

export const r2 = x => Math.round(x * 100) / 100;
export const approxEq = (a, b) => Math.abs(a - b) < 0.005;
export function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export const gameState = {
  phase: 'LOBBY',
  matchPointsNeeded: 2,
  playerPoints: 0,
  botPoints: 0,
  handNumber: 0,
  deckId: null,
  remainingCards: 0,
  playerStack: 10,
  botStack: 10,
  pot: 0,
  playerBetThisStreet: 0,
  botBetThisStreet: 0,
  streetBet: 0,
  playerHoleCards: [],
  botHoleCards: [],
  communityCards: [],
  dealerIsPlayer: true,
  sb: 0.10,
  bb: 0.20,
  currentActor: 'player',
  actionCount: 0,
  matchOver: false,
  lastHandResult: null,
  playerSwappedCardIndex: -1,
  apiLoading: false,
  playerFolded: false,
  botFolded: false,
};
