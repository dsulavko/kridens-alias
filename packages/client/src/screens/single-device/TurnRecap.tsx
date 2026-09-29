import { useState } from "react";
import type { Word } from "@kridens/core";

type Mark = "guessed" | "skipped";

interface TurnRecapProps {
  teamName: string;
  words: Word[];
  initialMarks: Record<number, Mark>;
  onConfirm: (marks: Record<number, Mark>) => void;
}

export default function TurnRecap({ teamName, words, initialMarks, onConfirm }: TurnRecapProps) {
  const [marks, setMarks] = useState<Record<number, Mark>>(initialMarks);

  function toggle(wordId: number) {
    setMarks((m) => ({ ...m, [wordId]: m[wordId] === "guessed" ? "skipped" : "guessed" }));
  }

  const guessedCount = Object.values(marks).filter((m) => m === "guessed").length;

  return (
    <div className="screen">
      <h2>Итог хода: {teamName}</h2>
      <p>Нажмите на слово, чтобы поправить ошибочную отметку.</p>
      <ul className="recap-list">
        {words.map((w) => (
          <li
            key={w.id}
            className={`recap-item ${marks[w.id] ?? "skipped"}`}
            onClick={() => toggle(w.id)}
          >
            {w.text}
          </li>
        ))}
      </ul>
      <p>
        Угадано: {guessedCount} · Пропущено: {words.length - guessedCount}
      </p>
      <button className="primary" onClick={() => onConfirm(marks)}>
        Готово, следующая команда
      </button>
    </div>
  );
}
