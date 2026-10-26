import type { Metadata } from 'next';
import Dashboard from './components/crypto/Dashboard';
export const metadata: Metadata = { title: 'Crypto Horizon — AutoTS Forecasting | Fauzan Habib', description: 'Live Yahoo Finance cryptocurrency quotes, evaluated AutoTS ten-day daily-close forecasts, model intervals, and honest baseline comparisons for the top ten cryptocurrencies.' };
export default function Page() { return <Dashboard />; }
