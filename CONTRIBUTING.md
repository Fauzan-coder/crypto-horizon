# Contributing

Open an issue describing the problem and the evaluation method, or submit a focused pull request. Use Python 3.12 and Node 22+.

Run the Python tests and the dashboard production build described in the README. Do not train on held-out observations, interpolate from future values, overwrite archived forecast vintages, or hide baseline losses. Changes to selection criteria must be evaluated on new untouched periods; reusing one holdout to tune a model makes it part of training.

Keep all timestamps explicit in UTC. Never label bundled or stale data as live. Keep risk statements and source attribution factual and concise. Avoid adding paid services or secrets as default requirements.
