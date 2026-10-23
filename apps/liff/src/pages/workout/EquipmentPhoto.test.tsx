import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentifyEquipmentResponse } from "@gac/shared";
import { configureApi } from "../../api";
import { ExercisePicker } from "./ExercisePicker";
import { BENCH, TREADMILL, fakeApi } from "./testHelpers";

const resizePhoto = vi.hoisted(() => vi.fn());
vi.mock("../../photo", async (orig) => ({
  ...(await orig<typeof import("../../photo")>()),
  resizePhoto,
}));
const { PhotoReadError } = await import("../../photo");

const SMALL = new Blob(["small"], { type: "image/jpeg" });
const SUGGESTION = {
  nameZh: "腿推機",
  kind: "strength" as const,
  muscleGroup: "quads" as const,
  equipment: "plate_loaded_machine" as const,
};

function found(candidates = [BENCH, TREADMILL]): IdentifyEquipmentResponse {
  return {
    outcome: "found",
    equipment: "barbell",
    candidates,
    suggestion: SUGGESTION,
  };
}

function setup(
  identify: (blob: unknown) => unknown,
  props: { busy?: boolean; error?: string } = {},
) {
  const calls = fakeApi(({ path, body }) =>
    path === "/exercises/identify" ? identify(body) : [BENCH],
  );
  const onPick = vi.fn();
  const onFatal = vi.fn();
  render(
    <ExercisePicker
      onPick={onPick}
      onClose={vi.fn()}
      onFatal={onFatal}
      {...props}
    />,
  );
  return { calls, onPick, onFatal };
}

function takePhoto(name = "a.jpg") {
  fireEvent.change(screen.getByLabelText("拍器材照片"), {
    target: { files: [new File(["x"], name, { type: "image/jpeg" })] },
  });
}

beforeEach(() => {
  resizePhoto.mockReset();
  resizePhoto.mockResolvedValue(SMALL);
});

