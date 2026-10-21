import { formatCurrency } from "../lib/format";
import { dateLabel, humanize, type Deal } from "../lib/api";
import { Icon } from "./Icon";
import { Rosy } from "./Rosy";

type Props = {
  deals: Deal[];
  selected: string;
  onSelect: (id: string) => void;
  onAsk: () => void;
  onOpenPipeline: () => void;
};
const lanes = [
  { key: "discovery", label: "Discovery" },
  { key: "evaluation", label: "Evaluation" },
  { key: "negotiation", label: "Negotiation" },
  { key: "closed_won", label: "Won" },
];
const now = Date.now();

function daysSince(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.round((now - parsed) / 86_400_000));
}

function attentionReason(deal: Deal) {
  const idleDays = daysSince(deal.last_interaction_at);
  if (idleDays === null) return "No recent activity recorded";
  if (deal.interaction_count <= 1) return "Needs more retained context";
  if (deal.stage === "negotiation") return "Decision-stage account";
  if (idleDays > 30) return `${idleDays} days since last interaction`;
  return "Recently active";
}

function scoreAttention(deal: Deal) {
  const idleDays = daysSince(deal.last_interaction_at) ?? 120;
  const valueWeight = Math.min(Number(deal.value || 0) / 10000, 45);
  const lowContext = Math.max(0, 4 - deal.interaction_count) * 10;
  const stageWeight = deal.stage === "negotiation" ? 22 : 0;
  return idleDays + valueWeight + lowContext + stageWeight;
}

