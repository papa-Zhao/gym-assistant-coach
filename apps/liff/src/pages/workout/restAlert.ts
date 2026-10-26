/** Vibration pattern for the end of a rest: buzz, pause, buzz, pause, buzz. */
export const REST_END_VIBRATION: readonly number[] = [300, 150, 300, 150, 300];

const BEEP_HZ = 880;
const BEEP_SEC = 0.15;
const BEEP_GAP_SEC = 0.15;
const BEEP_COUNT = 3;
const BEEP_GAIN = 0.3;

type AudioContextCtor = typeof AudioContext;

// Shared so a context unlocked by a tap can play later without a gesture.
let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

/** Call from a user gesture: creates or resumes the shared audio context. */
export function unlockRestSound(): void {
  try {
    const session = (
      navigator as unknown as { audioSession?: { type: string } }
    ).audioSession;
    // Let the beeps mix with the user's music instead of pausing it.
    if (session) session.type = "transient";
    const ctx = getContext();
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
  } catch {
    // Audio is a nice-to-have; never break the workout flow.
  }
}

/** Three short beeps; does nothing when no context was unlocked. */
export function playRestEndSound(): void {
  try {
    const ctx = audioCtx;
    if (!ctx) return;
    const start = ctx.currentTime;
    for (let i = 0; i < BEEP_COUNT; i++) {
      const at = start + i * (BEEP_SEC + BEEP_GAP_SEC);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = BEEP_HZ;
      gain.gain.value = BEEP_GAIN;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + BEEP_SEC);
    }
  } catch {
    // Ignore playback failures.
  }
}

/** Vibrates (when supported) and optionally beeps. Never throws. */
export function alertRestEnd(opts: { sound: boolean }): void {
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([...REST_END_VIBRATION]);
    }
  } catch {
    // Ignore vibration failures.
  }
  if (opts.sound) playRestEndSound();
}
