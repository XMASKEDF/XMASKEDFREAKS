export type DepositFrequency = "manual" | "hourly" | "every_4_hours" | "every_8_hours" | "every_12_hours" | "daily" | "weekly" | "monthly";

export type DepositScheduleOption = {
  value: DepositFrequency;
  label: string;
  minutes: number | null;
};

export const depositScheduleOptions: DepositScheduleOption[] = [
  { value: "manual", label: "Manual", minutes: null },
  { value: "hourly", label: "Every Hour", minutes: 60 },
  { value: "every_4_hours", label: "Every 4 Hours", minutes: 240 },
  { value: "every_8_hours", label: "Every 8 Hours", minutes: 480 },
  { value: "every_12_hours", label: "Every 12 Hours", minutes: 720 },
  { value: "daily", label: "Daily", minutes: 1440 },
  { value: "weekly", label: "Weekly", minutes: 10_080 },
  { value: "monthly", label: "Monthly", minutes: 43_200 }
];

export function getDepositScheduleOption(frequency: DepositFrequency) {
  return depositScheduleOptions.find((option) => option.value === frequency) || depositScheduleOptions[0];
}

export function calculateNextDepositAt(input: {
  frequency: DepositFrequency;
  lastDepositAt?: string | number | Date | null;
  now?: string | number | Date;
}) {
  const option = getDepositScheduleOption(input.frequency);
  if (!option.minutes) return null;

  const now = input.now ? new Date(input.now) : new Date();
  const lastDepositAt = input.lastDepositAt ? new Date(input.lastDepositAt) : now;
  let next = new Date(lastDepositAt.getTime() + option.minutes * 60_000);

  while (next <= now) {
    next = new Date(next.getTime() + option.minutes * 60_000);
  }

  return next.toISOString();
}

export function formatDepositScheduleLabel(frequency: DepositFrequency) {
  return getDepositScheduleOption(frequency).label;
}
