import { useEffect, useRef, useState } from "react";
import {
  api,
  dateLabel,
  errorMessage,
  humanize,
  loadDeals,
  type Answer,
  type Deal,
  type Evidence,
  type Intelligence,
  type Interaction,
  type Stakeholder,
} from "./lib/api";
import { formatCurrency } from "./lib/format";
import { Icon, Mark, type IconName } from "./components/Icon";
import { Modal } from "./components/Modal";
import { Intro } from "./components/Intro";
import { EntryForm } from "./components/EntryForm";

type Page = "Overview" | "Deals" | "Memory" | "Ask DealMind";
const navigation: { name: Page; icon: IconName }[] = [
  { name: "Overview", icon: "home" },
  { name: "Deals", icon: "deals" },
  { name: "Memory", icon: "memory" },
  { name: "Ask DealMind", icon: "chat" },
];

export default function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [timeline, setTimeline] = useState<Interaction[]>([]);
  const [people, setPeople] = useState<Stakeholder[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asked, setAsked] = useState("");
  const [insight, setInsight] = useState<Intelligence | null>(null);
  const [busy, setBusy] = useState<"ask" | "insight" | null>(null);
  const [requestError, setRequestError] = useState("");
  const [memoryStatus, setMemoryStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "ingest" | "intro" | null>(
    null,
  );
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [focus, setFocus] = useState(false);
  const [revision, setRevision] = useState(0);
  const requestVersion = useRef(0);
  const detailVersion = useRef(0);
  const deal = deals.find((d) => d.id === selected);

  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const data = await loadDeals();
      setDeals(data);
      setSelected((current) =>
        data.some((d) => d.id === current)
          ? current
          : (data.find((d) => d.company.name === "Acme Corp")?.id ??
            data[0]?.id ??
            ""),
      );
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }
  async function checkMemory() {
    setMemoryStatus("checking");
    try {
      await api.get("/health/memory", { timeout: 10000 });
      setMemoryStatus("online");
    } catch {
      setMemoryStatus("offline");
    }
  }
  useEffect(() => {
    void refresh();
    void checkMemory();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const version = ++detailVersion.current;
    setDetailLoading(true);
    setDetailError("");
    setTimeline([]);
    setPeople([]);
    Promise.all([
      api.get<Interaction[]>(`/deals/${selected}/timeline`, {
        signal: controller.signal,
      }),
      api.get<Stakeholder[]>(`/deals/${selected}/stakeholders`, {
        signal: controller.signal,
      }),
    ])
      .then(([events, stakeholders]) => {
        if (version !== detailVersion.current) return;
        setTimeline(events.data);
        setPeople(stakeholders.data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDetailError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [selected, revision]);
  function choose(id: string) {
    if (id === selected) return;
    requestVersion.current += 1;
    detailVersion.current += 1;
    setSelected(id);
    setAnswer(null);
    setInsight(null);
    setAsked("");
    setRequestError("");
    setBusy(null);
    setTimeline([]);
    setPeople([]);
    setEvidence(null);
  }
  async function ask(text: string) {
    if (!selected || busy || text.trim().length < 3) return;
    const version = ++requestVersion.current;
    setBusy("ask");
    setRequestError("");
    setAsked(text);
    setAnswer(null);
    try {
      const { data } = await api.post<Answer>(`/deals/${selected}/ask`, {
        question: text,
      });
      if (version === requestVersion.current) {
        setAnswer(data);
        setQuestion("");
      }
    } catch (error) {
      if (version === requestVersion.current)
        setRequestError(errorMessage(error));
    } finally {
      if (version === requestVersion.current) setBusy(null);
    }
  }
  async function assess() {
    if (!selected || busy) return;
    const version = ++requestVersion.current;
    setBusy("insight");
    setRequestError("");
    try {
      const { data } = await api.post<Intelligence>(
        `/deals/${selected}/intelligence`,
      );
      if (version === requestVersion.current) setInsight(data);
    } catch (error) {
      if (version === requestVersion.current)
        setRequestError(errorMessage(error));
    } finally {
      if (version === requestVersion.current) setBusy(null);
    }
  }
  const openDeals = deals.filter(
    (d) => !["closed_won", "closed_lost"].includes(d.stage),
  );
  const visibleDeals = deals.filter((d) =>
    `${d.company.name} ${d.name} ${d.stage}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const suggestions = [
    "Why is this deal at risk?",
    "What changed over time?",
    "What should I do next?",
  ];

  return (
    <div className={`app-shell ${focus ? "focus-mode" : ""}`}>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage("Overview");
          }}
        >
          <Mark />
          <span>
            DealMind<span className="brand-period">.</span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? "active" : ""}`}
              aria-label={item.name}
              aria-current={page === item.name ? "page" : undefined}
              onClick={() => setPage(item.name)}
            >
              <Icon name={item.icon} />
              {item.name}
              {item.name === "Deals" && (
                <span className="nav-count">{deals.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-deals">
          <div className="workspace-label">PINNED CONTEXT</div>
          {deals
            .slice()
            .sort(
              (a, b) =>
                Number(b.company.name === "Acme Corp") -
                Number(a.company.name === "Acme Corp"),
            )
            .slice(0, 3)
            .map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  choose(d.id);
                  setPage("Overview");
                }}
                className={`context-link ${selected === d.id ? "selected" : ""}`}
              >
                <span className="context-dot" />
                {d.company.name}
                <Icon name="chevron" size={13} />
              </button>
            ))}
        </div>
        <div className="sidebar-bottom">
          <div className="memory-note">
            <Icon name="memory" />
            <p>
              Every conversation.
              <br />
              <strong>A little more context.</strong>
            </p>
            <span>Persistent memory by Hindsight</span>
          </div>
          <div className="profile">
            <span className="avatar">P</span>
            <div>
              <strong>Personal workspace</strong>
              <span>Local environment</span>
            </div>
            <span className="local-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>{page === "Memory" ? "Memory Explorer" : page}</strong>
          </div>
          <div className="top-actions">
            <button className="text-button" onClick={() => setModal("intro")}>
              <Icon name="play" size={15} /> Intro studio
            </button>
            <button
              className={`icon-button ${focus ? "selected" : ""}`}
              onClick={() => setFocus(!focus)}
              aria-label={focus ? "Exit focus mode" : "Enter focus mode"}
              title="Focus mode for recording"
            >
              <Icon name="focus" />
            </button>
            <span className="top-avatar">P</span>
          </div>
        </header>
        <main className="content">
          <div className="status-row">
            <span className="eyebrow">DEAL INTELLIGENCE, WITH MEMORY</span>
            <button
              onClick={() => void checkMemory()}
              className={`connection ${memoryStatus}`}
              title="Check memory connection"
            >
              <span className="status-dot" />
              {memoryStatus === "online"
                ? "Memory connected"
                : memoryStatus === "offline"
                  ? "Memory unavailable · Retry"
                  : "Connecting to memory…"}
            </button>
          </div>
          <section className="page-heading">
            <div>
              <h1>
                {page === "Deals" ? (
                  "Your next opportunity."
                ) : page === "Memory" ? (
                  "Nothing gets lost."
                ) : page === "Ask DealMind" ? (
                  "Ask with the full picture."
                ) : (
                  <>
                    Every deal has a story
                    <span className="brand-period">.</span>
                  </>
                )}
              </h1>
              <p>
                {page === "Deals"
                  ? "A clear view of every account, and the conversations behind it."
                  : page === "Memory"
                    ? "Trace your answers back to the conversations that shaped them."
                    : "Pick up where you left off. Turn your deal history into a clear next step."}
              </p>
            </div>
            {page === "Deals" ? (
              <button
                className="button primary"
                onClick={() => setModal("create")}
              >
                <Icon name="plus" size={17} /> New deal
              </button>
            ) : (
              <button
                className="button"
                onClick={() => setModal("ingest")}
                disabled={!deal || !!busy}
              >
                <Icon name="plus" size={17} /> Add interaction
              </button>
            )}
          </section>
          {loadError && (
            <div role="alert" className="error-box">
              {loadError}
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {loading && (
            <div className="loading-state" role="status">
              <span className="spinner" /> Loading your workspace…
            </div>
          )}
          {!loading && !deals.length && !loadError && (
            <div className="empty-state">
              <Mark large />
              <h2>Your first deal starts here.</h2>
              <p>
                Create an account, add a conversation, and let the context
                accumulate.
              </p>
              <button
                className="button primary"
                onClick={() => setModal("create")}
              >
                Create a deal
              </button>
            </div>
          )}
          {!loading && deals.length > 0 && (
            <>
              {page === "Deals" ? (
                <>
                  <div className="metrics">
                    <Metric
                      label="Open pipeline"
                      value={formatCurrency(
                        openDeals.reduce(
                          (sum, d) => sum + Number(d.value || 0),
                          0,
                        ),
                      )}
                    />
                    <Metric
                      label="Active deals"
                      value={String(openDeals.length)}
                    />
                    <Metric
                      label="Recorded interactions"
                      value={String(
                        deals.reduce((sum, d) => sum + d.interaction_count, 0),
                      )}
                    />
                  </div>
                  <div className="section-title">
                    <h2>
                      All deals <span>{deals.length}</span>
                    </h2>
                    <label className="search">
                      <Icon name="search" size={16} />
                      <input
                        aria-label="Search deals"
                        placeholder="Find an account…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="deal-grid">
                    {visibleDeals.map((d) => (
                      <button
                        key={d.id}
                        className="deal-list-card"
                        onClick={() => {
                          choose(d.id);
                          setPage("Overview");
                        }}
                      >
                        <div className="card-top">
                          <span className="company-icon">
                            {d.company.name.slice(0, 1)}
                          </span>
                          <span
                            className={`badge ${d.stage === "closed_won" ? "green" : ""}`}
                          >
                            {humanize(d.stage)}
                          </span>
                        </div>
                        <h2>{d.company.name}</h2>
                        <p>{d.name}</p>
                        <div className="deal-list-footer">
                          <strong>{formatCurrency(d.value)}</strong>
                          <span>
                            {d.interaction_count} interactions{" "}
                            <Icon name="chevron" size={15} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {!visibleDeals.length && (
                    <p className="empty-inline">No deals match “{search}”.</p>
                  )}
                </>
              ) : (
                deal && (
                  <>
                    <section className="deal-strip">
                      <div className="company-icon">
                        {deal.company.name.slice(0, 1)}
                      </div>
                      <div className="deal-selector">
                        <label htmlFor="deal-select">CURRENT DEAL</label>
                        <select
                          id="deal-select"
                          value={selected}
                          onChange={(e) => choose(e.target.value)}
                        >
                          {deals.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.company.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span className="badge">{humanize(deal.stage)}</span>
                      <div className="strip-stat">
                        <span>Deal value</span>
                        <strong>{formatCurrency(deal.value)}</strong>
                      </div>
                      <div className="strip-stat">
                        <span>Stakeholders</span>
                        <strong>{deal.stakeholder_count}</strong>
                      </div>
                      <div className="strip-stat">
                        <span>Interactions</span>
                        <strong>{deal.interaction_count}</strong>
                      </div>
                    </section>
                    {page !== "Memory" && (
                      <section className="ask-area">
                        <div className="ask-title">
                          <Mark />
                          <div>
                            <h2>What would you like to know?</h2>
                            <p>Your deal history. A more thoughtful answer.</p>
                          </div>
                        </div>
                        <form
                          className="composer"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void ask(question);
                          }}
                        >
                          <textarea
                            aria-label="Ask about this deal"
                            placeholder={`Ask anything about ${deal.company.name}…`}
                            value={question}
                            maxLength={2000}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void ask(question);
                              }
                            }}
                          />
                          <div className="composer-footer">
                            <span>
                              <Icon name="memory" size={14} /> Answers from deal
                              memory
                            </span>
                            <button
                              type="submit"
                              aria-label="Send question"
                              disabled={!!busy || question.trim().length < 3}
                              className="send-button"
                            >
                              <Icon name="arrow" />
                            </button>
                          </div>
                        </form>
                        <div className="suggestions">
                          {suggestions.map((text) => (
                            <button
                              key={text}
                              disabled={!!busy}
                              onClick={() => {
                                setQuestion(text);
                                void ask(text);
                              }}
                            >
                              {text}
                              <Icon name="chevron" size={12} />
                            </button>
                          ))}
                        </div>
                        {busy === "ask" && (
                          <div className="loading-state" role="status">
                            <span className="spinner" /> Reading deal memory and
                            preparing an answer. Local reasoning may take a
                            minute.
                          </div>
                        )}
                        {answer && (
                          <article className="answer-card">
                            <div className="answer-meta">
                              <span className="eyebrow">
                                {answer.memory_used
                                  ? "ANSWER FROM DEAL MEMORY"
                                  : "INSUFFICIENT CONTEXT"}
                              </span>
                              {answer.memory_used && (
                                <Icon name="check" size={17} />
                              )}
                            </div>
                            <h3>{asked}</h3>
                            <p className="answer-text">{answer.answer}</p>
                            {answer.temporal_insight && (
                              <div className="temporal">
                                <div>
                                  <span>THEN</span>
                                  <p>
                                    {answer.temporal_insight.previous_state}
                                  </p>
                                </div>
                                <Icon name="chevron" />
                                <div>
                                  <span>NOW</span>
                                  <p>{answer.temporal_insight.current_state}</p>
                                </div>
                              </div>
                            )}
                            {answer.evidence.length > 0 && (
                              <button
                                className="evidence-link"
                                onClick={() => setEvidence(answer.evidence)}
                              >
                                <Icon name="file" size={15} /> Inspect{" "}
                                {answer.evidence.length} supporting memories{" "}
                                <Icon name="chevron" size={14} />
                              </button>
                            )}
                          </article>
                        )}
                      </section>
                    )}
                    {requestError && (
                      <div className="error-box" role="alert">
                        {requestError}{" "}
                        <span>
                          Try the question or assessment again when the service
                          is ready.
                        </span>
                      </div>
                    )}
                    {page === "Overview" && (
                      <>
                        <div className="section-title">
                          <h2>The deal, at a glance</h2>
                          <span className="muted">
                            Context before your next conversation
                          </span>
                        </div>
                        <div className="insight-grid">
                          <article className="risk-card">
                            <div className="card-label">
                              <span className="round-icon">
                                <Icon name="deals" size={17} />
                              </span>
                              <span>Deal assessment</span>
                              {insight && (
                                <span className="badge">
                                  {insight.deal_health === "unknown"
                                    ? "Unknown health"
                                    : `${insight.deal_health} health`}
                                </span>
                              )}
                            </div>
                            <h3>
                              {insight
                                ? insight.primary_risk
                                : "See what needs your attention."}
                            </h3>
                            <p>
                              {insight
                                ? insight.summary
                                : "Bring the open questions and potential risks into one view, grounded in your retained deal history."}
                            </p>
                            {insight && (
                              <p className="fine-print">
                                Heuristic score: {insight.risk_score}/100 ·{" "}
                                {insight.confidence} confidence. The score
                                counts keyword signals and may include resolved
                                concerns; it is not a probability of loss.
                              </p>
                            )}
                            <button
                              className="text-button accent"
                              disabled={!!busy}
                              onClick={() => void assess()}
                            >
                              {busy === "insight" ? (
                                <>
                                  <span className="spinner" /> Assessing deal…
                                </>
                              ) : (
                                <>
                                  {insight
                                    ? "Refresh assessment"
                                    : "Generate assessment"}
                                  <Icon name="chevron" size={15} />
                                </>
                              )}
                            </button>
                          </article>
                          <article className="action-card">
                            <div className="card-label">
                              <span className="round-icon">
                                <Icon name="arrow" size={17} />
                              </span>
                              <span>Your next move</span>
                            </div>
                            <h3>
                              {insight
                                ? "A next step, with context."
                                : "Turn context into momentum."}
                            </h3>
                            <p>
                              {insight
                                ? insight.recommended_action
                                : "Generate an assessment to get a suggested action based on the conversations behind this deal."}
                            </p>
                            {insight?.evidence.length ? (
                              <button
                                className="evidence-link"
                                onClick={() => setEvidence(insight.evidence)}
                              >
                                <Icon name="file" size={15} /> View supporting
                                evidence <Icon name="chevron" size={14} />
                              </button>
                            ) : (
                              <span className="fine-print">
                                The evidence stays one click away.
                              </span>
                            )}
                          </article>
                        </div>
                      </>
                    )}
                    {page !== "Ask DealMind" && (
                      <div
                        className={
                          page === "Memory" ? "memory-layout" : "detail-grid"
                        }
                      >
                        <section>
                          <div className="section-title">
                            <h2>
                              {page === "Memory"
                                ? "Source interactions"
                                : "The conversation so far"}{" "}
                              <span>{timeline.length}</span>
                            </h2>
                            <Icon name="clock" size={17} />
                          </div>
                          {detailError && (
                            <div className="error-box" role="alert">
                              {detailError}
                              <button onClick={() => setRevision((v) => v + 1)}>
                                Retry
                              </button>
                            </div>
                          )}
                          {detailLoading ? (
                            <p role="status" className="empty-inline">
                              Loading deal history…
                            </p>
                          ) : (
                            <div className="timeline">
                              {timeline.map((item) => (
                                <details
                                  key={item.id}
                                  className="timeline-item"
                                >
                                  <summary>
                                    <span className="timeline-icon">
                                      <Icon name="file" size={16} />
                                    </span>
                                    <div>
                                      <span className="event-title">
                                        {item.subject ||
                                          humanize(item.interaction_type)}
                                      </span>
                                      <span className="event-meta">
                                        {dateLabel(item.occurred_at)} <i>·</i>{" "}
                                        {humanize(item.interaction_type)}
                                      </span>
                                    </div>
                                    <span
                                      className={`retention ${item.memory_status === "succeeded" ? "success" : ""}`}
                                    >
                                      {item.memory_status === "succeeded"
                                        ? "Retained"
                                        : humanize(item.memory_status)}
                                    </span>
                                    <Icon name="chevron" size={14} />
                                  </summary>
                                  <div className="transcript">
                                    <p>{item.content}</p>
                                    <span>
                                      Source document:{" "}
                                      {item.memory_document_id ||
                                        "Not assigned"}
                                    </span>
                                  </div>
                                </details>
                              ))}
                              {!timeline.length && !detailError && (
                                <p className="empty-inline">
                                  No interactions yet. Add a meeting, email, or
                                  note to start building context.
                                </p>
                              )}
                            </div>
                          )}
                        </section>
                        <section className="people-section">
                          <div className="section-title">
                            <h2>
                              {page === "Memory"
                                ? "From source to insight"
                                : "People in the room"}
                            </h2>
                          </div>
                          {page === "Memory" ? (
                            <div className="memory-explanation">
                              <Mark large />
                              <h3>Memory you can inspect.</h3>
                              <p>
                                This timeline shows saved source interactions
                                and their retention status. Ask a question to
                                inspect the actual Hindsight memories returned
                                with the answer.
                              </p>
                              <button
                                className="button"
                                onClick={() => setPage("Ask DealMind")}
                              >
                                Ask about this deal{" "}
                                <Icon name="chevron" size={15} />
                              </button>
                              <p className="fine-print">
                                A saved source is not proof of recall. Only
                                evidence returned by Hindsight appears as
                                supporting memory.
                              </p>
                            </div>
                          ) : (
                            <>
                              {people.map((person) => (
                                <div className="person" key={person.id}>
                                  <span className="person-avatar">
                                    {person.name
                                      .split(" ")
                                      .map((n) => n[0])
                                      .slice(0, 2)
                                      .join("")}
                                  </span>
                                  <div>
                                    <strong>{person.name}</strong>
                                    <span>
                                      {person.title ||
                                        person.role ||
                                        "Stakeholder"}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {!people.length && !detailLoading && (
                                <p className="empty-inline">
                                  No stakeholders recorded.
                                </p>
                              )}
                              <div className="quiet-note">
                                <span className="status-dot" />
                                <span>
                                  Context grows with every interaction.
                                </span>
                              </div>
                            </>
                          )}
                        </section>
                      </div>
                    )}
                  </>
                )
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              DealMind{" "}
              <span className="muted">
                / A little more context. A better next step.
              </span>
            </span>
            <span>Powered by Hindsight</span>
          </footer>
        </main>
      </div>
      {modal === "intro" && <Intro onClose={() => setModal(null)} />}
      {(modal === "create" || modal === "ingest") && (
        <EntryForm
          kind={modal}
          deal={deal}
          onClose={() => setModal(null)}
          onSaved={(id) => {
            setModal(null);
            if (id) choose(id);
            setRevision((v) => v + 1);
            setInsight(null);
            setAnswer(null);
            void refresh();
            void checkMemory();
          }}
        />
      )}
      {evidence && (
        <Modal title="Behind the answer" onClose={() => setEvidence(null)}>
          <p className="modal-description">
            Original facts returned by Hindsight. Source metadata is shown
            exactly as supplied by the API.
          </p>
          <div className="evidence-list">
            {evidence.map((item, index) => (
              <article key={`${item.memory_id}-${index}`}>
                <span className="evidence-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p>{item.reason}</p>
                  <span className="event-meta">
                    {item.mentioned_at
                      ? dateLabel(item.mentioned_at)
                      : "Source date unavailable"}
                  </span>
                  <details>
                    <summary>Source details</summary>
                    <dl>
                      <dt>Memory ID</dt>
                      <dd>{item.memory_id || "Unavailable"}</dd>
                      <dt>Document ID</dt>
                      <dd>{item.document_id || "Unavailable"}</dd>
                      <dt>Source</dt>
                      <dd>{item.source}</dd>
                    </dl>
                  </details>
                </div>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
