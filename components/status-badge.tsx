import type { VerificationStatus } from "@/lib/types";

const labels: Record<VerificationStatus, string> = {
  verified: "Проверено",
  review: "Требует уточнения",
  error: "Ошибка",
  excluded: "Не участвует в КПД",
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`badge badge-${status}`}>{labels[status]}</span>;
}
