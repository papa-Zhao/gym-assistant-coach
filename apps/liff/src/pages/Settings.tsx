const SOON = ["匯出我的資料", "刪除我的所有資料", "訓練範本"] as const;

export function Settings() {
  return (
    <main>
      <h1>設定</h1>
      <section className="card list">
        <h2>我的資料</h2>
        <a className="row" href="/profile">
          個人檔案
        </a>
        <a className="row" href="/profile">
          每日目標
        </a>
      </section>
      <section className="card list">
        <h2>更多</h2>
        {SOON.map((label) => (
          <button key={label} type="button" className="row" disabled>
            <span>{label}</span>
            <span className="badge">即將推出</span>
          </button>
        ))}
      </section>
      <section className="card list">
        <h2>關於</h2>
        <a className="row" href="/terms.html">
          服務條款
        </a>
        <a className="row" href="/privacy.html">
          隱私權政策
        </a>
      </section>
    </main>
  );
}
