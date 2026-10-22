import { useRef, type ChangeEvent, type ReactNode } from "react";
import {
  EQUIPMENT_LABELS,
  type Equipment,
  type Exercise,
  type ExerciseSuggestion,
  type IdentifyEquipmentResponse,
} from "@gac/shared";
import { ApiHttpError, apiFetch } from "../../api";
import { Skeleton } from "../../components/Skeleton";
import { ExerciseRow } from "./ExerciseRow";
import { PhotoReadError, resizePhoto } from "../../photo";
import { isAuthExpired } from "./fields";

const MSG_UNREADABLE = "這張照片沒辦法讀取，請換一張再試。";
const MSG_BUSY = "AI 暫時忙不過來，請稍後再試。";

const OUTCOME_MESSAGES = {
  limit:
    "今天的照片辨識次數用完了（和餐點照片共用），明天再試，或用搜尋找動作。",
  not_equipment:
    "這張照片看不出是什麼健身器材，換個角度再拍一次，或用搜尋找動作。",
  invalid_image: MSG_UNREADABLE,
  refused: "這張照片沒辦法處理，換一張再試試。",
  unavailable: MSG_BUSY,
} as const;

export type PhotoPhase =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | {
      kind: "found";
      equipment: Equipment;
      candidates: Exercise[];
      suggestion: ExerciseSuggestion;
    };

interface EquipmentPhotoProps {
  /** Lifted so the result survives opening and cancelling the custom form. */
  phase: PhotoPhase;
  onPhase: (phase: PhotoPhase) => void;
  onPick: (exercise: Exercise) => void;
  onCustom: (suggestion: ExerciseSuggestion) => void;
  onFatal: () => void;
  busy: boolean;
  /** The normal search view, shown while no photo flow is active. */
  children: ReactNode;
}

function failureMessage(err: unknown): string {
  if (err instanceof PhotoReadError) return MSG_UNREADABLE;
  if (err instanceof ApiHttpError && err.status === 413) return MSG_UNREADABLE;
  return MSG_BUSY;
}

export function EquipmentPhoto({
  phase,
  onPhase: setPhase,
  onPick,
  onCustom,
  onFatal,
  busy,
  children,
}: EquipmentPhotoProps) {
  const input = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const working = phase.kind === "working";

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const id = ++requestId.current;
    setPhase({ kind: "working" });
    void identify(file, id);
  };

  const identify = async (file: File, id: number) => {
    try {
      const blob = await resizePhoto(file);
      const res = await apiFetch<IdentifyEquipmentResponse>(
        "/exercises/identify",
        {
          method: "POST",
          body: blob,
          headers: { "content-type": "application/octet-stream" },
        },
      );
      if (id !== requestId.current) return;
      if (res.outcome === "found") {
        setPhase({
          kind: "found",
          equipment: res.equipment,
          candidates: res.candidates,
          suggestion: res.suggestion,
        });
      } else {
        setPhase({ kind: "error", message: OUTCOME_MESSAGES[res.outcome] });
      }
    } catch (err) {
      if (id !== requestId.current) return;
      if (isAuthExpired(err)) onFatal();
      else setPhase({ kind: "error", message: failureMessage(err) });
    }
  };

  const retake = () => input.current?.click();

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      capture="environment"
      aria-label="拍器材照片"
      hidden
      onChange={onFile}
    />
  );

  return (
    <>
      {fileInput}
      {phase.kind === "idle" ? (
        <>
          <div className="picker-photo">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={retake}
            >
              📷 拍器材
            </button>
          </div>
          {children}
        </>
      ) : (
        <>
          {phase.kind === "working" && (
            <section aria-label="辨識中" aria-busy="true">
              <p className="muted">辨識中…</p>
              <Skeleton layout="rows" />
            </section>
          )}
          {phase.kind === "error" && (
            <p className="error-text" role="alert">
              {phase.message}
            </p>
          )}
          {phase.kind === "found" && (
            <FoundView
              phase={phase}
              busy={busy}
              onPick={onPick}
              onCustom={onCustom}
            />
          )}
          <div className="stack picker-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || working}
              onClick={retake}
            >
              重新拍
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                requestId.current++;
                setPhase({ kind: "idle" });
              }}
            >
              回到搜尋
            </button>
          </div>
        </>
      )}
    </>
  );
}

function FoundView({
  phase,
  busy,
  onPick,
  onCustom,
}: {
  phase: Extract<PhotoPhase, { kind: "found" }>;
  busy: boolean;
  onPick: (exercise: Exercise) => void;
  onCustom: (suggestion: ExerciseSuggestion) => void;
}) {
  const { candidates, suggestion, equipment } = phase;
  if (candidates.length === 0) {
    return (
      <section className="card stack">
        <p className="muted">動作庫裡沒有這台器材的動作</p>
        <button type="button" onClick={() => onCustom(suggestion)}>
          建立自訂動作
        </button>
      </section>
    );
  }
  return (
    <>
      <h2>看起來是：{EQUIPMENT_LABELS[equipment]}</h2>
      <section className="card list picker-list" aria-label="候選動作">
        {candidates.map((ex) => (
          <ExerciseRow
            key={ex.id}
            exercise={ex}
            disabled={busy}
            onPick={onPick}
          />
        ))}
      </section>
      <button
        type="button"
        className="secondary picker-actions"
        onClick={() => onCustom(suggestion)}
      >
        都不是？建立自訂動作
      </button>
    </>
  );
}
