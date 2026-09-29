import { db } from "./client.js";
import { insertWord } from "./wordsRepo.js";

const SEED_WORDS: Array<{ text: string; category: "noun" | "phrase"; weight: 1 | 2 | 3 | 4 | 5 }> = [
  { text: "вода", category: "noun", weight: 1 },
  { text: "стол", category: "noun", weight: 1 },
  { text: "дерево", category: "noun", weight: 1 },
  { text: "телефон", category: "noun", weight: 2 },
  { text: "холодильник", category: "noun", weight: 2 },
  { text: "белая ворона", category: "phrase", weight: 2 },
  { text: "фотосинтез", category: "noun", weight: 3 },
  { text: "куриная слепота", category: "phrase", weight: 3 },
  { text: "меридиан", category: "noun", weight: 3 },
  { text: "аллегория", category: "noun", weight: 4 },
  { text: "аберрация", category: "noun", weight: 4 },
  { text: "яблоко раздора", category: "phrase", weight: 4 },
  { text: "дисперсия", category: "noun", weight: 5 },
  { text: "аннексия", category: "noun", weight: 5 },
  { text: "прокрастинация", category: "noun", weight: 5 },
  { text: "гордиев узел", category: "phrase", weight: 5 },
  { text: "хлеб", category: "noun", weight: 1 },
  { text: "рюкзак", category: "noun", weight: 2 },
];

function main() {
  db.exec("DELETE FROM words");
  for (const word of SEED_WORDS) {
    insertWord(word);
  }
  console.log(`Seeded ${SEED_WORDS.length} words.`);
}

main();
