export type ManagedViewerAction = "join" | "heartbeat" | "leave";

export type ManagedViewerRecord = {
  activeTabs: Map<string, number>;
  entryUnits: number;
  exitUnits: number;
  departureRecorded: boolean;
};

export type ManagedViewerSnapshot = {
  realLiveViewerCount: number;
  publicViewerDisplayValue: number;
  entryDelta: number;
  leaveDelta: number;
};

export const MANAGED_VIEWER_TTL_MS = 45_000;

export function createManagedViewerRecord(multiplier: number): ManagedViewerRecord {
  return { activeTabs: new Map(), entryUnits: Math.max(1, Math.floor(multiplier)), exitUnits: 0, departureRecorded: false };
}

export function expireManagedViewerTabs(records: Map<string, ManagedViewerRecord>, now: number, ttlMs = MANAGED_VIEWER_TTL_MS) {
  let leaveDelta = 0;
  for (const record of records.values()) {
    for (const [tabId, lastSeenAt] of record.activeTabs) {
      if (now - lastSeenAt > ttlMs) record.activeTabs.delete(tabId);
    }
    if (!record.activeTabs.size && !record.departureRecorded) {
      record.exitUnits += 1;
      record.departureRecorded = true;
      leaveDelta += 1;
    }
  }
  return leaveDelta;
}

export function updateManagedViewerPresence({
  records,
  visitorKey,
  tabId,
  action,
  now,
  multiplier
}: {
  records: Map<string, ManagedViewerRecord>;
  visitorKey: string;
  tabId: string;
  action: ManagedViewerAction;
  now: number;
  multiplier: number;
}): ManagedViewerSnapshot {
  let entryDelta = 0;
  let leaveDelta = expireManagedViewerTabs(records, now);
  let record = records.get(visitorKey);

  if (action === "leave") {
    if (record) {
      record.activeTabs.delete(tabId);
      if (!record.activeTabs.size && !record.departureRecorded) {
        record.exitUnits += 1;
        record.departureRecorded = true;
        leaveDelta += 1;
      }
    }
  } else {
    if (!record) {
      record = createManagedViewerRecord(multiplier);
      records.set(visitorKey, record);
      entryDelta = record.entryUnits;
    }
    record.activeTabs.set(tabId, now);
    record.departureRecorded = false;
  }

  let realLiveViewerCount = 0;
  let publicViewerDisplayValue = 0;
  for (const current of records.values()) {
    if (current.activeTabs.size) realLiveViewerCount += 1;
    publicViewerDisplayValue += Math.max(0, current.entryUnits - current.exitUnits);
  }

  return { realLiveViewerCount, publicViewerDisplayValue, entryDelta, leaveDelta };
}
