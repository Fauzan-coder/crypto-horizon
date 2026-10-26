import { Anton, Space_Grotesk } from 'next/font/google';
import './globals.css';
const anton = Anton({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-anton' });
const space = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-space' });
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body className={`${anton.variable} ${space.variable}`}>{children}</body></html>; }
