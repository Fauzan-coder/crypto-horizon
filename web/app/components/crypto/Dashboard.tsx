'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Chart from './Chart';
import type { DashboardData, ForecastAsset } from './types';
import styles from './styles.module.css';

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 2 ? 5 : 2 }).format(value);
const compact = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const time = (value: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
const shortName = (name: string) => name.replace(/ USD$/, '');
const ticker = (symbol: string) => symbol.replace('-USD', '');

function download(asset: ForecastAsset) {
  const content = ['date_utc,forecast_usd,lower_90_usd,upper_90_usd', ...asset.forecast.map(p => `${p.date},${p.price},${p.lower},${p.upper}`)].join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${asset.symbol}-10-day-forecast.csv`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selected, setSelected] = useState('BTC-USD');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [checkedAt, setCheckedAt] = useState(0);
  const [windowDays, setWindowDays] = useState(30);
  const [holdout, setHoldout] = useState(false);
  const [search, setSearch] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/crypto-horizon', { signal, cache: 'no-store' });
      if (!res.ok) throw new Error('Market data could not be loaded. Try refreshing in a moment.');
      const json = await res.json() as DashboardData;
      if (!json.snapshot || !json.quotes?.length) throw new Error('The data feed returned an incomplete response.');
      setData(json); setError(null);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : 'Unable to load market data.');
    } finally { if (!signal?.aborted) { setRefreshing(false); setCheckedAt(Date.now()); } }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void load(controller.signal), 0);
    const timer = setInterval(() => { if (!document.hidden) void load(controller.signal); }, 60000);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(timer); };
  }, [load]);
  const quote = data?.quotes.find(q => q.symbol === selected);
  const asset = data?.snapshot.assets.find(a => a.symbol === selected);
  const last = asset?.forecast.at(-1);
  const move = last && asset ? (last.price / asset.lastClose - 1) * 100 : null;
  const snapshotStale = data ? checkedAt - Date.parse(data.snapshot.generatedAt) > 36 * 60 * 60 * 1000 : false;
  const quoteStale = quote ? checkedAt - Date.parse(quote.quotedAt) > 20 * 60 * 1000 : false;
  const live = data?.quoteSource === 'yahoo';
  return <div className={styles.page}>
    <a className={styles.skip} href="#dashboard-main">Skip to dashboard</a>
    <header className={styles.header}><Link href="/" className={styles.brand}>fauzan.</Link><span className={styles.projectLabel}>OPEN SOURCE / PROJECT 06</span><Link href="/#projects" className={styles.back}>← All projects</Link></header>
    <main id="dashboard-main" className={styles.main}>
      <section className={styles.intro}><div><p className={styles.eyebrow}>YAHOO FINANCE × AUTOTS</p><h1>Crypto <span>Horizon.</span></h1><p className={styles.subtitle}>The market moves. See what the models see.</p></div><a className={styles.github} href="https://github.com/Fauzan-coder/crypto-horizon" target="_blank" rel="noopener noreferrer">Explore the source <span aria-hidden="true">↗</span></a></section>
      <div className={styles.statusBar}><span><i className={live && !quoteStale ? styles.liveDot : styles.dimDot} />{data ? live ? 'Yahoo Finance quotes' : 'Historical snapshot · quotes unavailable' : 'Connecting to Yahoo Finance…'}</span><span>10 assets · USD · 10-day horizon</span><button onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh data ↻'}</button></div>
      {error && <div className={styles.notice} role="alert">{error}{data ? ' Previously fetched data remains visible; check the timestamps.' : ''}</div>}
      {data?.notices.map(notice => <p className={styles.notice} key={notice} role="status">{notice}</p>)}
      {snapshotStale && <p className={styles.notice}>Forecasts are more than 36 hours old. The dates below are the original forecast dates; refreshing prices does not retrain the model.</p>}
      {!data && !error && <div className={styles.loading} role="status"><div className={styles.loadingLine} /><p>Loading evaluated forecasts and the latest available quotes…</p></div>}
      {data && <>
        <div className={styles.dashboard}>
          <aside className={styles.assets} aria-label="Cryptocurrency selection"><div className={styles.assetHeading}><h2>Market watch</h2><span>TOP 10</span></div><label className={styles.searchLabel}><span className={styles.srOnly}>Search cryptocurrencies</span><input placeholder="Search assets…" value={search} onChange={e => setSearch(e.target.value)} /></label><div className={styles.assetList}>{data.quotes.filter(q => `${q.name} ${q.symbol}`.toLowerCase().includes(search.toLowerCase())).map(q => <button key={q.symbol} onClick={() => { setSelected(q.symbol); setHoldout(false); }} className={`${styles.assetButton} ${selected === q.symbol ? styles.activeAsset : ''}`} aria-pressed={selected === q.symbol}><span className={styles.coinIcon}>{ticker(q.symbol).slice(0, 1)}</span><span className={styles.coinName}><strong>{ticker(q.symbol)} <small>#{q.rank}</small></strong><span>{shortName(q.name)}</span></span><span className={styles.coinPrice}><strong>{money(q.price)}</strong><span className={q.changePct !== null && q.changePct < 0 ? styles.down : styles.up}>{q.changePct === null ? 'Daily close' : percent(q.changePct)}</span></span></button>)}</div>{!data.quotes.some(q => `${q.name} ${q.symbol}`.toLowerCase().includes(search.toLowerCase())) && <p className={styles.empty}>No matching assets.</p>}<p className={styles.asideNote}>Ranked by Yahoo’s market cap. Includes stablecoins and wrapped assets when in the top 10. Quote changes are provider-reported, not forecast returns.</p></aside>
          <div className={styles.content}>
            <section className={styles.marketOverview}><div><p className={styles.eyebrow}>{quote ? `${ticker(quote.symbol)} / USD` : 'ASSET NOT IN CURRENT TOP 10'}</p><h2>{quote ? shortName(quote.name) : ticker(selected)}{quote?.stablecoin && <span className={styles.badge}>Stablecoin</span>}</h2><div className={styles.currentPrice}>{quote ? money(quote.price) : 'Quote unavailable'}{quote?.changePct !== null && quote?.changePct !== undefined && <span className={quote.changePct < 0 ? styles.down : styles.up}>{percent(quote.changePct)}</span>}</div><p className={styles.timestamp}>{quote ? `${live ? 'Yahoo quote' : 'Training close'} as of ${time(quote.quotedAt)}` : 'Select an asset in Market watch.'}{live && quoteStale ? ' · Delayed / stale quote' : ''}</p></div><div className={styles.marketFacts}><div><span>Market cap</span><strong>{quote ? compact(quote.marketCap) : '—'}</strong></div><div><span>Reported volume</span><strong>{quote?.volume !== null && quote?.volume !== undefined ? compact(quote.volume) : '—'}</strong></div></div></section>
            {asset && last ? <>
              <div className={styles.stats}><article><p>DAY 10 · {last.date}</p><strong>{money(last.price)}</strong><span className={move !== null && move < 0 ? styles.down : styles.up}>{move === null ? '—' : percent(move)} vs training close</span></article><article><p>DAY 10 · 90% MODEL INTERVAL</p><strong className={styles.range}>{money(last.lower)} — {money(last.upper)}</strong><span>Nominal range · not a guarantee</span></article><article><p>UNSEEN 10-DAY TEST · MAPE</p><strong>{asset.evaluation.mape.toFixed(2)}<small>%</small></strong><span>Baseline: {asset.evaluation.baselineMape.toFixed(2)}% · lower is better</span></article></div>
              <section className={styles.chartPanel} aria-labelledby="price-chart-title"><div className={styles.chartHeader}><div><p className={styles.eyebrow}>THE NEXT CHAPTER</p><h3 id="price-chart-title">{holdout ? 'How did the model perform?' : 'Price trajectory'}</h3></div><div className={styles.chartOptions}><button className={!holdout ? styles.selectedTab : ''} aria-pressed={!holdout} onClick={() => setHoldout(false)}>Forecast</button><button className={holdout ? styles.selectedTab : ''} aria-pressed={holdout} onClick={() => setHoldout(true)}>Holdout test</button></div></div>{!holdout && <div className={styles.periods}>{[30, 90, 180].map(days => <button key={days} onClick={() => setWindowDays(days)} className={windowDays === days ? styles.selectedPeriod : ''} aria-pressed={windowDays === days}>{days}D</button>)}</div>}<Chart key={`${selected}-${holdout}-${windowDays}`} asset={asset} windowDays={windowDays} holdout={holdout} /><div className={styles.chartFooter}><span>Selected model: <strong>{asset.model}</strong></span><span>Daily closes · UTC · USD</span></div></section>
              <section className={styles.dailyPanel} aria-labelledby="daily-title"><div className={styles.panelHeading}><div><p className={styles.eyebrow}>10 DAYS AHEAD</p><h3 id="daily-title">The daily outlook</h3></div><button className={styles.download} onClick={() => download(asset)}>Download CSV ↓</button></div><div className={styles.tableScroll}><table><caption className={styles.srOnly}>Ten-day {asset.name} daily-close forecasts in US dollars, with nominal 90 percent model intervals</caption><thead><tr><th scope="col">Day / UTC date</th><th scope="col">Forecast</th><th scope="col">Lower 90%</th><th scope="col">Upper 90%</th><th scope="col">vs training close</th></tr></thead><tbody>{asset.forecast.map((p, i) => <tr key={p.date}><th scope="row"><span className={styles.dayNumber}>{String(i + 1).padStart(2, '0')}</span>{p.date}</th><td>{money(p.price)}</td><td>{money(p.lower)}</td><td>{money(p.upper)}</td><td className={p.price < asset.lastClose ? styles.down : styles.up}>{percent((p.price / asset.lastClose - 1) * 100)}</td></tr>)}</tbody></table></div></section>
              <section className={styles.evaluation} aria-labelledby="evaluation-title"><div><p className={styles.eyebrow}>MEASURE, DON’T GUESS</p><h3 id="evaluation-title">Accuracy, with context.</h3><p>The final 10 completed days were kept out of model selection. AutoTS is tested against an unchanged-price baseline, then its chosen configuration is refitted on all completed days for the forward forecast.</p><span className={styles.testDates}>TEST WINDOW / {asset.evaluation.start} → {asset.evaluation.end} UTC</span></div><div className={styles.scoreGrid}><article><span>Mean absolute error</span><strong>{money(asset.evaluation.mae)}</strong><small>Baseline: {money(asset.evaluation.baselineMae)}</small></article><article><span>Root mean squared error</span><strong>{money(asset.evaluation.rmse)}</strong><small>Penalizes larger misses</small></article><article><span>MAE skill vs baseline</span><strong className={asset.evaluation.skillPct !== null && asset.evaluation.skillPct < 0 ? styles.down : styles.up}>{asset.evaluation.skillPct === null ? 'Undefined' : percent(asset.evaluation.skillPct)}</strong><small>{asset.evaluation.skillPct === null ? 'Baseline error is zero' : asset.evaluation.skillPct < 0 ? 'Baseline performed better' : asset.evaluation.skillPct === 0 ? 'Matched the baseline' : 'AutoTS performed better'}</small></article><article><span>90% interval coverage</span><strong>{asset.evaluation.intervalCoveragePct.toFixed(0)}%</strong><small>Observed on just 10 test days</small></article></div></section>
            </> : <div className={styles.empty}><h3>Forecast not available for this asset yet.</h3><p>The live top 10 can change between training runs. The next successful training run will update the forecast universe.</p></div>}
          </div>
        </div>
        <section id="methodology" className={styles.methodology}><div><p className={styles.eyebrow}>BEHIND THE FORECAST</p><h2>Transparent by design.</h2><p>Price-only forecasting is an experiment, not a promise of returns. Crypto can move on events a historical model cannot anticipate. This dashboard is for research and education, not investment advice.</p></div><div className={styles.methodGrid}><article><span>01 / DATA</span><h3>Completed days only</h3><p>Up to three years of Yahoo daily closes. The unfinished UTC candle is excluded. Small older gaps may be forward-filled; recent validation and test windows must have complete data.</p></article><article><span>02 / SELECTION</span><h3>AutoTS, not hand-picked</h3><p>Naive, seasonal, trend, exponential-smoothing, and Theta families compete across three backward validation windows. sMAPE guides selection; horizontal ensembles can choose different models per asset.</p></article><article><span>03 / REALITY CHECK</span><h3>Errors stay visible</h3><p>A separate 10-day holdout tests the selected configuration. The baseline is shown even when it wins. Prediction intervals are nominal and are not calibrated guarantees; one test window is limited evidence.</p></article><article><span>04 / FRESHNESS</span><h3>Quotes ≠ retraining</h3><p>Quotes are requested every minute and may be delayed by Yahoo. Forecast training is scheduled daily at 02:23 UTC via GitHub Actions. Failed updates preserve the previous snapshot and its dates.</p></article></div></section>
        <div className={styles.dataLinks}><span>VERIFY THE FIGURES</span><a href="https://raw.githubusercontent.com/Fauzan-coder/crypto-horizon/main/data/forecasts.json" target="_blank" rel="noopener noreferrer">Forecast data & test observations ↗</a>{asset && <a href={`https://finance.yahoo.com/quote/${asset.symbol}/history/`} target="_blank" rel="noopener noreferrer">Yahoo price history ↗</a>}<a href="https://github.com/Fauzan-coder/crypto-horizon/actions/workflows/forecasts.yml" target="_blank" rel="noopener noreferrer">Training runs ↗</a></div><div className={styles.provenance}><span>FORECAST RUN / {time(data.snapshot.generatedAt)}</span><span>TRAINING / {data.snapshot.trainingDays} DAYS THROUGH {data.snapshot.trainingEnd}</span><span>{data.snapshot.modelsTested} SUCCESSFUL MODEL EVALUATIONS</span><span>{asset ? `${asset.imputedTrainingDays} FORWARD-FILLED DAYS FOR ${ticker(asset.symbol)}` : 'DAILY USD CLOSES'}</span></div>
      </>}
      <footer className={styles.footer}><Link href="/#projects">← Back to selected work</Link><span>Built by Fauzan Habib · MIT open source</span><a href="https://github.com/Fauzan-coder/crypto-horizon#methodology" target="_blank" rel="noopener noreferrer">Documentation ↗</a></footer>
    </main>
  </div>;
}
