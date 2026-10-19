import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calcTargets,
  type ProfileInput,
  type ProfileResponse,
} from "@gac/shared";
import { configureApi } from "../api";
import { Profile } from "./Profile";

const TODAY = "2026-10-19";
const INPUT: ProfileInput = {
  sex: "male",
  birthYear: 1990,
  heightCm: 175,
  weightKg: 70,
  activityLevel: "moderate",
  goal: "maintain",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function responseFor(input: ProfileInput, overridden = false): ProfileResponse {
  const calc = calcTargets(input, TODAY);
  return {
    profile: { ...input, targetsOverridden: overridden },
    targets: calc.targets,
    floorKcal: calc.floorKcal,
    belowFloor: false,
  };
}

const EMPTY: ProfileResponse = {
  profile: null,
  targets: null,
  floorKcal: null,
  belowFloor: false,
};

type Call = { method: string; path: string; body: unknown };

describe("Profile", () => {
  let calls: Call[];
  let current: ProfileResponse;
  const onClose = vi.fn();
  const onFatal = vi.fn();

  beforeEach(() => {
    calls = [];
    onClose.mockClear();
    onFatal.mockClear();
    current = EMPTY;
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const path = url.replace("https://api.test", "");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });
      if (method === "PUT" && path === "/profile") {
        current = responseFor(body as ProfileInput);
      } else if (method === "PUT" && path === "/profile/targets") {
        current = { ...current, targets: body };
      }
      return json(current);
    };
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
  });

  const renderProfile = () =>
    render(<Profile today={TODAY} onClose={onClose} onFatal={onFatal} />);

  async function fillStepOne() {
    await screen.findByText("步驟 1／2");
    fireEvent.click(screen.getByLabelText("男"));
    fireEvent.change(screen.getByLabelText("出生年"), {
      target: { value: "1990" },
    });
    fireEvent.change(screen.getByLabelText("身高（公分）"), {
      target: { value: "175" },
    });
    fireEvent.change(screen.getByLabelText("體重（公斤）"), {
      target: { value: "70" },
    });
    fireEvent.click(screen.getByLabelText("中等（每週 3–5 天）"));
  }

  it("new user sees step 1 then step 2 with live targets", async () => {
    renderProfile();
    await fillStepOne();
    expect(screen.getByText("本服務限 18 歲以上使用。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));

    expect(screen.getByText("步驟 2／2")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "你的每日目標" }),
    ).toBeInTheDocument();
    const maintain = calcTargets(INPUT, TODAY).targets;
    expect(screen.getByText(String(maintain.kcal))).toBeInTheDocument();
    expect(screen.getByText(`${maintain.proteinG} g`)).toBeInTheDocument();
    expect(screen.getByText(/Mifflin-St Jeor 公式/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("減脂"));
    const cut = calcTargets({ ...INPUT, goal: "cut" }, TODAY).targets;
    expect(screen.getByText(String(cut.kcal))).toBeInTheDocument();
    expect(screen.getByText(`${cut.proteinG} g`)).toBeInTheDocument();
  });

  it("invalid birth year blocks next", async () => {
    renderProfile();
    await fillStepOne();
    fireEvent.change(screen.getByLabelText("出生年"), {
      target: { value: "2020" },
    });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(
      screen.getByText("出生年需讓年齡介於 18 到 100 歲之間。"),
    ).toBeInTheDocument();
    expect(screen.getByText("步驟 1／2")).toBeInTheDocument();
    expect(screen.queryByText("步驟 2／2")).not.toBeInTheDocument();
  });

  it("saving calls PUT /profile", async () => {
    renderProfile();
    await fillStepOne();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByLabelText("增肌"));
    fireEvent.click(screen.getByRole("button", { name: "就用這個目標" }));

    expect(
      await screen.findByText("完成！回到聊天室按「今日總覽」看看。"),
    ).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT");
    expect(put).toEqual({
      method: "PUT",
      path: "/profile",
      body: { ...INPUT, goal: "bulk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "回到聊天室" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("existing profile opens on step 2 with values", async () => {
    current = responseFor({ ...INPUT, goal: "cut" });
    renderProfile();
    expect(await screen.findByText("步驟 2／2")).toBeInTheDocument();
    expect(screen.getByLabelText("減脂")).toBeChecked();
    const cut = calcTargets({ ...INPUT, goal: "cut" }, TODAY).targets;
    expect(screen.getByText(String(cut.kcal))).toBeInTheDocument();
  });

  it("override below floor shows warning and still saves", async () => {
    current = responseFor(INPUT);
    renderProfile();
    await screen.findByText("步驟 2／2");
    fireEvent.click(screen.getByRole("button", { name: "手動調整數字" }));
    fireEvent.change(screen.getByLabelText("熱量（kcal）"), {
      target: { value: "1000" },
    });
    const floor = calcTargets(INPUT, TODAY).floorKcal;
    expect(
      screen.getByText(
        `低於建議的安全下限（${floor} kcal），請確認這是你想要的。`,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "儲存調整" }));
    expect(
      await screen.findByText("完成！回到聊天室按「今日總覽」看看。"),
    ).toBeInTheDocument();
    const put = calls.find((c) => c.path === "/profile/targets");
    expect(put?.method).toBe("PUT");
    expect(put?.body).toMatchObject({ kcal: 1000 });
  });

  it("reports an expired session through onFatal", async () => {
    configureApi({
      apiUrl: "https://api.test",
      fetchImpl: (async () =>
        json({ error: "unauthorized" }, 401)) as typeof fetch,
      relogin: async () => ({ kind: "error" }),
    });
    renderProfile();
    await waitFor(() => expect(onFatal).toHaveBeenCalledOnce());
  });
});
