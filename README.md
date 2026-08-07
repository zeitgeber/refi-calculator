# Refi Reckoner

A privacy-first, no-login refinance calculator. It runs entirely in the browser and can be deployed as static files on Cloudflare Pages.

## What it includes

- Break-even month and savings over the selected time horizon
- Current vs refinance payment comparison
- Yearly cumulative payment and balance table
- 2-year break-even target rate
- Target savings, closing-cost, stay-or-move, reinvestment, and cash-in simulations
- Downloadable PNG result card
- Plain-English mortgage interest explainer
- Source-backed refinance guides covering break-even, target rates, closing costs, term reset, cash-in refinancing, and PMI/LTV
- About and editorial-policy page identifying the public publisher and content standards
- Ad slots kept outside the calculator form

## Run locally

Open `index.html` in a browser.

No install step, build step, backend, login, or database.

## Deploy

For Cloudflare Pages, use this repo as a static site:

- Build command: leave blank
- Output directory: `/`

## Privacy

Inputs stay in the browser. The share card is generated locally as a downloadable PNG.

## Educational content

The guides use primary CFPB and HUD material for factual mortgage claims. Illustrative scenarios are clearly labeled and are not loan offers, rate forecasts, or financial advice. Content is published and maintained by [zeitgeber](https://github.com/zeitgeber); see `about.html` for the editorial policy.
