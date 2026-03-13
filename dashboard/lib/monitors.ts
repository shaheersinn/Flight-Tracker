// Mirrors scraper/monitors.py — keep in sync when adding routes

export type CashMonitor = {
  id: string; kind: "cash";
  origin: string; destination: string;
  dateFrom: string; dateTo: string;
  alertThreshold?: number;
};

export type AwardMonitor = {
  id: string; kind: "award";
  airline: string;
  origin: string; destination: string;
  destinationLabel: string;
  month: string; cabin: string;
};

export type Monitor = CashMonitor | AwardMonitor;

export const CASH_MONITORS: CashMonitor[] = [
  { id: "yyc-yyz-jul2-window",      kind:"cash", origin:"YYC", destination:"YYZ", dateFrom:"2026-06-28", dateTo:"2026-07-06", alertThreshold:180 },
  { id: "yyc-yyz-jul13-window",     kind:"cash", origin:"YYC", destination:"YYZ", dateFrom:"2026-07-09", dateTo:"2026-07-17", alertThreshold:180 },
  { id: "yyc-yyz-jul14-window",     kind:"cash", origin:"YYC", destination:"YYZ", dateFrom:"2026-07-10", dateTo:"2026-07-18", alertThreshold:180 },
  { id: "yyz-yyc-june-last-week",   kind:"cash", origin:"YYZ", destination:"YYC", dateFrom:"2026-06-24", dateTo:"2026-06-30", alertThreshold:180 },
  { id: "yyz-yyc-may8-window",      kind:"cash", origin:"YYZ", destination:"YYC", dateFrom:"2026-05-03", dateTo:"2026-05-13", alertThreshold:160 },
  { id: "yyz-yyc-jun10",            kind:"cash", origin:"YYZ", destination:"YYC", dateFrom:"2026-06-08", dateTo:"2026-06-12", alertThreshold:180 },
  { id: "yyc-yyz-jun13",            kind:"cash", origin:"YYC", destination:"YYZ", dateFrom:"2026-06-11", dateTo:"2026-06-15", alertThreshold:180 },
];

export const AWARD_MONITORS: AwardMonitor[] = [
  { id:"qatar-award-yyz-isb-jun2027", kind:"award", airline:"Qatar Airways", origin:"YYZ", destination:"ISB", destinationLabel:"Islamabad, Pakistan",          month:"2027-06", cabin:"business" },
  { id:"qatar-award-yyz-isb-jul2027", kind:"award", airline:"Qatar Airways", origin:"YYZ", destination:"ISB", destinationLabel:"Islamabad, Pakistan",          month:"2027-07", cabin:"business" },
  { id:"qatar-award-yyz-isb-dec2027", kind:"award", airline:"Qatar Airways", origin:"YYZ", destination:"ISB", destinationLabel:"Islamabad, Pakistan",          month:"2027-12", cabin:"business" },
  { id:"qatar-award-yyz-ist-jun2027", kind:"award", airline:"Qatar Airways", origin:"YYZ", destination:"IST", destinationLabel:"Istanbul Airport (IST), Turkey", month:"2027-06", cabin:"business" },
  { id:"qatar-award-yyz-ist-jul2027", kind:"award", airline:"Qatar Airways", origin:"YYZ", destination:"IST", destinationLabel:"Istanbul Airport (IST), Turkey", month:"2027-07", cabin:"business" },
  { id:"qatar-award-yyz-ist-dec2027", kind:"award", airline:"Qatar Airways", origin:"YYZ", destination:"IST", destinationLabel:"Istanbul Airport (IST), Turkey", month:"2027-12", cabin:"business" },
];

export const ALL_MONITORS: Monitor[] = [...CASH_MONITORS, ...AWARD_MONITORS];

export function fmtMonth(ym: string): string {
  const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [y, m] = ym.split("-");
  return `${months[parseInt(m)]} ${y}`;
}
