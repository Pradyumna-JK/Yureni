import axios from "axios";

export interface Deal {
  id: string;
  name: string;
  value: string | null;
  stage: string;
  company: { name: string; industry: string | null };
  stakeholder_count: number;
  interaction_count: number;
  last_interaction_at: string | null;
}
export interface Interaction {
  id: string;
  interaction_type: string;
  subject: string | null;
  content: string;
  occurred_at: string;
  memory_status: string;
  memory_document_id: string | null;
}
export interface Stakeholder {
  id: string;
  name: string;
  title: string | null;
  role: string | null;
}
export interface Evidence {
  source: string;
  reason: string;
  memory_id?: string | null;
  document_id?: string | null;
  mentioned_at?: string | null;
}
export interface Answer {
  answer: string;
  evidence: Evidence[];
  memory_used: boolean;
  temporal_insight?: {
    previous_state: string;
    current_state: string;
    change: string;
  };
}
export interface Intelligence {
  deal_health: string;
  primary_risk: string;
  summary: string;
  evidence: Evidence[];
  recommended_action: string;
  confidence: string;
  risk_score: number;
  risk_factors: string[];
}
export const api = axios.create({ baseURL: "/api", timeout: 660_000 });
export const dateLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No activity yet";
export const humanize = (value: string) => value.replaceAll("_", " ");
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail: unknown = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (error.code === "ECONNABORTED")
      return "This request took too long. The local model may still be busy. Try again shortly.";
    if (error.response?.status === 422)
      return "Check the fields and try again.";
  }
  return "Cannot reach DealMind. Check that the API is running, then try again.";
}
export async function loadDeals(): Promise<Deal[]> {
  const all: Deal[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data } = await api.get<Deal[]>("/deals", {
      params: { limit: 100, offset },
    });
    all.push(...data);
    if (data.length < 100) return all;
  }
}
