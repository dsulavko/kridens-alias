export type AdminView = "words" | "categories" | "collections";

interface AdminSidebarProps {
  view: AdminView;
  onChangeView: (view: AdminView) => void;
  onLogout: () => void;
}

const NAV_ITEMS: { key: AdminView; label: string }[] = [
  { key: "words", label: "Слова" },
  { key: "categories", label: "Категории" },
  { key: "collections", label: "Коллекции" },
];

export default function AdminSidebar({ view, onChangeView, onLogout }: AdminSidebarProps) {
  return (
    <nav className="admin-sidebar">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          className={`admin-nav-item${view === item.key ? " active" : ""}`}
          onClick={() => onChangeView(item.key)}
        >
          {item.label}
        </button>
      ))}
      <button className="admin-nav-item admin-nav-logout" onClick={onLogout}>
        Выйти
      </button>
    </nav>
  );
}
