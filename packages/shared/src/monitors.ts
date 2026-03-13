// packages/shared/src/monitors.ts

export type MonitorKind = "cash" | "award";

export type CashMonitor = {
  id: string;
  kind: "cash";
  origin: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  tripType: "one_way" | "round_trip";
  maxStops?: number;
  preferredCarriers?: string[];
  alertThreshold?: number; // Alert if price drops below this (CAD)
};

export type AwardMonitor = {
  id: string;
  kind: "award";
  airline: "Qatar Airways";
  origin: string;
  destination: string;
  destinationLabel: string;
  month: string; // YYYY-MM format
  cabin?: "economy" | "premium_economy" | "business" | "first";
};

export type Monitor = CashMonitor | AwardMonitor;

export const monitors: Monitor[] = [
  // ─── Domestic Cash Monitors ──────────────────────────────────────

  {
    id: "yyc-yyz-jul2-window",
    kind: "cash",
    origin: "YYC",
    destination: "YYZ",
    dateFrom: "2026-06-28",
    dateTo: "2026-07-06",
    tripType: "one_way",
    preferredCarriers: ["AC", "WS", "F8"],
    alertThreshold: 180,
  },
  {
    id: "yyc-yyz-jul13-window",
    kind: "cash",
    origin: "YYC",
    destination: "YYZ",
    dateFrom: "2026-07-09",
    dateTo: "2026-07-17",
    tripType: "one_way",
    preferredCarriers: ["AC", "WS", "F8"],
    alertThreshold: 180,
  },
  {
    id: "yyc-yyz-jul14-window",
    kind: "cash",
    origin: "YYC",
    destination: "YYZ",
    dateFrom: "2026-07-10",
    dateTo: "2026-07-18",
    tripType: "one_way",
    preferredCarriers: ["AC", "WS", "F8"],
    alertThreshold: 180,
  },
  {
    id: "yyz-yyc-june-last-week",
    kind: "cash",
    origin: "YYZ",
    destination: "YYC",
    dateFrom: "2026-06-24",
    dateTo: "2026-06-30",
    tripType: "one_way",
    preferredCarriers: ["AC", "WS", "F8"],
    alertThreshold: 180,
  },
  {
    id: "yyz-yyc-may8-window",
    kind: "cash",
    origin: "YYZ",
    destination: "YYC",
    dateFrom: "2026-05-03",
    dateTo: "2026-05-13",
    tripType: "one_way",
    preferredCarriers: ["AC", "WS", "F8"],
    alertThreshold: 160,
  },
  {
    // YYZ→YYC June 10th (user added)
    id: "yyz-yyc-jun10",
    kind: "cash",
    origin: "YYZ",
    destination: "YYC",
    dateFrom: "2026-06-08",
    dateTo: "2026-06-12",
    tripType: "one_way",
    preferredCarriers: ["AC", "WS", "F8"],
    alertThreshold: 180,
  },
  {
    // YYC→YYZ June 13th (user added)
    id: "yyc-yyz-jun13",
    kind: "cash",
    origin: "YYC",
    destination: "YYZ",
    dateFrom: "2026-06-11",
    dateTo: "2026-06-15",
    tripType: "one_way",
    preferredCarriers: ["AC", "WS", "F8"],
    alertThreshold: 180,
  },

  // ─── Qatar Airways Award Monitors – Islamabad ────────────────────

  {
    id: "qatar-award-yyz-isb-jun2027",
    kind: "award",
    airline: "Qatar Airways",
    origin: "YYZ",
    destination: "ISB",
    destinationLabel: "Islamabad, Pakistan",
    month: "2027-06",
    cabin: "business",
  },
  {
    id: "qatar-award-yyz-isb-jul2027",
    kind: "award",
    airline: "Qatar Airways",
    origin: "YYZ",
    destination: "ISB",
    destinationLabel: "Islamabad, Pakistan",
    month: "2027-07",
    cabin: "business",
  },
  {
    id: "qatar-award-yyz-isb-dec2027",
    kind: "award",
    airline: "Qatar Airways",
    origin: "YYZ",
    destination: "ISB",
    destinationLabel: "Islamabad, Pakistan",
    month: "2027-12",
    cabin: "business",
  },

  // ─── Qatar Airways Award Monitors – Istanbul IST ─────────────────

  {
    id: "qatar-award-yyz-ist-jun2027",
    kind: "award",
    airline: "Qatar Airways",
    origin: "YYZ",
    destination: "IST",
    destinationLabel: "Istanbul Airport (IST)",
    month: "2027-06",
    cabin: "business",
  },
  {
    id: "qatar-award-yyz-ist-jul2027",
    kind: "award",
    airline: "Qatar Airways",
    origin: "YYZ",
    destination: "IST",
    destinationLabel: "Istanbul Airport (IST)",
    month: "2027-07",
    cabin: "business",
  },
  {
    id: "qatar-award-yyz-ist-dec2027",
    kind: "award",
    airline: "Qatar Airways",
    origin: "YYZ",
    destination: "IST",
    destinationLabel: "Istanbul Airport (IST)",
    month: "2027-12",
    cabin: "business",
  },
];

export const cashMonitors = monitors.filter(
  (m): m is CashMonitor => m.kind === "cash"
);

export const awardMonitors = monitors.filter(
  (m): m is AwardMonitor => m.kind === "award"
);