describe("ExercisePicker equipment photo", () => {
  it("uploads the resized blob as octet-stream", async () => {
    const { calls } = setup(() => found());
    takePhoto();
    expect(screen.getByText("辨識中…")).toBeInTheDocument();
    await screen.findByText("看起來是：槓鈴");
    const call = calls.find((c) => c.path === "/exercises/identify");
    expect(call?.method).toBe("POST");
    expect(call?.body).toBe(SMALL);
  });

  it("sends octet-stream content type", async () => {
    const headers: Headers[] = [];
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        if (url.endsWith("/exercises/identify")) {
          headers.push(new Headers(init?.headers));
          return new Response(JSON.stringify(found()));
        }
        return new Response("[]");
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
    render(
      <ExercisePicker onPick={vi.fn()} onClose={vi.fn()} onFatal={vi.fn()} />,
    );
    takePhoto();
    await screen.findByText("看起來是：槓鈴");
    expect(headers[0]?.get("content-type")).toBe("application/octet-stream");
  });

  it("lists candidates and picks one", async () => {
    const { onPick } = setup(() => found());
    takePhoto();
    await screen.findByText("看起來是：槓鈴");
    const rows = within(screen.getByLabelText("候選動作")).getAllByRole(
      "button",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector("svg.illus")).toHaveAttribute("width", "40");
    fireEvent.click(rows[0]!);
    expect(onPick).toHaveBeenCalledWith(BENCH);
  });

  it("opens a prefilled custom form from the none-of-these link", async () => {
    setup(() => found());
    takePhoto();
    fireEvent.click(
      await screen.findByRole("button", { name: "都不是？建立自訂動作" }),
    );
    expect(screen.getByLabelText("中文名稱")).toHaveValue("腿推機");
    expect(screen.getByLabelText("器材")).toHaveValue("plate_loaded_machine");
    expect(screen.getByLabelText("肌群")).toHaveValue("quads");
    expect(screen.getByLabelText("英文名稱（選填）")).toHaveValue("");
  });

  it("offers a primary custom button when no candidates", async () => {
    setup(() => found([]));
    takePhoto();
    expect(
      await screen.findByText("動作庫裡沒有這台器材的動作"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "建立自訂動作" }));
    expect(screen.getByLabelText("中文名稱")).toHaveValue("腿推機");
  });

  const failures: [string, () => unknown, string][] = [
    [
      "limit",
      () => ({ outcome: "limit" }),
      "今天的照片辨識次數用完了（和餐點照片共用），明天再試，或用搜尋找動作。",
    ],
    [
      "not_equipment",
      () => ({ outcome: "not_equipment" }),
      "這張照片看不出是什麼健身器材，換個角度再拍一次，或用搜尋找動作。",
    ],
    [
      "invalid_image",
      () => ({ outcome: "invalid_image" }),
      "這張照片沒辦法讀取，請換一張再試。",
    ],
    [
      "refused",
      () => ({ outcome: "refused" }),
      "這張照片沒辦法處理，換一張再試試。",
    ],
    [
      "unavailable",
      () => ({ outcome: "unavailable" }),
      "AI 暫時忙不過來，請稍後再試。",
    ],
    [
      "http 500",
      () => new Response("x", { status: 500 }),
      "AI 暫時忙不過來，請稍後再試。",
    ],
    [
      "http 413",
      () => new Response("x", { status: 413 }),
      "這張照片沒辦法讀取，請換一張再試。",
    ],
    [
      "http 429",
      () => new Response("x", { status: 429 }),
      "操作太頻繁，請稍等一分鐘再試。",
    ],
  ];
  it.each(failures)("shows the %s message", async (_n, reply, text) => {
    setup(reply);
    takePhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("shows the unreadable message when resizing fails", async () => {
    resizePhoto.mockRejectedValue(new PhotoReadError());
    setup(() => found());
    takePhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "這張照片沒辦法讀取，請換一張再試。",
    );
  });

  it("shows the busy message on a network error", async () => {
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async (url: string) => {
        if (url.endsWith("/exercises/identify")) throw new TypeError("net");
        return new Response("[]");
      }) as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
    render(
      <ExercisePicker onPick={vi.fn()} onClose={vi.fn()} onFatal={vi.fn()} />,
    );
    takePhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI 暫時忙不過來，請稍後再試。",
    );
  });

  it("calls onFatal when the session expired", async () => {
    const { onFatal } = setup(() => new Response("x", { status: 401 }));
    takePhoto();
    await waitFor(() => expect(onFatal).toHaveBeenCalled());
  });

  it("disables the photo button while busy", () => {
    setup(() => found(), { busy: true });
    expect(screen.getByRole("button", { name: "📷 拍器材" })).toBeDisabled();
  });

  it("clears the input so the same photo can be chosen again", async () => {
    setup(() => found());
    const input = screen.getByLabelText<HTMLInputElement>("拍器材照片");
    takePhoto();
    await screen.findByText("看起來是：槓鈴");
    expect(input.value).toBe("");
  });

  it("uses only the latest response when two photos overlap", async () => {
    const resolvers: ((blob: Blob) => void)[] = [];
    resizePhoto.mockImplementation(
      () => new Promise<Blob>((r) => resolvers.push(r)),
    );
    const first = new Blob(["1"]);
    const second = new Blob(["2"]);
    setup((body) =>
      body === first ? { outcome: "not_equipment" } : found([BENCH]),
    );
    takePhoto("1.jpg");
    takePhoto("2.jpg");
    resolvers[1]!(second);
    await screen.findByText("看起來是：槓鈴");
    resolvers[0]!(first);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("看起來是：槓鈴")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("returns to the search view", async () => {
    const { calls } = setup(() => ({ outcome: "not_equipment" }));
    takePhoto();
    await screen.findByRole("alert");
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到搜尋" }));
    expect(screen.getByRole("search")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("搜尋動作"), {
      target: { value: "bench" },
    });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe("/exercises?kind=strength&q=bench"),
    );
  });

  it("retake button opens the file chooser", async () => {
    setup(() => ({ outcome: "not_equipment" }));
    const input = screen.getByLabelText<HTMLInputElement>("拍器材照片");
    const click = vi.spyOn(input, "click");
    takePhoto();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "重新拍" }));
    expect(click).toHaveBeenCalled();
  });

  it("disables candidate rows while busy", async () => {
    setup(() => found(), { busy: true });
    takePhoto();
    await screen.findByText("看起來是：槓鈴");
    const rows = within(screen.getByLabelText("候選動作")).getAllByRole(
      "button",
    );
    for (const row of rows) expect(row).toBeDisabled();
  });

  it("shows a failed-add error in the found view", async () => {
    setup(() => found(), { error: "加入失敗" });
    takePhoto();
    await screen.findByText("看起來是：槓鈴");
    expect(screen.getByRole("alert")).toHaveTextContent("加入失敗");
  });

  it("cancel from a photo-opened form returns to the photo result", async () => {
    const { calls } = setup(() => found());
    takePhoto();
    fireEvent.click(
      await screen.findByRole("button", { name: "都不是？建立自訂動作" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("看起來是：槓鈴")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/exercises/identify")).toHaveLength(
      1,
    );
  });

  it("cancel from the normal custom entry returns to search", async () => {
    setup(() => found());
    fireEvent.click(
      await screen.findByRole("button", { name: "新增自訂動作" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("search")).toBeInTheDocument();
  });
});
