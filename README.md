# Crypto Horizon

**The market moves. See what the models see.**

An open-source cryptocurrency research dashboard built by **Fauzan Habib**, with live Yahoo Finance quotes and **AutoTS forecasts for the next 10 daily closes**. It follows Yahoo’s current top 10 USD cryptocurrencies by market capitalization, including stablecoins and wrapped assets when they qualify.

**[Open the live dashboard](https://fauzan-ten.vercel.app/projects/crypto-horizon)** · [Portfolio](https://fauzan-ten.vercel.app/) · [AutoTS](https://github.com/winedarksea/AutoTS)

## What’s inside

- Market watch with top-10 prices, provider timestamps, reported price changes, market caps, and volumes.
- Interactive 30/90/180-day charts, 10-day daily forecasts, nominal 90% model prediction intervals, and CSV download.
- A genuinely held-out 10-day evaluation, compared with an unchanged-price baseline. Losses to the baseline are visible.
- Daily scheduled training through GitHub Actions, dated forecast vintages, and clearly labeled stale/fallback states.
- A standalone Next.js app and an integration script for the portfolio. No private API keys or external Python server are needed for this architecture.

## Run locally

Python **3.12** and Node **22+** are recommended.

```sh
git clone https://github.com/Fauzan-coder/crypto-horizon.git
cd crypto-horizon
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-lock.txt
python -m pytest -q
python -m pipeline.forecast --generations 3
cd web
npm ci
npm run dev
```

Open the localhost URL printed by Next.js. The read-only API is `/api/crypto-horizon`. The bundled first-run snapshot keeps the dashboard usable when a feed is unavailable, with its original dates displayed. A local pipeline run writes `data/forecasts.json`; to preview it without pushing, copy it to `web/app/api/crypto-horizon/forecast-fallback.json` and temporarily disable the remote feed, or point `SNAPSHOT_URL` in the API route at your own hosted JSON. Normal production reads the latest published snapshot from this repository; the historical bundle is a fallback only.

The web project can also be deployed independently on a Next.js host. Its header links are intended for portfolio integration; adjust the home/back links when hosting separately.

## Methodology

1. **Universe:** Yahoo Finance’s `all_cryptocurrencies_us` screener, ranked by market cap at training time. Live ranks can change before the next run; newly ranked assets show a forecast-unavailable state until trained.
2. **Data:** up to three years of daily USD closes through the last completed UTC day. The unfinished candle is excluded. At least 200 days are required. Up to two consecutive older missing days may be forward-filled, with counts disclosed; no gaps are accepted in the last 40 days. No backward filling or future-aware interpolation is used.
3. **Selection:** the final **10 days are set aside before AutoTS sees the data**. On the earlier data, AutoTS searches `LastValueNaive`, `AverageValueNaive`, `SeasonalNaive`, `GLS`, `ETS`, and `Theta`, with three backward validation windows of 10 days. sMAPE is used to make relative errors comparable across differently priced assets. Fast transformations of depth up to two and horizontal ensembles are enabled. The random seed is 42 and the default search has three generations. The number shown in the dashboard counts successful model evaluations, including validation, rather than unique model families.
4. **Independent test:** evaluate the selected configuration once on the untouched 10 days. Compare its MAE, RMSE, and MAPE with a forecast that repeats the price at the training boundary. MAE skill is `100 × (1 − model MAE / baseline MAE)`; negative values mean the baseline won. Skill is undefined if baseline MAE is zero. Interval coverage is observed coverage on only ten observations, not proof of calibration.
5. **Production:** refit the chosen configuration on all completed daily data, without another model search, and forecast **10 calendar-day closes**. The first target is the current unfinished UTC day’s eventual close. This is not ten trading days, an intraday forecast, or a forecast relative to the latest live tick. Returns shown in the daily outlook are relative to the last training close.
6. **Preservation:** publish `data/forecasts.json` atomically only after every asset has a valid forecast and bounds. A failed run leaves the previous snapshot intact. Keep the first successful snapshot per UTC day in `data/archive/` for later forward evaluation. Archived forecasts do not yet have an automated realized-performance score; today’s reported metrics are historical holdout results.

The first run uses real Yahoo data, not synthetic dashboard fixtures. Some searched models/transformers can fail and are excluded by AutoTS; the pipeline fails if the final selected configuration cannot generate valid output. Increasing generations does not guarantee better future accuracy. Recent-only holdout performance is limited evidence, especially for volatile assets and nearly constant stablecoins. Broader rolling-origin tests and realized forward-vintage scoring are useful future improvements.

## Freshness and automation

`.github/workflows/forecasts.yml` runs at **02:23 UTC daily**, or manually via Actions. Scheduled jobs can be delayed or fail; timestamps remain authoritative. It tests, trains, and commits the new snapshot using the repository’s built-in `GITHUB_TOKEN` with `contents: write`. No personal access token is stored. Public repositories may have scheduled workflows disabled after prolonged inactivity; monitor workflow runs. The CI workflow checks Python tests and the standalone dashboard build.

The dashboard polls every 60 seconds while its tab is visible. The server caches Yahoo requests for 60 seconds and forecast JSON for five minutes. Yahoo may delay prices or rate-limit unofficial endpoints. Refreshing quotes does **not** rerun AutoTS. Forecasts older than 36 hours are flagged. If quotes fail, the UI explicitly identifies training-close snapshot prices; if the forecast feed fails, it identifies the bundled vintage.

## Portfolio integration

```sh
node scripts/sync-portfolio.mjs /absolute/path/to/my-portfolio
```

This copies the shared React components, styles, read-only API and bundled fallback, and creates `/projects/crypto-horizon`. Add the project to your portfolio’s project selector. It copies no `.env`, Git metadata, or hosting credentials. The standalone app and portfolio use the same source files; rerun the script after dashboard changes.

## Checks

```sh
python -m pytest -q
cd web
npm ci
npm run build
```

Tests cover the training/holdout boundary, exclusion of unfinished and invalid candles, baseline skill, interval validity, and the exact 10-day horizon. Native browser interaction checks depend on the browser environment; do not interpret a successful build as a browser interaction test.

## Data and intended use

This project is an educational forecasting experiment, **not investment advice or a trading system**. Models can miss abrupt moves, and prediction bands do not guarantee containment. There is no order execution, wallet connection, or claim of guaranteed accuracy.

Yahoo Finance data is accessed through unofficial endpoints and [yfinance](https://ranaroussi.github.io/yfinance/), which is not affiliated with Yahoo. Upstream availability and terms apply; yfinance documents personal-use restrictions on Yahoo data. The **MIT license covers this project’s code**, not a grant of rights over third-party market data. Review the provider’s terms before reuse, redistribution, or commercial deployment.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Reproducible improvements to out-of-sample forecasting, model diagnostics, data quality, and accessibility are welcome. Do not submit private API keys, financial records, or cherry-picked accuracy claims.

## References

- [AutoTS tutorial and validation guidance](https://winedarksea.github.io/AutoTS/build/html/source/tutorial.html)
- [AutoTS API](https://winedarksea.github.io/AutoTS/build/html/source/autots.html)
- [yfinance documentation](https://ranaroussi.github.io/yfinance/)

## License

[MIT](LICENSE) — Copyright 2026 Fauzan Habib.
