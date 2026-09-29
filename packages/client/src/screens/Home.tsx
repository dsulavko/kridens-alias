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
          <span className="icon">
            <PhoneIcon />
          </span>
          <span>
            <strong>Одиночный режим</strong>
            <span>Один телефон по кругу</span>
          </span>
        </button>
        <button className="mode-card secondary" onClick={() => onSelect("multiplayer")}>
          <span className="icon">
            <RoomIcon />
          </span>
          <span>
            <strong>Мультиплеер</strong>
            <span>Комната по коду, каждый со своего устройства</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <line x1="10" y1="19" x2="14" y2="19" />
    </svg>
  );
}

function RoomIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M3 20c0-3 2.5-5 5-5s5 2 5 5" />
      <path d="M11 20c0-3 2.5-5 5-5s5 2 5 5" />
    </svg>
  );
}
