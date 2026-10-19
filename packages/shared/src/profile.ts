import type { ProfileInput, Targets } from "./targets";

export interface ProfileResponse {
  profile: (ProfileInput & { targetsOverridden: boolean }) | null;
  targets: Targets | null;
  floorKcal: number | null;
  belowFloor: boolean;
}

export interface TodayResponse {
  hasProfile: boolean;
  date: string;
  targets: Targets | null;
  consumed: Targets;
  workoutSummary: string | null;
  weightKg: number | null;
  streakDays: number;
}
