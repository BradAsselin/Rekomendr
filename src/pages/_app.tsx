import "../styles/global.css";
import type { AppProps } from "next/app";
import TierBadge from "../components/TierBadge";

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <TierBadge />
    </>
  );
}

export default MyApp;
