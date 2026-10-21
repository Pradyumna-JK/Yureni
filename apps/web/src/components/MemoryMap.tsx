import { useState } from "react";
import { type Evidence, dateLabel } from "../lib/api";
import { Modal } from "./Modal";
import { Mark } from "./Icon";

const topics: [string, RegExp][] = [
  ["Stakeholders", /\b(stakeholder|sponsor|cfo|cto|procurement director)\b/i],
  ["Security", /\b(security|sso|audit|compliance|data.residency)\b/i],
  ["Pricing", /\b(price|pricing|budget|roi|cost|payback)\b/i],
  ["Implementation", /\b(implementation|migration|rollout|deployment)\b/i],
  ["Procurement", /\b(procurement|legal|contract|purchasing)\b/i],
  ["Timing", /\b(deadline|timeline|renewal|timing|decision date)\b/i],
  ["Requirements", /\b(requirements?|needs?|requested|requests?)\b/i],
  ["Risks", /\b(risk|concern|delay|blocked|constraint)\b/i],
];

export function MemoryMap({
  evidence,
  company,
  onAsk,
  busy,
}: {
  evidence: Evidence[];
  company: string;
  onAsk: () => void;
  busy: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);
  const unique = evidence.filter(
    (item, index, all) =>
      all.findIndex(
        (e) => (e.memory_id || e.reason) === (item.memory_id || item.reason),
      ) === index,
  );
  const nodes = topics
    .map(([label, pattern]) => ({
      label,
      items: unique.filter((e) => pattern.test(e.reason)),
    }))
    .filter((n) => n.items.length);
  const selected = nodes.find((n) => n.label === active);
  return (
    <section className="constellation">
      <div className="section-title">
        <div>
          <span className="eyebrow">MEMORY CONSTELLATION</span>
          <h2>Context, connected.</h2>
        </div>
        <span className="badge">{unique.length} returned memories</span>
      </div>
      <p className="map-description">
        Topics in the current answer and assessment evidence. Select a topic to
        inspect its memories.
      </p>
      {nodes.length ? (
        <div className="map-canvas">
          <svg
            className="map-lines"
            viewBox="0 0 600 360"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <ellipse cx="300" cy="180" rx="213" ry="131" />
            {nodes.map((node, i) => {
              const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
              return (
                <line
                  key={node.label}
                  x1="300"
                  y1="180"
                  x2={300 + 213 * Math.cos(a)}
                  y2={180 + 131 * Math.sin(a)}
                />
              );
            })}
          </svg>
          <div className="map-center">
            <Mark />
            <strong>{company}</strong>
            <span>Recalled context</span>
          </div>
          {nodes.map((node, i) => {
            const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
            return (
              <button
                key={node.label}
                className="map-node"
                aria-label={`${node.label} ${node.items.length} ${node.items.length === 1 ? "memory" : "memories"}`}
                style={{
                  left: `${50 + 35.5 * Math.cos(a)}%`,
                  top: `${50 + 36.4 * Math.sin(a)}%`,
                }}
                onClick={() => setActive(node.label)}
              >
                <span>{node.label}</span>
                <small>
                  {node.items.length}{" "}
                  {node.items.length === 1 ? "memory" : "memories"}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="map-empty">
          <Mark large />
          <h3>Let the connections emerge.</h3>
          <p>
            {unique.length
              ? "No topic matches in the current evidence. Inspect the answer’s supporting memories for the original facts."
              : "Ask Rosy a question to see topics from the memories Hindsight returns."}
          </p>
          <button className="button" onClick={onAsk} disabled={busy}>
            Explore with Rosy
          </button>
        </div>
      )}
      <p className="fine-print">
        Topic grouping uses words in returned evidence. Connections show shared
        deal context, not a Hindsight knowledge-graph export or a complete
        memory-bank inventory.
      </p>
      {selected && (
        <Modal
          title={`${selected.label} · Recalled memories`}
          onClose={() => setActive(null)}
        >
          <div className="topic-evidence">
            {selected.items.map((item, i) => (
              <article key={item.memory_id || i}>
                <span className="eyebrow">
                  MEMORY {String(i + 1).padStart(2, "0")}
                </span>
                <p>{item.reason}</p>
                <small>
                  {item.mentioned_at
                    ? dateLabel(item.mentioned_at)
                    : "Source date unavailable"}
                </small>
                <details>
                  <summary>Source details</summary>
                  <dl>
                    <dt>Source</dt>
                    <dd>{item.source}</dd>
                    <dt>Memory ID</dt>
                    <dd>{item.memory_id || "Unavailable"}</dd>
                    <dt>Document ID</dt>
                    <dd>{item.document_id || "Unavailable"}</dd>
                  </dl>
                </details>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}
