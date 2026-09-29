// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  load: vi.fn(),
}));
vi.mock("./lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/api")>()),
  api: { get: mocks.get, post: mocks.post },
  loadDeals: mocks.load,
}));
const deals = [
  {
    id: "acme",
    name: "Enterprise",
    company: { name: "Acme Corp" },
    value: "420000",
    stage: "evaluation",
    stakeholder_count: 1,
    interaction_count: 1,
  },
  {
    id: "cedar",
    name: "Pilot",
    company: { name: "Cedar Energy" },
    value: "100000",
    stage: "closed_won",
    stakeholder_count: 0,
    interaction_count: 0,
  },
];
beforeEach(() => {
  mocks.load.mockResolvedValue(deals);
  mocks.get.mockImplementation(async (url: string) => ({
    data: url.endsWith("/stakeholders")
      ? [{ id: "ravi", name: "Ravi Patel", title: "CTO" }]
      : url.endsWith("/timeline")
        ? [
            {
              id: "i1",
              subject: "Rollout review",
              content: "Ravi needs an implementation owner.",
              interaction_type: "meeting",
              memory_status: "succeeded",
              occurred_at: "2026-09-10T15:00:00Z",
            },
          ]
        : { status: "ok" },
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
async function ready() {
  render(<App />);
  await screen.findByRole("combobox", { name: "CURRENT DEAL" });
}

describe("DealMind workflows", () => {
  it("shows actual deal context and sends the selected deal's question", async () => {
    mocks.post.mockResolvedValue({
      data: {
        answer: "Ravi needs an implementation owner.",
        memory_used: true,
        evidence: [
          {
            source: "interaction-1",
            reason: "Ravi requested an owner.",
            memory_id: "m1",
          },
        ],
      },
    });
    await ready();
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("textbox", { name: "Ask about this deal" }),
      "What did Ravi care about?",
    );
    await user.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByText("ANSWER FROM DEAL MEMORY");
    expect(mocks.post).toHaveBeenCalledWith("/deals/acme/ask", {
      question: "What did Ravi care about?",
    });
    await user.click(
      screen.getByRole("button", { name: /Inspect 1 supporting memories/ }),
    );
    expect(
      screen.getByRole("dialog", { name: "Behind the answer" }),
    ).toBeTruthy();
    expect(screen.getByText("Ravi requested an owner.")).toBeTruthy();
  });

  it("discards answers from a deal that is no longer selected", async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await ready();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Why is this deal at risk?" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "CURRENT DEAL" }),
      "cedar",
    );
    await act(async () =>
      resolve({
        data: { answer: "Old Acme answer", memory_used: true, evidence: [] },
      }),
    );
    expect(screen.queryByText("Old Acme answer")).toBeNull();
    expect(
      screen.getByRole<HTMLSelectElement>("combobox", { name: "CURRENT DEAL" })
        .value,
    ).toBe("cedar");
  });

  it("shows insufficient context without evidence claims", async () => {
    mocks.post.mockResolvedValue({
      data: {
        answer: "Insufficient history.",
        memory_used: false,
        evidence: [],
      },
    });
    await ready();
    await userEvent.click(
      screen.getByRole("button", { name: "What should I do next?" }),
    );
    await screen.findByText("INSUFFICIENT CONTEXT");
    expect(
      screen.queryByRole("button", { name: /supporting memories/ }),
    ).toBeNull();
  });

  it("shows an unavailable backend instead of fabricated deals", async () => {
    mocks.load.mockRejectedValue(new Error("offline"));
    render(<App />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("combobox", { name: "CURRENT DEAL" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("filters deals and calculates open pipeline without closed deals", async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Deals" }));
    expect(screen.getAllByText("$420,000").length).toBeGreaterThan(0);
    await user.type(
      screen.getByRole("textbox", { name: "Search deals" }),
      "Cedar",
    );
    expect(screen.getByRole("heading", { name: "Cedar Energy" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Acme Corp" })).toBeNull();
  });

  it("advances the recording frames using the keyboard", async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Intro studio" }));
    await screen.findByRole("dialog", { name: "DealMind · Intro studio" });
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("Frame 2 of 3", { exact: false })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next frame" }));
    expect(screen.getByRole("button", { name: "Open workspace" })).toBeTruthy();
  });

  it("prevents blind resubmission after a retention failure", async () => {
    mocks.post.mockRejectedValue(new Error("retention failed"));
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add interaction" }));
    await user.type(screen.getByLabelText("Subject"), "Security follow-up");
    await user.type(
      screen.getByLabelText("Conversation"),
      "Security still requires an implementation owner.",
    );
    // Native datetime input is populated directly by the event supported by React.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText("When"), {
      target: { value: "2026-09-29T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Save to memory" }));
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "Save to memory",
        }).disabled,
      ).toBe(true),
    );
    expect(
      await screen.findByRole("button", { name: "Inspect timeline" }),
    ).toBeTruthy();
  });
});
