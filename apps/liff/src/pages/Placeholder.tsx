interface PlaceholderProps {
  title: string;
  onClose: () => void;
}

export function Placeholder({ title, onClose }: PlaceholderProps) {
  return (
    <main>
      <section className="card">
        <h1>{title}</h1>
        <p>這個功能即將推出，敬請期待。</p>
        <button type="button" onClick={onClose}>
          回到聊天室
        </button>
      </section>
    </main>
  );
}
