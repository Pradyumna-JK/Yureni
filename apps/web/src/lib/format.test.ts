import { describe, expect, it } from "vitest";
import { formatCurrency, riskLabel } from "./format";

describe("DealMind display helpers", () => {
  it("formats deal values for dashboard cards", () => {
    expect(formatCurrency("420000")).toBe("$420,000");
    expect(formatCurrency(null)).toBe("—");
  });

  it("maps deterministic risk scores to health labels", () => {
    expect(riskLabel(10)).toBe("high");
    expect(riskLabel(45)).toBe("medium");
    expect(riskLabel(80)).toBe("low");
  });
});
