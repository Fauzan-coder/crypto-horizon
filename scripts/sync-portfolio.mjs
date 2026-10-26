// Copy only the dashboard and its read-only API. Never copy environments or hosting identity.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const target = process.argv[2];
if (!target || !path.isAbsolute(target)) throw new Error('Usage: node scripts/sync-portfolio.mjs /absolute/portfolio/path');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(target, 'app/components/crypto'), { recursive: true });
await cp(path.join(root, 'web/app/components/crypto'), path.join(target, 'app/components/crypto'), { recursive: true });
await mkdir(path.join(target, 'app/api/crypto-horizon'), { recursive: true });
await cp(path.join(root, 'web/app/api/crypto-horizon'), path.join(target, 'app/api/crypto-horizon'), { recursive: true });
await mkdir(path.join(target, 'app/projects/crypto-horizon'), { recursive: true });
await writeFile(path.join(target, 'app/projects/crypto-horizon/page.tsx'), `import type { Metadata } from 'next';\nimport Dashboard from '../../components/crypto/Dashboard';\nexport const metadata: Metadata = { title: 'Crypto Horizon — AutoTS Forecasting | Fauzan Habib', description: 'Live cryptocurrency quotes, evaluated AutoTS ten-day forecasts, prediction intervals, and baseline comparisons for the top ten cryptocurrencies.' };\nexport default function Page() { return <Dashboard />; }\n`);
console.log('Synced dashboard, API, and portfolio project route.');
