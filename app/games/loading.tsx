import storeMessages from "@/public/locales/games/en.json";

export default function GamesLoading() {
  return <main className="games-route"><section className="games-loading-panel" role="status" aria-live="polite"><span className="games-loading-mark" aria-hidden="true" /><p>{storeMessages["gamesRecovery.loading"]}</p></section></main>;
}
