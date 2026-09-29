# DealMind frontend and recording guide

Start the API with Docker Compose, then run `npm run dev:web` from the repository
root. Open the HTTP URL printed by Vite. The development server proxies `/api` to
`http://127.0.0.1:8000`; a deployed frontend needs an equivalent reverse proxy.
The static production build alone does not start the API.

## Visual approach

Warm white surfaces, soft green accents, system fallbacks for DM Sans/Manrope,
reusable line icons, and a custom SVG mark. The interface borrows spacious layout
and a focused question composer from the references; it uses DealMind branding.
Google Fonts is optional; system fonts render when the network is unavailable.

## For your intro video

1. Open **Intro studio** in the top bar. It provides three title frames with a
   16:9 desktop composition. Advance with the arrow keys or buttons. Escape closes.
2. Capture the frame area, cropping out the dialog header and navigation controls.
   The title frames are presentation copy, not recorded customer results.
3. Return to the workspace and use the focus icon to hide the sidebar for closeups.
4. Select Acme, ask a real question, then open **Inspect supporting memories**.
   Record after the response arrives; local model calls may take a minute or more.
5. Capture the overview, timeline, and recommendation as separate clips.

The scalable, transparent logo is at `apps/web/public/dealmind-mark.svg` (served
at `/dealmind-mark.svg`). It can be imported into your video editor.
Reduced-motion preferences disable transition effects. No automatic recording,
video export, or synthetic evidence is included.

## What the screens show

- Overview: selected account, question composer, on-demand assessment, timeline,
  and stakeholders. No assessment is shown until the API returns one.
- Deals: all API pages, search, open pipeline excluding won/lost deals, and counts.
- Memory: original stored interactions and retention status. This is a source
  explorer; it does not claim that every source was successfully recalled.
- Ask DealMind: a focused question view with cited memories and temporal change
  when the API supplies it. Changing accounts discards stale responses.
- Forms: create deals or add meeting/email/note text. If ingestion fails after a
  possible save, the UI asks you to inspect the timeline before submitting again.

There is no invented risk trend or probability chart. The existing backend score
is explicitly labeled heuristic because keyword matching can include resolved
concerns. Source IDs and dates are displayed as supplied by the API.

## Verification

`npm --workspace @dealmind/web test` covers real component interactions with mocked
API responses: evidence inspection, stale-response isolation, empty memory, API
failure, deal filtering, intro frame navigation, and failed-retention handling.
`npm run build:web` runs TypeScript and emits the production bundle.
