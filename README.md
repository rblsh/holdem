# Hold'em

No-limit Texas hold'em against five bots. Plain HTML, CSS and JavaScript, no
build step and no dependencies: clone it, open `index.html` through any static
server, and it plays.

**Play:** https://rblsh.github.io/holdem/

## What is in it

- Six-max cash game, blinds 5/10, a buy-in of 1,000. Heads-up and three-handed
  are in the table settings; the engine does not care how many seats there are.
- The full betting round: blinds, position, minimum raises, all-ins, side pots,
  the uncalled part of a bet coming back, split pots down to the odd chip.
- Five opponents with different habits - how many hands they play, how often
  they raise, and how often they are bluffing.
- Light and dark themes, a keyboard (F, C, R, Space), sound synthesised in the
  browser, and an offline-capable installable app.

## How it is put together

| File | What it does |
| --- | --- |
| `js/cards.js` | Cards as integers, the deck, an unbiased shuffle |
| `js/eval.js` | Seven-card hand evaluation into one comparable integer |
| `js/engine.js` | The table: streets, betting, pots, showdown. No DOM in it |
| `js/bots.js` | Opponent decisions: a starting-hand score, then equity by rollout |
| `js/app.js` | The table on screen; turns engine events into animations |
| `js/spring.js` | Springs. Everything that moves is driven by one |
| `js/sound.js` | Cards and chips from filtered noise, no audio files |

The engine emits events and waits to be told the next action. It never decides
anything itself and holds no DOM, which is why the same code runs a hand in a
test in microseconds and on screen over several seconds of animation.

### How the bots think

Before the flop each hand gets a Chen score, adjusted for position and for the
price being asked. After the flop the bot deals the rest of the hand out a few
hundred times against random opponents and counts how often it wins - then
discounts that number by how much money is being bet at it, because a big bet
is not made by a random hand. What comes out is a bot that folds a weak draw,
pays a cheap price with a live one, and does not stack off with second pair.

## Tests

```
node test/eval.test.mjs      # named hands, the census of all 2,598,960 five-card hands,
                             # and 60,000 seven-card hands against a brute-force check
node test/engine.test.mjs    # blinds, minimum raises, short all-ins, side pots,
                             # and 20,000 random hands that must not lose a chip
node test/tokens.test.mjs    # contrast of every colour pair, in both themes
node test/eval.deep.mjs      # all 133,784,560 seven-card hands (about 25 seconds)
node test/bots.sim.mjs 5000  # a bot table left to itself, with its own statistics
```

The evaluator is checked against the published frequencies of every poker hand:
all 133,784,560 seven-card combinations, sorted into the nine categories, match
to the last hand.

## Running it locally

Any static server will do, because there is nothing to build:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` as a file does not
work: the code is ES modules, and browsers refuse to load those over `file://`.

`window.__hd` is exposed in the console with the table, the seats and a
`busy()` flag that says whether anything is still animating.

## Licence

MIT.
