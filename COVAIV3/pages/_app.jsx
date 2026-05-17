import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        {/* ── Primary ──────────────────────────────────────────── */}
        <title>COVAI — Reservas</title>
        <meta name="description" content="Sistema de reservas automatizado para restaurantes" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* ── Favicon ──────────────────────────────────────────── */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.svg" />

        {/* ── Theme color — warm neutral matching dashboard ─────── */}
        <meta name="theme-color" content="#EFEDE8" />
        <meta name="msapplication-TileColor" content="#1E1C1A" />

        {/* ── No indexing — internal tool ──────────────────────── */}
        <meta name="robots" content="noindex, nofollow" />

        {/* ── Remove default framework artifacts ───────────────── */}
        <meta name="generator" content="" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
