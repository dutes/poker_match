# Poker Duel

Poker Duel is a fast, casual heads-up poker prototype designed for short, best-of-3 matches. Built with vanilla HTML, CSS, and JavaScript, the project focuses on visual polish, crisp animations, and a satisfying user experience—all without the need for complex frontend frameworks.

## Game Concept

Each match is a **Best of 3 hands**. The first player to win 2 hands wins the match.

Each hand follows a streamlined flow:
**Deal → Redraw Phase → Play Phase → Result → Match Score Update**

### Key Mechanic: The Redraw Phase
The standout feature of Poker Duel is the **Redraw Phase**. After the initial deal of two hole cards, each player has the opportunity to swap exactly one card before the traditional pre-flop betting phase begins. This adds a layer of strategy and excitement to every hand.

## Features & Visual Polish
- **Satisfying Animations**: Cards are dealt sequentially with 3D flip effects. Community cards are revealed rhythmically to build suspense.
- **Winning Hand Highlights**: At showdown, the winning player's cards glow gold and scale up for easy identification.
- **Live Hand Strength**: A dynamic hand strength indicator tracks your best possible hand as community cards are revealed.
- **Responsive UI**: Playable on both desktop and mobile devices.
- **Micro-interactions**: Action buttons scale on hover and press; chips animate to the winner; match scores pulse when points are awarded.
- **Simple Bot AI**: A lightweight opponent bot handles decisions during the redraw and betting phases.

## Technology Stack
- **Core**: HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
- **Styling**: Custom CSS with flexbox/grid and keyframe animations. No CSS frameworks used.
- **API**: Uses the [Deck of Cards API](https://deckofcardsapi.com/) for card shuffling and drawing, with built-in fallback logic for offline play or API unavailability.

## How to Play Locally

Since the game uses ES6 modules (`import`/`export`), it needs to be served via a local web server (opening the file directly via `file://` may cause CORS errors).

1. Clone or download this repository.
2. Open a terminal in the project directory.
3. Start a simple local server. For example, using Python:
   ```bash
   python -m http.server 8080
   ```
4. Open your browser and navigate to `http://localhost:8080`.

## File Structure
- `index.html`: The main interface and structure.
- `styles.css`: All styling and animations.
- `app.js`: Entry point and global event bindings.
- `state.js`: Global game state management.
- `engine.js`: Core game logic, pacing, and hand progression.
- `ui.js`: DOM manipulation, rendering, and modal controllers.
- `evaluator.js`: Poker hand evaluation logic.
- `bot.js`: Opponent decision-making logic.
- `api.js`: Wrapper for the Deck of Cards API.
