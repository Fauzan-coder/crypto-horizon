from types import SimpleNamespace
import numpy as np
import pandas as pd
import pytest
from pipeline.forecast import completed_prices, split_holdout, metrics, points


def test_incomplete_day_and_invalid_prices_never_enter_training():
    dates = pd.date_range('2026-01-01', periods=5, tz='UTC')
    raw = pd.Series([10, np.inf, -1, 12, 999], index=dates)
    clean = completed_prices(raw, pd.Timestamp('2026-01-05'))
    assert clean.tolist() == [10, 12]
    assert clean.index[-1] == pd.Timestamp('2026-01-04')


def test_holdout_is_strictly_future_to_selection_and_not_mutated():
    frame = pd.DataFrame({'BTC-USD': np.arange(250)}, index=pd.date_range('2025-01-01', periods=250))
    train, holdout = split_holdout(frame)
    assert len(holdout) == 10 and len(train) == 240
    assert train.index.max() < holdout.index.min()
    train.iloc[-1, 0] = -10
    assert frame.iloc[239, 0] == 239


def test_no_claim_of_improvement_when_baseline_wins():
    score = metrics([100., 100.], [105., 110.], [90., 90.], [120., 120.], 101.)
    assert score['mae'] == 7.5 and score['baselineMae'] == 1
    assert score['skillPct'] < 0
    assert score['intervalCoveragePct'] == 100
    assert metrics([100.], [100.], [90.], [110.], 100.)['skillPct'] is None


def test_forecast_rejects_bad_horizon_and_inverted_intervals():
    def forecast(n, lower=90):
        df = pd.DataFrame({'BTC-USD': [100.] * n}, index=pd.date_range('2026-01-01', periods=n))
        return SimpleNamespace(forecast=df, lower_forecast=df * 0 + lower, upper_forecast=df * 0 + 110)
    with pytest.raises(ValueError):
        points(forecast(9), 'BTC-USD')
    with pytest.raises(ValueError):
        points(forecast(10, 105), 'BTC-USD')
    assert len(points(forecast(10), 'BTC-USD')) == 10
