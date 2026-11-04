import { useState } from "react";
import { deleteAccount, fetchExport, saveFile } from "../dataRights";
import { Icon, type IconName } from "../components/Icon";

const SOON = ["訓練範本"] as const;
const FAILED = "沒有成功，請稍後再試。";

interface SettingsProps {
  /** Taipei calendar date (`YYYY-MM-DD`) for the export file name. */
  today: string;
  onClose: () => void;
}

type View = "main" | "confirm" | "deleted";

export function Settings({ today, onClose }: SettingsProps) {
  const [view, setView] = useState<View>("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const exportData = async () => {
    setBusy(true);
    setError(false);
    try {
      const { fileName, json } = await fetchExport(today);
      saveFile(fileName, json);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setError(false);
    try {
      await deleteAccount();
      setView("deleted");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (view === "deleted") {
    return (
      <main>
        <section className="card stack">
          <h1>資料已刪除</h1>
          <p>之後再傳訊息給教練，會從頭開始。</p>
          <button type="button" onClick={onClose}>
            關閉
          </button>
        </section>
      </main>
    );
  }

  if (view === "confirm") {
    return (
      <main>
        <section className="card stack">
          <h1>確定要刪除所有資料嗎？</h1>
          <p>
            你的個人檔案、身體數據、訓練、飲食、AI 對話都會刪除，無法復原。7
            天內會完全清除。
          </p>
          {error && (
            <p className="error-text" role="alert">
              {FAILED}
            </p>
          )}
          <div className="confirm-actions">
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={confirmDelete}
            >
              確認刪除
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setError(false);
                setView("main");
              }}
            >
              取消
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="settings">
      <h1>設定</h1>
      <section className="card list">
        <h2>我的資料</h2>
        <a className="row" href="/profile">
          <RowIcon name="user" />
          <span className="row-name">個人檔案</span>
          <Icon name="chevronRight" className="row-chevron" />
        </a>
        <a className="row" href="/profile">
          <RowIcon name="target" />
          <span className="row-name">每日目標</span>
          <Icon name="chevronRight" className="row-chevron" />
        </a>
      </section>
      <section className="card list">
        <h2>更多</h2>
        <button
          type="button"
          className="row"
          disabled={busy}
          onClick={exportData}
        >
          <RowIcon name="download" />
          <span className="row-name">匯出我的資料</span>
        </button>
        {SOON.map((label) => (
          <button key={label} type="button" className="row" disabled>
            <RowIcon name="layers" />
            <span className="row-name">{label}</span>
            <span className="badge">即將推出</span>
          </button>
        ))}
        <button
          type="button"
          className="row danger-row"
          disabled={busy}
          onClick={() => {
            setError(false);
            setView("confirm");
          }}
        >
          <RowIcon name="trash" />
          <span className="row-name">刪除我的所有資料</span>
        </button>
        {error && (
          <p className="error-text" role="alert">
            {FAILED}
          </p>
        )}
      </section>
      <section className="card list">
        <h2>關於</h2>
        <a className="row" href="/terms.html">
          <RowIcon name="file" />
          <span className="row-name">服務條款</span>
          <Icon name="chevronRight" className="row-chevron" />
        </a>
        <a className="row" href="/privacy.html">
          <RowIcon name="shield" />
          <span className="row-name">隱私權政策</span>
          <Icon name="chevronRight" className="row-chevron" />
        </a>
      </section>
    </main>
  );
}

function RowIcon({ name }: { name: IconName }) {
  return (
    <span className="row-icon">
      <Icon name={name} size={18} />
    </span>
  );
}
