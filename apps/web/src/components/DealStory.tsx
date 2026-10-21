import { dateLabel, humanize, type Interaction, type Answer } from "../lib/api";
import { Icon } from "./Icon";

export function TemporalContext({
  insight,
}: {
  insight: NonNullable<Answer["temporal_insight"]>;
}) {
  return (
    <section className="temporal-context" aria-label="What changed">
      <div className="temporal">
        <div>
          <span>PREVIOUS STATE</span>
          <p>{insight.previous_state}</p>
        </div>
        <Icon name="chevron" />
        <div>
          <span>CURRENT STATE</span>
          <p>{insight.current_state}</p>
        </div>
      </div>
      <div className="temporal-shift">
        <span className="eyebrow">THE SHIFT</span>
        <p>{insight.change}</p>
      </div>
    </section>
  );
}

export function DealStory({
  timeline,
  loading,
  onOpen,
  onChange,
  busy,
}: {
  timeline: Interaction[];
  loading: boolean;
  onOpen: (item: Interaction) => void;
  onChange: () => void;
  busy: boolean;
}) {
  const chronological = [...timeline].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
  );
  // This is a dated source overview, never an inferred change or risk conclusion.
  const milestones =
    chronological.length > 3
      ? [
          chronological[0],
          chronological[Math.floor((chronological.length - 1) / 2)],
          chronological[chronological.length - 1],
        ]
      : chronological;
  return (
    <section className="deal-story" aria-label="The deal story">
      <div className="story-heading">
        <div>
          <span className="eyebrow">01 / THE DEAL STORY</span>
          <h2>From first conversation to next move.</h2>
        </div>
        <button
          className="button story-action"
          disabled={busy || !timeline.length}
          onClick={onChange}
        >
          <Icon name="clock" size={16} /> What changed?
        </button>
      </div>
      <p className="story-description">
        Follow the source history. Ask Rosy to connect the changes.
      </p>
      {loading ? (
        <p className="empty-inline" role="status">
          Loading the deal story…
        </p>
      ) : milestones.length ? (
        <div className="story-track">
          {milestones.map((item, index) => (
            <button
              className="story-event"
              key={item.id}
              onClick={() => onOpen(item)}
            >
              <div className="story-track-label">
                <span className="story-dot" />
                <span>
                  {index === 0
                    ? "FIRST RECORDED"
                    : index === milestones.length - 1
                      ? "LATEST RECORDED"
                      : "ALONG THE WAY"}
                </span>
              </div>
              <time dateTime={item.occurred_at}>
                {dateLabel(item.occurred_at)}
              </time>
              <h3>{item.subject || humanize(item.interaction_type)}</h3>
              <span className="story-event-footer">
                {humanize(item.interaction_type)}
                <Icon name="chevron" size={14} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-inline">
          No memory yet. Add a conversation to begin the story.
        </p>
      )}
    </section>
  );
}
