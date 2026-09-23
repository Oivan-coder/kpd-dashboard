export type VerificationStatus = "verified" | "review" | "error" | "excluded";

export type Analyzer = {
  id: string;
  laboratory: string;
  level: string;
  direction: string;
  manufacturer: string;
  model: string;
  sourceManufacturer?: string;
  sourceModel?: string;
  serials: string[];
  technicalStatus: string;
  status: VerificationStatus;
  verificationText: string;
  capacityPerHour: number | null;
  capacityUnit: "tests/hour" | "samples/hour" | null;
  includedInKpi: boolean;
  factIncluded: boolean;
  issue?: string;
  sourceUrl?: string;
};

export type LaboratorySummary = {
  name: string;
  fact: number;
  kpi: number;
  capacityPerHour: number;
  monthlyCapacity: number;
  analyzers: number;
  reviewCount: number;
  errorCount: number;
  dataStatus: string;
};

export type DashboardData = {
  source: "google-sheets" | "fallback";
  updatedAt: string;
  totalKpi: number;
  totalFact: number;
  totalCapacityPerHour: number;
  totalMonthlyCapacity: number;
  totalAnalyzersInCapacity: number;
  laboratories: LaboratorySummary[];
  analyzers: Analyzer[];
};
