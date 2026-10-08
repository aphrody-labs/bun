import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <div id="app-shell">
      <Head>
        <title>Bun Pages Router</title>
      </Head>
      <Component {...pageProps} />
    </div>
  );
}
