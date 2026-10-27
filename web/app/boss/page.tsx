import BossEncounter from "./boss-encounter";
import "./boss.css";

export default async function BossPage({
  searchParams,
}: {
  searchParams?: Promise<{ opponent?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const opp = resolved?.opponent;
  const validOpponent =
    opp === "diddy" || opp === "epstein" ? opp : "kirkify";
  return <BossEncounter initialOpponent={validOpponent} />;
}
