# Deploying

The site is static, so there is nothing to build and nothing to configure.

## GitHub Pages

Settings -> Pages -> Source: **Deploy from a branch**, branch `main`, folder
`/ (root)`. Every push to `main` publishes.

`.nojekyll` is in the repository on purpose: without it Pages runs the files
through Jekyll, which drops anything starting with an underscore.

All paths in `index.html`, `manifest.webmanifest` and `sw.js` are relative
(`./js/app.js`, not `/js/app.js`), so the site works from a subpath such as
`/holdem/` as well as from a domain root.

## Before every deploy: raise the cache version

`sw.js` starts with

```js
const CACHE = 'holdem-v1';
```

Bump it (`v2`, `v3`, …) whenever any file in `SHELL` changes. The service
worker serves the cached shell whenever the network is slow or gone, and a
returning player who already has the old shell will keep it until the cache
name changes.

Add new files to `SHELL` in the same edit, or they will not be there offline.

## Checking a build before shipping

```
python3 -m http.server 8000
node test/eval.test.mjs && node test/engine.test.mjs && node test/tokens.test.mjs
```

Then open the page and check, in this order: the console is clean, a hand plays
to showdown, both themes look right, and the layout holds at 390px wide.
