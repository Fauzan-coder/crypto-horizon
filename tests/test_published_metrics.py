"""Independently recalculate published headline metrics from each test observation."""
import json
from pathlib import Path
import numpy as np
import pytest


def test_all_published_metrics_match_their_observations():
    snapshot = json.loads(Path('data/forecasts.json').read_text())
    assert len(snapshot['assets']) == 10
    for asset in snapshot['assets']:
        score = asset['evaluation']
        rows = score['observations']
        assert len(rows) == 10
        actual = np.array([row['actual'] for row in rows])
        predicted = np.array([row['predicted'] for row in rows])
        baseline = np.array([row['baseline'] for row in rows])
        mae = np.mean(np.abs(actual - predicted))
        baseline_mae = np.mean(np.abs(actual - baseline))
        assert score['mae'] == pytest.approx(mae)
        assert score['rmse'] == pytest.approx(np.sqrt(np.mean((actual - predicted) ** 2)))
        assert score['mape'] == pytest.approx(np.mean(np.abs((actual - predicted) / actual)) * 100)
        assert score['baselineMae'] == pytest.approx(baseline_mae)
        assert score['baselineMape'] == pytest.approx(np.mean(np.abs((actual - baseline) / actual)) * 100)
        assert len(asset['forecast']) == 10
        assert asset['history'][-1]['date'] == snapshot['trainingEnd']
        assert asset['lastClose'] == asset['history'][-1]['price']
