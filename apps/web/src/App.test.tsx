// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  await screen.findByRole("heading", {
    name: "The operating view before every sales call.",
  });
  const pipeline = screen.getByRole("region", { name: "Where deals are moving" });
  await userEvent.click(
    within(pipeline).getByRole("button", { name: /Acme Corp.*\$420,000/ }),
  );
  await screen.findByRole("combobox", { name: "CURRENT DEAL" });
}

describe("DealMind workflows", () => {
  it("renders a distinct live Command Center before opening a deal", async () => {
    render(<App />);
    await screen.findByRole("heading", {
      name: "The operating view before every sales call.",
    });
    expect(
      screen.getByRole("heading", { name: "Portfolio pressure" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Accounts to inspect first" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Where deals are moving" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Show the memory loop" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "What changed in the portfolio" }),
    ).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "CURRENT DEAL" })).toBeNull();
    const pipeline = screen.getByRole("region", {
      name: "Where deals are moving",
    });
    expect(
      within(pipeline).getByRole("button", { name: /Acme Corp.*\$420,000/ }),
    ).toBeTruthy();
  });

  it("preserves Rosy's identity and never fills the memory map with invented facts", async () => {
    await ready();
    expect(screen.getByRole("heading", { name: "Ask Rosy" })).toBeTruthy();
    for (const image of screen.getAllByRole("img", { name: "Rosy" })) {
      expect(image.getAttribute("src")).toBe("/rosy.png");
    }
    expect(screen.getByText("Let the connections emerge.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Security .*memor/ }),
    ).toBeNull();
  });

  it("uses the existing ask endpoint for What changed and displays every temporal field", async () => {
    mocks.post.mockResolvedValue({
      data: {
        answer: "Ownership is the new blocker.",
        memory_used: true,
        evidence: [
          {
            source: "Hindsight",
            reason: "Security review preceded implementation planning.",
            memory_id: "temporal-1",
            document_id: "doc-1",
            mentioned_at: "2026-09-10T15:00:00Z",
          },
        ],
        temporal_insight: {
          previous_state: "Security review was pending.",
          current_state: "Implementation needs an owner.",
          change: "The focus shifted to execution capacity.",
        },
      },
    });
    await ready();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "What changed?" }),
    );
    expect(
      await screen.findByText("The focus shifted to execution capacity."),
    ).toBeTruthy();
    expect(screen.getByText("Security review was pending.")).toBeTruthy();
    expect(screen.getByText("Implementation needs an owner.")).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith("/deals/acme/ask", {
      question: "What changed over time?",
    });
    await user.click(screen.getByRole("button", { name: "Security 1 memory" }));
    const dialog = screen.getByRole("dialog", {
      name: "Security · Recalled memories",
    });
    expect(
      within(dialog).getByText(
        "Security review preceded implementation planning.",
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByText("Source details"));
    expect(within(dialog).getByText("doc-1")).toBeTruthy();
  });

  it("does not invent a temporal comparison when the backend omits one", async () => {
    mocks.post.mockResolvedValue({
      data: {
        answer: "No dated comparison available.",
        memory_used: false,
        evidence: [],
      },
    });
    await ready();
    await userEvent.click(
      screen.getByRole("button", { name: "What changed?" }),
    );
    expect(
      await screen.findByText(
        /No structured previous\/current comparison was returned/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("PREVIOUS STATE")).toBeNull();
  });

  it("opens real source history and provides separate timeline and stakeholder views", async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /FIRST RECORDED/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Rollout review" });
    expect(
      within(dialog).getByText("Ravi needs an implementation owner."),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    await user.click(screen.getByRole("button", { name: "Timeline" }));
    expect(screen.getByText("Rollout review")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ask Rosy" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Stakeholders" }));
    expect(screen.getByText("Ravi Patel")).toBeTruthy();
    expect(screen.queryByText("Rollout review")).toBeNull();
  });

  it("asks for a real stakeholder's changing concerns", async () => {
    mocks.post.mockResolvedValue({
      data: { answer: "Ravi needs an owner.", memory_used: true, evidence: [] },
    });
    await ready();
    await userEvent.click(
      await screen.findByRole("button", { name: "View Ravi Patel's context" }),
    );
    expect(await screen.findByText("Ravi needs an owner.")).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith("/deals/acme/ask", {
      question: "How did Ravi Patel's concerns change over time?",
    });
  });

  it("keeps assessment signals and recommendations grounded in the response", async () => {
    mocks.post.mockResolvedValue({
      data: {
        deal_health: "medium",
        primary_risk: "No implementation owner",
        summary: "An owner is required.",
        evidence: [],
        recommended_action: "Book an ownership workshop.",
        confidence: "low",
        risk_score: 25,
        risk_factors: ["implementation_risk"],
      },
    });
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Insights" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Generate assessment" }),
    );
    expect(await screen.findByText("Book an ownership workshop.")).toBeTruthy();
    expect(screen.getByText(/Heuristic score: 25\/100/)).toBeTruthy();
    expect(screen.getByText(/not a probability of loss/)).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith("/deals/acme/intelligence");
  });

  it("checks backend health without claiming Ollama was checked", async () => {
    await ready();
    await userEvent.click(
      await screen.findByRole("button", { name: "Memory connected" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Memory & service health" }),
    ).toBeTruthy();
    expect(screen.getByText(/Not independently checked/)).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith("/health/db", { timeout: 10000 });
  });

  it.each(["succeeded", "pending"])(
    "only confirms capture when retention status is succeeded, not %s otherwise",
    async (status) => {
      mocks.post.mockResolvedValue({ data: { memory_status: status } });
      await ready();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Add interaction" }));
      await user.type(screen.getByLabelText("Subject"), "Rollout update");
      await user.type(
        screen.getByLabelText("Conversation"),
        "Ravi confirmed an implementation owner is assigned.",
      );
      fireEvent.change(screen.getByLabelText("When"), {
        target: { value: "2026-09-29T10:00" },
      });
      await user.click(screen.getByRole("button", { name: "Save to memory" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(Boolean(screen.queryByText("Memory captured."))).toBe(
        status === "succeeded",
      );
    },
  );
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

  it("runs the MacBook customer rep voice mode through the dedicated endpoint", async () => {
    mocks.post.mockResolvedValue({
      data: {
        agent: "Nova",
        mode: "customer_rep",
        reply: "The M5 Pro MacBook Pro is a portable workstation.",
        suggested_next_question: "Are you buying for editing or development?",
        grounded_in: ["M5 Pro has 307GB/s memory bandwidth", "It has a Liquid Retina XDR display"],
      },
    });
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Voice Agent" }));
    await screen.findByRole("heading", {
      name: "Talk to Rosy.",
    });
    await user.click(screen.getByRole("tab", { name: "Nova" }));
    await user.type(
      screen.getByRole("textbox", { name: "Voice agent message" }),
      "Is the M5 Pro MacBook good for video editing?",
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText("The M5 Pro MacBook Pro is a portable workstation."),
    ).toBeTruthy();
    expect(screen.getByText("It has a Liquid Retina XDR display")).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledWith("/deals/voice/novadesk", {
      message: "Is the M5 Pro MacBook good for video editing?",
      conversation: [],
      customer_profile: {},
    });
  });

  it("builds a Nova customer profile from the session and sends it to the backend", async () => {
    mocks.post.mockResolvedValue({
      data: {
        agent: "Nova",
        mode: "customer_rep",
        reply: "Rahul, I’ll remember that setup.",
        suggested_next_question: "Do you want a memory recommendation?",
        grounded_in: ["Customer profile"],
      },
    });
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Voice Agent" }));
    await user.click(screen.getByRole("tab", { name: "Nova" }));
    await user.type(
      screen.getByRole("textbox", { name: "Voice agent message" }),
      "Hi, my name is Rahul. I am a software developer from Hyderabad with a ₹2.5 lakh budget. I use Docker, Android Studio, Python and Ollama, and I need at least 1TB storage.",
    );
    await user.keyboard("{Enter}");
    await screen.findByText("Rahul, I’ll remember that setup.");
    expect(screen.getByText("Name: Rahul")).toBeTruthy();
    expect(screen.getByText("Role: software developer")).toBeTruthy();
    const payload = mocks.post.mock.calls.at(-1)?.[1] as {
      customer_profile: Record<string, string>;
    };
    expect(payload.customer_profile).toMatchObject({
      name: "Rahul",
      location: "Hyderabad",
      role: "software developer",
      budget: "₹2.5 lakh",
      apps: "Docker, Android Studio, Python, Ollama",
      storage: "at least 1TB",
      use_case: "local AI and development",
    });
  });

  it("caps Nova conversation history at 24 chronological prior turns without duplicating the current message", async () => {
    mocks.post.mockResolvedValue({
      data: {
        agent: "Nova",
        mode: "customer_rep",
        reply: "Got it.",
        suggested_next_question: "Anything else?",
        grounded_in: ["Session context"],
      },
    });
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Voice Agent" }));
    await user.click(screen.getByRole("tab", { name: "Nova" }));
    const input = screen.getByRole("textbox", { name: "Voice agent message" });

    for (let index = 1; index <= 26; index += 1) {
      await user.type(input, `Question ${index}`);
      await user.keyboard("{Enter}");
      await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(index));
    }

    const finalPayload = mocks.post.mock.calls.at(-1)?.[1] as {
      message: string;
      conversation: string[];
    };
    expect(finalPayload.message).toBe("Question 26");
    expect(finalPayload.conversation).toHaveLength(24);
    expect(finalPayload.conversation[0]).toBe("user: Question 14");
    expect(finalPayload.conversation.at(-1)).toBe("agent: Got it.");
    expect(finalPayload.conversation).not.toContain("user: Question 26");
  });

  it("does not submit a spoken final result until the silence window or manual finish", async () => {
    const recognitionInstances: Array<{
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      start: () => void;
      stop: () => void;
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    }> = [];
    class MockRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult = null;
      onend = null;
      onerror = null;
      constructor() {
        recognitionInstances.push(this);
      }
      start() {}
      stop() {}
    }
    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: MockRecognition,
    });
    mocks.post.mockResolvedValue({
      data: {
        agent: "Nova",
        mode: "customer_rep",
        reply: "Yes, it is a strong fit.",
        suggested_next_question: "What apps do you use?",
        grounded_in: ["Developer guidance"],
      },
    });
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Voice Agent" }));
    await user.click(screen.getByRole("tab", { name: "Nova" }));
    await user.click(screen.getByRole("button", { name: "Start listening" }));
    const recognizer = recognitionInstances[0];
    recognizer.onresult?.({
      results: [
        { 0: { transcript: "I am a developer" }, isFinal: true },
      ],
    });
    expect(mocks.post).not.toHaveBeenCalled();
    expect(await screen.findByText("I am a developer")).toBeTruthy();
    recognizer.onresult?.({
      results: [
        { 0: { transcript: "I am a developer" }, isFinal: true },
        { 0: { transcript: "running Docker and Ollama" }, isFinal: false },
      ],
    });
    expect(mocks.post).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Finish Question" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith("/deals/voice/novadesk", {
      message: "I am a developer running Docker and Ollama",
      conversation: [],
      customer_profile: {
        apps: "Docker, Ollama",
        role: "software developer",
        use_case: "local AI and development",
      },
    });
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
