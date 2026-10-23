import { Inter } from 'next/font/google';

/**
 * Inter, self-hosted by next/font at build time (no request to Google from the browser; CSP font-src 'self').
 * The variable name must equal @nile/ui FONT_VARIABLE (theme.css reads it); next/font needs literal options.
 */
export const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
