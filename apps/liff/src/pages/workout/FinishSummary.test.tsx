import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REST_KEY } from "./restSettings";
import { FinishSummary } from "./FinishSummary";
import { SUMMARY, fakeApi } from "./testHelpers";

describe("FinishSummary", () => {
  it("finish shows 已傳到聊天室 only when notified", () => {
    const { unmount } = render(
      <FinishSummary summary={SUMMARY} onClose={vi.fn()} onFatal={vi.fn()} />,
    );
    expect(screen.getByText("已傳到聊天室")).toBeInTheDocument();
    expect(screen.getByText(/2 個動作・6 組/)).toBeInTheDocument();
    unmount();
    render(
      <FinishSummary
        summary={{ ...SUMMARY, notified: false }}
        onClose={vi.fn()}
        onFatal={vi.fn()}
      />,
    );
    expect(screen.queryByText("已傳到聊天室")).not.toBeInTheDocument();
    expect(screen.getByText("1920")).toBeInTheDocument();
  });

  it("lists PRs and closes the window", () => {
    const onClose = vi.fn();
    render(
      <FinishSummary summary={SUMMARY} onClose={onClose} onFatal={vi.fn()} />,
    );
    expect(
      screen.getByText(/80 kg × 8（估算 1RM 101.3 kg）/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到聊天室" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("save as template", async () => {
    const calls = fakeApi(() => ({ id: "t1", name: "推日", items: [] }));
    render(
      <FinishSummary summary={SUMMARY} onClose={vi.fn()} onFatal={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "存成範本" }));
    expect(screen.getByText("請輸入範本名稱")).toBeInTheDocument();
    expect(calls).toEqual([]);
    fireEvent.change(screen.getByLabelText("範本名稱"), {
      target: { value: " 推日 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "存成範本" }));
    await waitFor(() =>
      expect(screen.getByText("已存成範本")).toBeInTheDocument(),
    );
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/templates",
        body: { fromSessionId: "s1", name: "推日" },
      },
    ]);
  });

  it("finish shows average rest", () => {
    render(
      <FinishSummary
        summary={{ ...SUMMARY, avgRestSec: 95 }}
        onClose={vi.fn()}
        onFatal={vi.fn()}
      />,
    );
    expect(screen.getByText("平均休息 1:35")).toBeInTheDocument();
  });

  it("finish hides average rest when unknown", () => {
    render(
      <FinishSummary summary={SUMMARY} onClose={vi.fn()} onFatal={vi.fn()} />,
    );
    expect(screen.queryByText(/平均休息/)).not.toBeInTheDocument();
  });

  describe("訓練建議", () => {
    afterEach(() => window.localStorage.clear());
    const AI_BUTTON = "問 AI 教練";
    const renderWith = (over: Partial<typeof SUMMARY>) =>
      render(
        <FinishSummary
          summary={{ ...SUMMARY, ...over }}
          onClose={vi.fn()}
          onFatal={vi.fn()}
        />,
      );

    it("shows rule tips", () => {
      renderWith({
        tips: ["下次槓鈴臥推可以試試 62.5 kg", "總訓練量比上次多 10%"],
      });
      const card = screen.getByRole("region", { name: "訓練建議" });
      expect(card).toHaveTextContent("下次槓鈴臥推可以試試 62.5 kg");
      expect(card).toHaveTextContent("總訓練量比上次多 10%");
    });

    it("adds rest tip when average rest is 60s over target", () => {
      window.localStorage.setItem(REST_KEY, "90");
      const { unmount } = renderWith({ tips: ["a"], avgRestSec: 160 });
      expect(
        screen.getByText(
          "平均休息 2:40，比你設定的 1:30 多，可以縮短一點讓訓練更緊湊",
        ),
      ).toBeInTheDocument();
      unmount();
      renderWith({ tips: ["a"], avgRestSec: 140 });
      expect(screen.queryByText(/比你設定的/)).not.toBeInTheDocument();
    });

    it("hides AI button when not available", () => {
      renderWith({ tips: ["a"], aiAdviceAvailable: false });
      expect(
        screen.queryByRole("button", { name: AI_BUTTON }),
      ).not.toBeInTheDocument();
    });

    it("AI button shows advice", async () => {
      let resolve: (v: Response) => void = () => {};
      const calls = fakeApi(
        () =>
          new Promise<Response>((r) => {
            resolve = r;
          }) as unknown as Response,
      );
      renderWith({ tips: ["a"], aiAdviceAvailable: true });
      const button = screen.getByRole("button", { name: AI_BUTTON });
      expect(button).toHaveAccessibleDescription("會用掉 1 次問 AI 的次數");
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);
      resolve(
        new Response(
          JSON.stringify({
            outcome: "ok",
            advice: {
              title: "練得很穩",
              points: ["下次臥推試 62.5 kg", "記得補充蛋白質"],
              createdAt: "2026-10-31T00:00:00Z",
            },
          }),
        ),
      );
      await waitFor(() =>
        expect(screen.getByText("練得很穩")).toBeInTheDocument(),
      );
      expect(screen.getByText("下次臥推試 62.5 kg")).toBeInTheDocument();
      expect(screen.getByText("記得補充蛋白質")).toBeInTheDocument();
      expect(calls).toEqual([
        { method: "POST", path: "/workouts/s1/advice", body: undefined },
      ]);
      expect(
        screen.queryByRole("button", { name: AI_BUTTON }),
      ).not.toBeInTheDocument();
    });

    it("AI limit message", async () => {
      fakeApi(() => ({ outcome: "limit" }));
      renderWith({ tips: ["a"], aiAdviceAvailable: true });
      fireEvent.click(screen.getByRole("button", { name: AI_BUTTON }));
      await waitFor(() =>
        expect(
          screen.getByText("今天問 AI 的次數用完了，明天再試"),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("button", { name: AI_BUTTON }),
      ).not.toBeDisabled();
    });

    it("AI refused, unavailable and HTTP errors", async () => {
      for (const [reply, text] of [
        [{ outcome: "refused" }, "這次沒辦法產生建議，請稍後再試"],
        [{ outcome: "unavailable" }, "AI 暫時忙不過來，請稍後再試"],
        [
          new Response(JSON.stringify({ error: "too_old" }), { status: 409 }),
          "這次沒辦法產生建議，請稍後再試",
        ],
      ] as const) {
        fakeApi(() => reply);
        const { unmount } = renderWith({
          tips: ["a"],
          aiAdviceAvailable: true,
        });
        fireEvent.click(screen.getByRole("button", { name: AI_BUTTON }));
        await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
        unmount();
      }
    });
  });
});
