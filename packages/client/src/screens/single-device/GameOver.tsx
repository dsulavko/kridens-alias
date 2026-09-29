import type { TeamState } from "@kridens/core";

interface GameOverProps {
  teams: TeamState[];
  winnerId: string;
  onPlayAgain: () => void;
  onNewSetup: () => void;
  onExit: () => void;
}

export default function GameOver({ teams, winnerId, onPlayAgain, onNewSetup, onExit }: GameOverProps) {
  const winner = teams.find((t) => t.id === winnerId);
  const sorted = [...teams].sort((a, b) => b.score - a.score);

  return (
    <div className="screen">
      <h2>🏆 Победила команда «{winner?.name}»!</h2>
      <ul className="scoreboard gameover-score">
        {sorted.map((t) => (
          <li key={t.id}>
            {t.name}: {t.score}
          </li>
        ))}
      </ul>
      <button className="primary" onClick={onPlayAgain}>
        Играть снова
      </button>
      <button onClick={onNewSetup}>Новые настройки</button>
      <button className="exit" onClick={onExit}>
        В меню
      </button>
    </div>
  );
}