export function CommandCenter({
  deals,
  selected,
  onSelect,
  onAsk,
  onOpenPipeline,
}: Props) {
  const openDeals = deals.filter(
    (deal) => !["closed_won", "closed_lost"].includes(deal.stage),
  );
  const pipeline = openDeals.reduce(
    (total, deal) => total + Number(deal.value || 0),
    0,
  );
  const activeInteractions = deals.reduce(
    (total, deal) => total + deal.interaction_count,
    0,
  );
  const retainedDeals = deals.filter((deal) => deal.interaction_count > 0);
  const memoryCoverage = deals.length
    ? Math.round((retainedDeals.length / deals.length) * 100)
    : 0;
  const avgStakeholders = openDeals.length
    ? Math.round(
        openDeals.reduce((total, deal) => total + deal.stakeholder_count, 0) /
          openDeals.length,
      )
    : 0;
  const largestDeal = openDeals
    .slice()
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))[0];
  const attention = openDeals
    .slice()
    .sort((a, b) => scoreAttention(b) - scoreAttention(a))
    .slice(0, 4);
  const recent = deals
    .filter((deal) => deal.last_interaction_at)
    .slice()
    .sort(
      (a, b) =>
        Date.parse(b.last_interaction_at || "") -
        Date.parse(a.last_interaction_at || ""),
    )
    .slice(0, 4);
  const selectedDeal = deals.find((deal) => deal.id === selected);
  return (
    <section className="command-center" aria-label="Command Center dashboard">
      <div className="dashboard-intro">
        <div>
          <span className="eyebrow">YOUR REVENUE COMMAND CENTER</span>
          <h2>The operating view before every sales call.</h2>
          <p>
            A quiet workspace for spotting stalled accounts, thin memory, and
            the next deal Rosy should inspect.
          </p>
        </div>
        <button className="button" onClick={onOpenPipeline}>
          <Icon name="deals" size={16} /> Open pipeline
        </button>
      </div>
      <div className="dashboard-metrics">
        <article>
          <span>Open pipeline</span>
          <strong>{formatCurrency(pipeline)}</strong>
          <small>{openDeals.length} active opportunities</small>
        </article>
        <article>
          <span>Accounts in motion</span>
          <strong>{openDeals.length}</strong>
          <small>excluding closed outcomes</small>
        </article>
        <article>
          <span>Conversation signals</span>
          <strong>{activeInteractions}</strong>
          <small>recorded interactions</small>
        </article>
      </div>
      <div className="dashboard-hero-grid">
        <section className="pipeline-snapshot" aria-labelledby="snapshot-title">
          <div className="dashboard-section-head">
            <div>
              <span className="eyebrow">EXECUTIVE SNAPSHOT</span>
              <h3 id="snapshot-title">Portfolio pressure</h3>
            </div>
            <span className="muted">Live deal list</span>
          </div>
          <div className="snapshot-layout">
            <div className="value-ring" aria-label={`${memoryCoverage}% memory coverage`}>
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="ring-bg" cx="60" cy="60" r="48" />
                <circle
                  className="ring-progress"
                  cx="60"
                  cy="60"
                  r="48"
                  pathLength="100"
                  style={{ strokeDasharray: `${memoryCoverage} 100` }}
                />
              </svg>
              <span>{memoryCoverage}%</span>
              <small>memory coverage</small>
            </div>
            <div className="snapshot-facts">
              <article>
                <span>Largest live account</span>
                <strong>{largestDeal?.company.name ?? "No open deals"}</strong>
                <small>
                  {largestDeal
                    ? formatCurrency(largestDeal.value)
                    : "Create an opportunity"}
                </small>
              </article>
              <article>
                <span>Average buying group</span>
                <strong>{avgStakeholders}</strong>
                <small>stakeholders per open deal</small>
              </article>
              <article>
                <span>Deals with memory</span>
                <strong>
                  {retainedDeals.length}/{deals.length}
                </strong>
                <small>accounts with retained interactions</small>
              </article>
            </div>
          </div>
        </section>
        <section className="attention-queue" aria-labelledby="queue-title">
          <div className="dashboard-section-head">
            <div>
              <span className="eyebrow">ROSY'S QUEUE</span>
              <h3 id="queue-title">Accounts to inspect first</h3>
            </div>
            <Rosy small />
          </div>
          <div className="queue-list">
            {attention.map((deal, index) => (
              <button key={deal.id} onClick={() => onSelect(deal.id)}>
                <span className="queue-rank">{index + 1}</span>
                <span>
                  <strong>{deal.company.name}</strong>
                  <small>{attentionReason(deal)}</small>
                </span>
                <b>{formatCurrency(deal.value)}</b>
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="dashboard-grid">
        <section className="pipeline-board" aria-labelledby="pipeline-heading">
          <div className="dashboard-section-head">
            <div>
              <span className="eyebrow">PORTFOLIO SHAPE</span>
              <h3 id="pipeline-heading">Where deals are moving</h3>
            </div>
            <span className="muted">{deals.length} total accounts</span>
          </div>
          <div className="pipeline-lanes">
            {lanes.map((lane) => {
              const laneDeals = deals.filter((deal) => deal.stage === lane.key);
              const laneValue = laneDeals.reduce(
                (total, deal) => total + Number(deal.value || 0),
                0,
              );
              return (
                <div className="pipeline-lane" key={lane.key}>
                  <div className="lane-head">
                    <span>
                      {lane.label}
                      <small>{formatCurrency(laneValue)}</small>
                    </span>
                    <b>{laneDeals.length}</b>
                  </div>
                  {laneDeals.length ? (
                    laneDeals.map((deal) => (
                      <button
                        key={deal.id}
                        className={`pipeline-deal ${deal.id === selected ? "selected" : ""}`}
                        onClick={() => onSelect(deal.id)}
                      >
                        <span className="pipeline-company">
                          <i>{deal.company.name.slice(0, 1)}</i>
                          <strong>{deal.company.name}</strong>
                        </span>
                        <span>{formatCurrency(deal.value)}</span>
                        <small>{deal.interaction_count} interactions</small>
                      </button>
                    ))
                  ) : (
                    <p className="lane-empty">No live deals</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <aside className="focus-card" aria-labelledby="focus-heading">
          <div className="focus-card-top">
            <Rosy small />
            <span className="eyebrow">ROSY'S FOCUS</span>
            <span className="status-dot" />
          </div>
          <h3 id="focus-heading">
            {selectedDeal ? selectedDeal.company.name : "Select a deal"}
          </h3>
          <p>
            {selectedDeal
              ? "Open this account to see the story, ask a question, or inspect the exact memories behind Rosy's answer."
              : "Choose an account to give Rosy a starting point."}
          </p>
          <div className="focus-card-facts">
            {selectedDeal && (
              <>
                <span>{humanize(selectedDeal.stage)}</span>
                <span>{formatCurrency(selectedDeal.value)}</span>
                <span>{selectedDeal.stakeholder_count} stakeholders</span>
              </>
            )}
          </div>
          <button
            className="button primary"
            disabled={!selectedDeal}
            onClick={onAsk}
          >
            Ask Rosy about this deal <Icon name="arrow" size={15} />
          </button>
        </aside>
      </div>
      <section className="workspace-actions" aria-labelledby="actions-heading">
        <div className="dashboard-section-head">
          <div>
            <span className="eyebrow">DEMO WORKFLOW</span>
            <h3 id="actions-heading">Show the memory loop</h3>
          </div>
          <span className="muted">Best for screenshots and video</span>
        </div>
        <div className="action-rail">
          <button onClick={() => selectedDeal && onSelect(selectedDeal.id)}>
            <Icon name="clock" size={17} />
            <span>
              <strong>Open deal story</strong>
              <small>Timeline, stakeholders, source interactions</small>
            </span>
          </button>
          <button onClick={onAsk} disabled={!selectedDeal}>
            <Icon name="chat" size={17} />
            <span>
              <strong>Ask Rosy</strong>
              <small>Recall Hindsight memory and show evidence</small>
            </span>
          </button>
          <button onClick={onOpenPipeline}>
            <Icon name="deals" size={17} />
            <span>
              <strong>Compare accounts</strong>
              <small>Stage, value, context depth</small>
            </span>
          </button>
        </div>
      </section>
      <section className="activity-strip" aria-labelledby="activity-heading">
        <div className="dashboard-section-head">
          <div>
            <span className="eyebrow">RECENT MOVEMENT</span>
            <h3 id="activity-heading">What changed in the portfolio</h3>
          </div>
          <span className="muted">Latest recorded dates</span>
        </div>
        <div className="activity-list">
          {recent.length ? (
            recent.map((deal) => (
              <button key={deal.id} onClick={() => onSelect(deal.id)}>
                <span className="activity-dot" />
                <span>
                  <strong>{deal.company.name}</strong>
                  <small>{humanize(deal.stage)}</small>
                </span>
                <time>{dateLabel(deal.last_interaction_at)}</time>
                <Icon name="chevron" size={15} />
              </button>
            ))
          ) : (
            <p className="empty-inline">
              No interactions have been recorded yet.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
