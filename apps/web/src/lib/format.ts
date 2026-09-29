export function formatCurrency(value: string | number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

export function riskLabel(score: number): "high" | "medium" | "low" {
  if (score >= 60) return "low";
  if (score >= 30) return "medium";
  return "high";
}
