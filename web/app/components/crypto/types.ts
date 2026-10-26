export type PricePoint = { date: string; price: number };
export type ForecastPoint = PricePoint & { lower: number; upper: number };
export type Evaluation = {
  mae: number; rmse: number; mape: number; baselineMae: number; baselineMape: number;
  skillPct: number | null; intervalCoveragePct: number; days: number; start: string; end: string;
  observations: { date: string; actual: number; predicted: number; baseline: number }[];
};
export type ForecastAsset = {
  symbol: string; name: string; rank: number; marketCap: number; model: string; lastClose: number;
  imputedTrainingDays: number; history: PricePoint[]; forecast: ForecastPoint[]; evaluation: Evaluation;
};
export type ForecastSnapshot = {
  schemaVersion: number; generatedAt: string; source: string; currency: string; horizonDays: number;
  predictionInterval: number; trainingStart: string; trainingEnd: string; trainingDays: number;
  universeAsOf: string; modelsTested: number; generations: number; validationWindows: number;
  selectionMetric: string; assets: ForecastAsset[];
};
export type Quote = {
  symbol: string; name: string; rank: number; price: number; changePct: number | null;
  marketCap: number; volume: number | null; quotedAt: string; stablecoin: boolean;
};
export type DashboardData = {
  fetchedAt: string; quoteSource: 'yahoo' | 'snapshot'; forecastSource: 'github' | 'bundled';
  quotes: Quote[]; snapshot: ForecastSnapshot; notices: string[];
};
