"""Verify the snapshot's stored holdout closes against fresh Yahoo observations.

Run from the repository root: python scripts/audit_data.py
Yahoo can revise historical data; a mismatch is reported, never silently hidden.
"""
from datetime import timedelta
import json
from pathlib import Path
import numpy as np
import pandas as pd
import yfinance as yf

snapshot = json.loads(Path('data/forecasts.json').read_text())
for asset in snapshot['assets']:
    rows = asset['evaluation']['observations']
    start = rows[0]['date']
    end = (pd.Timestamp(rows[-1]['date']) + timedelta(days=1)).strftime('%Y-%m-%d')
    fresh = yf.Ticker(asset['symbol']).history(start=start, end=end, interval='1d', auto_adjust=False)['Close']
    fresh.index = pd.to_datetime(fresh.index, utc=True).tz_convert(None).normalize()
    dates = pd.to_datetime([row['date'] for row in rows])
    observed = fresh.reindex(dates).to_numpy()
    recorded = np.array([row['actual'] for row in rows])
    np.testing.assert_allclose(observed, recorded, rtol=1e-6, atol=1e-8,
                               err_msg=f"Yahoo history mismatch for {asset['symbol']}")
    print(f"{asset['symbol']}: all 10 held-out observations match fresh Yahoo history")
print('Source-data audit passed for all 10 assets.')
