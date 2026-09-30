interface HomeProps {
  onSelect: (mode: "single" | "multiplayer") => void;
}

export default function Home({ onSelect }: HomeProps) {
  return (
    <div className="screen">
      <div className="logo">
        <h1>
          Kridens <span className="gradient-text">Alias</span>
        </h1>
      </div>
      <div className="mode-buttons">
        <button className="mode-card primary" onClick={() => onSelect("single")}>
          <strong>Одиночный режим</strong>
          <span>Один телефон по кругу</span>
        </button>
        <button className="mode-card secondary" onClick={() => onSelect("multiplayer")}>
          <strong>Мультиплеер</strong>
          <span>Комнаты по коду, каждый со своего устройства</span>
        </button>
      </div>
    </div>
  );
}
