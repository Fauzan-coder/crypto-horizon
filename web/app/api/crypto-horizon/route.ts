import { NextResponse } from 'next/server';
import fallback from './forecast-fallback.json';
import type { DashboardData, ForecastSnapshot, Quote } from '../../components/crypto/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const SNAPSHOT_URL = 'https://raw.githubusercontent.com/Fauzan-coder/crypto-horizon/main/data/forecasts.json';
const YAHOO_URL = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=all_cryptocurrencies_us&count=25&sortField=intradaymarketcap&sortAsc=false';
const stablecoins = new Set(['USDT', 'USDC', 'USDE', 'DAI', 'USDS', 'USD1', 'PYUSD', 'FDUSD', 'TUSD', 'USDG']);
function isStable(symbol: string) { return stablecoins.has(symbol.replace('-USD', '')); }

async function getSnapshot(): Promise<ForecastSnapshot> {
  const res = await fetch(SNAPSHOT_URL, { next: { revalidate: 300 }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Forecast feed returned ${res.status}`);
  const data = await res.json() as ForecastSnapshot;
  if (data.schemaVersion !== 1 || data.horizonDays !== 10 || !Array.isArray(data.assets) || data.assets.length !== 10 || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('Invalid forecast snapshot');
  if (!data.assets.every(asset => asset.forecast.length === 10 && asset.forecast.every(point => Number.isFinite(point.price) && point.lower >= 0 && point.lower <= point.price && point.price <= point.upper))) throw new Error('Invalid forecast values');
  return data;
}

async function getQuotes(): Promise<Quote[]> {
  const res = await fetch(YAHOO_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 60 }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`);
  const body = await res.json();
  const raw = body?.finance?.result?.[0]?.quotes;
  if (!Array.isArray(raw)) throw new Error('Yahoo Finance returned no quotes');
  const quotes = raw.filter(q => typeof q.symbol === 'string' && q.symbol.endsWith('-USD') && Number.isFinite(q.regularMarketPrice) && q.regularMarketPrice > 0 && Number.isFinite(q.marketCap) && q.marketCap > 0 && Number.isFinite(q.regularMarketTime)).sort((a, b) => b.marketCap - a.marketCap).slice(0, 10);
  if (quotes.length !== 10) throw new Error('Yahoo Finance returned fewer than 10 valid quotes');
  return quotes.map((q, i) => ({ symbol: q.symbol, name: q.shortName || q.symbol, rank: i + 1, price: q.regularMarketPrice,
    changePct: Number.isFinite(q.regularMarketChangePercent) ? q.regularMarketChangePercent : null,
    marketCap: q.marketCap, volume: Number.isFinite(q.regularMarketVolume) ? q.regularMarketVolume : null,
    quotedAt: new Date(q.regularMarketTime * 1000).toISOString(), stablecoin: isStable(q.symbol) }));
}

export async function GET() {
  const [forecastResult, quoteResult] = await Promise.allSettled([getSnapshot(), getQuotes()]);
  const notices: string[] = [];
  const snapshot = forecastResult.status === 'fulfilled' ? forecastResult.value : fallback as ForecastSnapshot;
  if (forecastResult.status === 'rejected') notices.push('Forecast feed unavailable. Showing the bundled snapshot with its original training date.');
  const quotes: Quote[] = quoteResult.status === 'fulfilled' ? quoteResult.value : snapshot.assets.map(asset => ({ symbol: asset.symbol, name: asset.name, rank: asset.rank, price: asset.lastClose, changePct: null, marketCap: asset.marketCap, volume: null, quotedAt: new Date(Date.parse(`${snapshot.trainingEnd}T00:00:00Z`) + 86400000).toISOString(), stablecoin: isStable(asset.symbol) }));
  if (quoteResult.status === 'rejected') notices.push('Yahoo Finance is unavailable. Displayed prices are the last completed daily closes from the forecast snapshot, not live quotes.');
  const data: DashboardData = { fetchedAt: new Date().toISOString(), quoteSource: quoteResult.status === 'fulfilled' ? 'yahoo' : 'snapshot', forecastSource: forecastResult.status === 'fulfilled' ? 'github' : 'bundled', quotes, snapshot, notices };
  return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60' } });
}
