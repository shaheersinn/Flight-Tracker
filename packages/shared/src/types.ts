// packages/shared/src/types.ts

export type MonitorKind = "cash" | "award";

export type CashMonitor = {
  id: string;
  kind: "cash";
  origin: string;
  destination: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  tripType: "one_way" | "round_trip";
  maxStops?: number;
  preferredCarriers?: string[];
};

export type AwardMonitor = {
  id: string;
  kind: "award";
  airline: "Qatar Airways";
  origin: string;
  destination: string;
  month: string; // YYYY-MM format
  cabin?: "economy" | "premium_economy" | "business" | "first";
};

export type Monitor = CashMonitor | AwardMonitor;

export type FlightResult = {
  provider: string;
  monitorId: string;
  origin: string;
  destination: string;
  departureDate: string;
  totalPrice?: number;
  currency?: string;
  pointsCost?: number;
  cashSurcharge?: number;
  cabin?: string;
  airline: string;
  flightNumber?: string;
  stops: number;
  duration: string;
  bookingUrl: string;
  scrapedAt: string;
  isAward: boolean;
};

export type AlertSummary = {
  newLows: FlightResult[];
  significantDrops: FlightResult[];
  awardAvailability: FlightResult[];
  anomalies: FlightResult[];
};
