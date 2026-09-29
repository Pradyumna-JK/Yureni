import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // The temporary Localtunnel hostname is allowlisted for the current demo.
    // Replace this with the deployed host (or remove it) before production.
    allowedHosts: ["wet-bobcats-beg.loca.lt"],
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
