export type VerificationStatus = "verified" | "review" | "error" | "excluded";

export type Analyzer = {
  id: string;
  laboratory: string;
  level: 1 | 2 | 3;
  direction: string;
  manufacturer: string;
  model: string;
  serials: string[];
  status: VerificationStatus;
  capacityPerHour: number | null;
  capacityUnit: "tests/hour" | "samples/hour" | null;
  includedInKpi: boolean;
  issue?: string;
};

export type LaboratorySummary = {
  name: string;
  kpi: number;
  capacityPerHour: number;
  analyzers: number;
  reviewCount: number;
  errorCount: number;
};
