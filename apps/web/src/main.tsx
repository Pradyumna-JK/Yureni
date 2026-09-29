import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 960, margin: "8rem auto", padding: "0 2rem" }}>
      <p style={{ color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" }}>DealMind</p>
      <h1>Revenue intelligence with persistent memory.</h1>
      <p>The backend vertical slice is ready. The Deal Detail experience is the next build phase.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
