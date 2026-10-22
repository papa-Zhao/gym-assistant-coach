import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount, fetchExport, saveFile } from "../dataRights";
import { Settings } from "./Settings";

vi.mock("../dataRights", () => ({
  fetchExport: vi.fn(),
  deleteAccount: vi.fn(),
  saveFile: vi.fn(),
}));

const TODAY = "2026-10-23";
const FAILED = "沒有成功，請稍後再試。";

/** A promise plus the function that settles it. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Settings", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.mocked(fetchExport).mockReset();
    vi.mocked(deleteAccount).mockReset();
    vi.mocked(saveFile).mockReset();
    onClose.mockReset();
  });

  const renderSettings = () =>
    render(<Settings today={TODAY} onClose={onClose} />);

  it("links profile and targets to the profile page", () => {
    renderSettings();
    expect(screen.getByRole("link", { name: /個人檔案/ })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: /每日目標/ })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("links the terms and privacy pages", () => {
    renderSettings();
    expect(screen.getByRole("link", { name: "服務條款" })).toHaveAttribute(
      "href",
      "/terms.html",
    );
    expect(screen.getByRole("link", { name: "隱私權政策" })).toHaveAttribute(
      "href",
      "/privacy.html",
    );
  });

  it("only templates are still coming soon", () => {
    renderSettings();
    const soon = screen.getByRole("button", { name: /訓練範本/ });
    expect(soon).toBeDisabled();
    expect(soon).toHaveTextContent("即將推出");
    for (const name of ["匯出我的資料", "刪除我的所有資料"]) {
      const item = screen.getByRole("button", { name });
      expect(item).toBeEnabled();
      expect(item).not.toHaveTextContent("即將推出");
    }
  });

  it("exports and saves the file", async () => {
    vi.mocked(fetchExport).mockResolvedValue({
      fileName: "gym-coach-export-2026-10-23.json",
      json: "{}",
    });
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "匯出我的資料" }));
    await waitFor(() =>
      expect(saveFile).toHaveBeenCalledWith(
        "gym-coach-export-2026-10-23.json",
        "{}",
      ),
    );
    expect(fetchExport).toHaveBeenCalledWith(TODAY);
    expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
  });

  it("disables export while it runs and shows a failure", async () => {
    const pending = deferred();
    vi.mocked(fetchExport).mockReturnValue(
      pending.promise.then(() => ({ fileName: "x", json: "" })),
    );
    renderSettings();
    const button = screen.getByRole("button", { name: "匯出我的資料" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(fetchExport).toHaveBeenCalledTimes(1);
    pending.reject(new Error("boom"));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    expect(button).toBeEnabled();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("asks before deleting; cancel goes back without deleting", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "刪除我的所有資料" }));
    expect(
      screen.getByRole("heading", { name: "確定要刪除所有資料嗎？" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "你的個人檔案、身體數據、訓練、飲食、AI 對話都會刪除，無法復原。7 天內會完全清除。",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes once, then shows the result and closes", async () => {
    const pending = deferred();
    vi.mocked(deleteAccount).mockReturnValue(pending.promise);
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "刪除我的所有資料" }));
    const confirm = screen.getByRole("button", { name: "確認刪除" });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    pending.resolve();
    expect(
      await screen.findByRole("heading", { name: "資料已刪除" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("之後再傳訊息給教練，會從頭開始。"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a failure and lets the user try again", async () => {
    vi.mocked(deleteAccount)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "刪除我的所有資料" }));
    fireEvent.click(screen.getByRole("button", { name: "確認刪除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    const confirm = screen.getByRole("button", { name: "確認刪除" });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(
      await screen.findByRole("heading", { name: "資料已刪除" }),
    ).toBeInTheDocument();
    expect(deleteAccount).toHaveBeenCalledTimes(2);
  });
});
