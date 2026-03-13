// packages/shared/src/types.ts

export interface FlightResult {
  provider: string;
  origin: string;
  destination: string;
  departureDate: string;
  arrivalDate?: string;
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
  monitorId: string;
  kind: "cash" | "award";
}

export interface AlertRecord {
  monitorId: string;
  alertType:
    | "new_all_time_low"
    | "significant_drop"
    | "threshold_breach"
    | "award_available"
    | "anomaly_detected";
  quote: FlightResult;
  previousBest?: number;
  dropPercent?: number;
}

export interface RunSummary {
  startedAt: string;
  monitorsChecked: number;
  quotesFound: number;
  alertsTriggered: number;
  errors: string[];
  cashResults: FlightResult[];
  awardResults: FlightResult[];
  alerts: AlertRecord[];
}

export interface Prediction {
  monitorId: string;
  predictedMean: number;
  predictedMin: number;
  predictedMax: number;
  confidence: number;
  forecastDays: number;
  generatedAt: string;
}
