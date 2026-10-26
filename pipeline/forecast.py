"""Yahoo Finance -> AutoTS -> independently evaluated 10-day forecasts.

Run: python -m pipeline.forecast --generations 3
No API keys, trade execution, or fabricated fallback forecasts.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import time
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
from autots import AutoTS
import yfinance as yf

LOG = logging.getLogger(__name__)
HORIZON = 10
INTERVAL = 0.90
MODELS = ['LastValueNaive', 'AverageValueNaive', 'SeasonalNaive', 'GLS', 'ETS', 'Theta']
SCREENER = ('https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved'
            '?scrIds=all_cryptocurrencies_us&count=25&sortField=intradaymarketcap&sortAsc=false')


def universe() -> list[dict]:
    request = Request(SCREENER, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(request, timeout=30) as response:
        quotes = json.load(response)['finance']['result'][0]['quotes']
    quotes = sorted((q for q in quotes if q.get('marketCap', 0) > 0 and q['symbol'].endswith('-USD')),
                    key=lambda q: q['marketCap'], reverse=True)[:10]
    if len(quotes) != 10:
        raise ValueError('Yahoo did not return 10 ranked USD cryptocurrency pairs')
    return [dict(symbol=q['symbol'], name=q.get('shortName') or q['symbol'],
                 rank=i + 1, marketCap=q['marketCap']) for i, q in enumerate(quotes)]


def completed_prices(raw: pd.Series, today: pd.Timestamp) -> pd.Series:
    """Exclude the unfinished UTC candle before any selection or evaluation."""
    clean = raw.copy()
    clean.index = pd.to_datetime(clean.index, utc=True).tz_convert(None).normalize()
    clean = pd.to_numeric(clean, errors='coerce').replace([np.inf, -np.inf], np.nan)
    clean = clean[~clean.index.duplicated(keep='last')].sort_index()
    return clean[(clean.index < today) & (clean > 0)].dropna()


def load_history(assets: list[dict], today: pd.Timestamp) -> tuple[pd.DataFrame, dict]:
    series = []
    for asset in assets:
        LOG.info('Downloading %s', asset['symbol'])
        error = None
        for attempt in range(3):
            try:
                raw = yf.Ticker(asset['symbol']).history(period='3y', interval='1d', auto_adjust=False)
                price = completed_prices(raw['Close'], today)
                if len(price) < 200:
                    raise ValueError('Need at least 200 completed daily observations')
                if price.index[-1] != today - pd.Timedelta(days=1):
                    raise ValueError('Latest completed UTC daily candle is missing')
                series.append(price.rename(asset['symbol']))
                break
            except Exception as exc:
                error = exc
                if attempt == 2:
                    raise RuntimeError(f"Cannot train {asset['symbol']}: {error}") from exc
                time.sleep(2 ** attempt)
    frame = pd.concat(series, axis=1).asfreq('D')
    frame = frame.loc[max(s.first_valid_index() for s in series):]
    missing = frame.isna().sum().to_dict()
    # Never score imputed observations in the recent holdout/validation windows.
    if frame.tail(40).isna().any().any():
        raise ValueError('Recent validation/holdout candles contain gaps')
    frame = frame.ffill(limit=2)
    if frame.isna().any().any():
        raise ValueError('Historical gap exceeds two days; refusing to silently interpolate')
    return frame, {key: int(value) for key, value in missing.items()}


def split_holdout(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    if len(frame) < 200:
        raise ValueError('Need at least 200 days for model selection and holdout evaluation')
    return frame.iloc[:-HORIZON].copy(), frame.iloc[-HORIZON:].copy()


def metrics(actual, predicted, lower, upper, anchor: float) -> dict:
    actual, predicted, lower, upper = map(np.asarray, (actual, predicted, lower, upper))
    if not all(np.isfinite(a).all() for a in (actual, predicted, lower, upper)) or np.any(actual <= 0):
        raise ValueError('Invalid evaluation observations')
    naive = np.full_like(actual, anchor, dtype=float)
    mae = float(np.mean(np.abs(actual - predicted)))
    baseline_mae = float(np.mean(np.abs(actual - naive)))
    return {
        'mae': mae,
        'rmse': float(np.sqrt(np.mean((actual - predicted) ** 2))),
        'mape': float(np.mean(np.abs((actual - predicted) / actual)) * 100),
        'baselineMae': baseline_mae,
        'baselineMape': float(np.mean(np.abs((actual - naive) / actual)) * 100),
        'skillPct': (1 - mae / baseline_mae) * 100 if baseline_mae > 1e-12 else None,
        'intervalCoveragePct': float(np.mean((actual >= lower) & (actual <= upper)) * 100),
        'days': len(actual),
    }


def points(prediction, symbol: str) -> list[dict]:
    if len(prediction.forecast) != HORIZON:
        raise ValueError('Forecast must contain exactly 10 calendar days')
    rows = []
    for date, value in prediction.forecast[symbol].items():
        lower = float(prediction.lower_forecast.at[date, symbol])
        upper = float(prediction.upper_forecast.at[date, symbol])
        value = float(value)
        if not np.isfinite([value, lower, upper]).all() or not 0 <= lower <= value <= upper:
            raise ValueError(f'Invalid forecast or interval for {symbol} at {date}')
        rows.append({'date': date.strftime('%Y-%m-%d'), 'price': value, 'lower': lower, 'upper': upper})
    return rows


def run(generations: int, output: Path) -> None:
    started = datetime.now(timezone.utc)
    today = pd.Timestamp(started.date())
    assets = universe()
    frame, imputed = load_history(assets, today)
    train, holdout = split_holdout(frame)
    LOG.info('Searching models on %d days; final %d days held out', len(train), len(holdout))
    model = AutoTS(
        forecast_length=HORIZON, frequency='D', prediction_interval=INTERVAL,
        model_list=MODELS, ensemble='horizontal-max', max_generations=generations,
        num_validations=3, validation_method='backwards', models_to_validate=0.25,
        transformer_list='fast', transformer_max_depth=2, no_negatives=True,
        metric_weighting={'smape_weighting': 1, 'mae_weighting': 0, 'rmse_weighting': 0,
                          'spl_weighting': 0, 'runtime_weighting': 0},
        random_seed=42, n_jobs=1, verbose=0,
    ).fit(train)
    # This holdout has never participated in AutoTS model/transformer selection.
    evaluation = model.predict()
    evaluations = {}
    for asset in assets:
        symbol = asset['symbol']
        if not evaluation.forecast.index.equals(holdout.index):
            raise ValueError('Holdout forecast dates do not match observed dates')
        scores = metrics(holdout[symbol].values, evaluation.forecast[symbol].values,
                         evaluation.lower_forecast[symbol].values,
                         evaluation.upper_forecast[symbol].values, float(train[symbol].iloc[-1]))
        evaluations[symbol] = {
            **scores, 'start': holdout.index[0].strftime('%Y-%m-%d'),
            'end': holdout.index[-1].strftime('%Y-%m-%d'),
            'observations': [dict(date=date.strftime('%Y-%m-%d'), actual=float(value),
                                  predicted=float(evaluation.forecast.at[date, symbol]),
                                  baseline=float(train[symbol].iloc[-1])) for date, value in holdout[symbol].items()],
        }
    # Refit only the chosen configuration, without searching on the holdout.
    model.model = None
    model.fit_data(frame)
    prediction = model.predict()
    if prediction.forecast.index[0] != today:
        raise ValueError('Forecast horizon is not anchored to the next unfinished daily close')
    results = model.results()
    tested = int((results['Exceptions'].isna()).sum())
    parameters = model.best_model_params
    model_map = parameters.get('series', {}) if isinstance(parameters, dict) else {}
    components = parameters.get('models', {}) if isinstance(parameters, dict) else {}
    payload = {
        'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
        'source': 'Yahoo Finance via yfinance', 'currency': 'USD', 'horizonDays': HORIZON,
        'predictionInterval': INTERVAL, 'trainingStart': frame.index[0].strftime('%Y-%m-%d'),
        'trainingEnd': frame.index[-1].strftime('%Y-%m-%d'), 'trainingDays': len(frame),
        'universeAsOf': started.isoformat(), 'modelsTested': tested, 'generations': generations,
        'validationWindows': 3, 'selectionMetric': 'sMAPE',
        'assets': [],
    }
    for asset in assets:
        symbol = asset['symbol']
        selected = components.get(model_map.get(symbol), {}).get('Model', model.best_model_name)
        payload['assets'].append({
            **asset, 'model': selected, 'lastClose': float(frame[symbol].iloc[-1]),
            'imputedTrainingDays': imputed[symbol],
            'history': [dict(date=date.strftime('%Y-%m-%d'), price=float(value))
                        for date, value in frame[symbol].tail(180).items()],
            'forecast': points(prediction, symbol), 'evaluation': evaluations[symbol],
        })
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, indent=2, allow_nan=False) + '\n')
    os.replace(temporary, output)
    # Retain dated forecast vintages for genuine forward evaluation later.
    vintage = output.parent / 'archive' / f"{today.strftime('%Y-%m-%d')}.json"
    vintage.parent.mkdir(exist_ok=True)
    if not vintage.exists():
        vintage.write_text(output.read_text())
    LOG.info('Published %s (%d assets; %d successful model evaluations)', output, len(assets), tested)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generations', type=int, default=3)
    parser.add_argument('--output', type=Path, default=Path('data/forecasts.json'))
    args = parser.parse_args()
    if not 0 <= args.generations <= 20:
        parser.error('--generations must be between 0 and 20')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    run(args.generations, args.output)
