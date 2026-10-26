import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shared AudioContext lives at module level, so reload per test.
let REST_END_VIBRATION: typeof import("./restAlert").REST_END_VIBRATION;
let alertRestEnd: typeof import("./restAlert").alertRestEnd;
let playRestEndSound: typeof import("./restAlert").playRestEndSound;
let unlockRestSound: typeof import("./restAlert").unlockRestSound;

beforeEach(async () => {
  vi.resetModules();
  ({ REST_END_VIBRATION, alertRestEnd, playRestEndSound, unlockRestSound } =
    await import("./restAlert"));
});

const created: FakeAudioContext[] = [];

class FakeAudioContext {
  currentTime = 10;
  state = "suspended";
  destination = {};
  oscillators: {
    type: string;
    frequency: { value: number };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  createOscillator = vi.fn(() => {
    const osc = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(osc);
    return osc;
  });
  createGain = vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() }));
  resume = vi.fn(() => Promise.resolve());
  constructor() {
    created.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  created.length = 0;
  Reflect.deleteProperty(navigator, "vibrate");
});

describe("restAlert", () => {
  it("alertRestEnd vibrates with the pattern", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });
    alertRestEnd({ sound: false });
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([300, 150, 300, 150, 300]);
    expect(REST_END_VIBRATION).toEqual([300, 150, 300, 150, 300]);
  });

  it("alertRestEnd without vibrate API does not throw", () => {
    Reflect.deleteProperty(navigator, "vibrate");
    expect(() => alertRestEnd({ sound: true })).not.toThrow();
  });

  it("playRestEndSound schedules three beeps", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    unlockRestSound();
    playRestEndSound();
    const ctx = created[0]!;
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
    const starts = ctx.oscillators.map((o) => o.start.mock.calls[0]![0]);
    expect(ctx.oscillators.every((o) => o.frequency.value === 880)).toBe(true);
    expect(starts[1]! - starts[0]!).toBeCloseTo(0.3);
    expect(starts[2]! - starts[1]!).toBeCloseTo(0.3);
    expect(ctx.oscillators[0]!.stop.mock.calls[0]![0]).toBeCloseTo(
      starts[0]! + 0.15,
    );
  });

  it("unlockRestSound reuses one context and resumes it", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    unlockRestSound();
    unlockRestSound();
    expect(created).toHaveLength(1);
    expect(created[0]!.resume).toHaveBeenCalled();
  });

  it("sound off skips audio", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    unlockRestSound();
    alertRestEnd({ sound: false });
    expect(created[0]!.createOscillator).not.toHaveBeenCalled();
  });

  it("never throws when the audio API breaks", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("nope");
        }
      },
    );
    expect(() => unlockRestSound()).not.toThrow();
    expect(() => playRestEndSound()).not.toThrow();
  });
});
