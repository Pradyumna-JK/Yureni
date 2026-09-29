import { useEffect, useState } from "react";
import { Icon, Mark } from "./Icon";
import { Modal } from "./Modal";

const scenes = [
  {
    eyebrow: "EVERY CONVERSATION COUNTS",
    title: (
      <>
        A good deal starts
        <br />
        with a better memory.
      </>
    ),
    text: "Meet DealMind. Your deal intelligence agent.",
  },
  {
    eyebrow: "CONTEXT THAT STAYS WITH YOU",
    title: (
      <>
        Remember the details.
        <br />
        Understand the change.
      </>
    ),
    text: "Connect stakeholder concerns, decisions, and conversations over time.",
  },
  {
    eyebrow: "FROM HISTORY TO YOUR NEXT MOVE",
    title: (
      <>
        Know why.
        <br />
        <span>Know what’s next.</span>
      </>
    ),
    text: "Ask a question. Follow the evidence. Move the conversation forward.",
  },
];
export function Intro({ onClose }: { onClose: () => void }) {
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setScene((s) => Math.min(2, s + 1));
      if (e.key === "ArrowLeft") setScene((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  return (
    <Modal title="DealMind · Intro studio" onClose={onClose} wide>
      <div className="intro-stage" key={scene}>
        <div className="intro-brand">
          <Mark large />
          <span>DealMind</span>
        </div>
        <p className="eyebrow">{scenes[scene].eyebrow}</p>
        <h1>{scenes[scene].title}</h1>
        <p>{scenes[scene].text}</p>
        <div className="intro-signature">
          <span className="status-dot" /> Persistent memory, powered by
          Hindsight
        </div>
      </div>
      <footer className="intro-controls">
        <span>
          Frame {scene + 1} of 3{" "}
          <span className="muted">
            · Use ← → to advance · Crop to the frame for video
          </span>
        </span>
        <div className="button-row">
          <button
            className="button"
            disabled={scene === 0}
            onClick={() => setScene(scene - 1)}
          >
            <Icon name="back" /> Previous
          </button>
          <button
            className="button primary"
            onClick={() => (scene < 2 ? setScene(scene + 1) : onClose())}
          >
            {scene < 2 ? "Next frame" : "Open workspace"}
            <Icon name="chevron" />
          </button>
        </div>
      </footer>
    </Modal>
  );
}
