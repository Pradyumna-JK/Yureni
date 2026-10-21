export type IconName =
  | "home"
  | "people"
  | "spark"
  | "deals"
  | "memory"
  | "chat"
  | "arrow"
  | "plus"
  | "close"
  | "chevron"
  | "play"
  | "focus"
  | "check"
  | "clock"
  | "file"
  | "search"
  | "back"
  | "mic"
  | "volume";
const paths: Record<IconName, string> = {
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-3a4 4 0 0 1 0 8m1 3a4 4 0 0 1 3 4v2",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  home: "m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7",
  deals: "M4 7h16v13H4V7Zm4 0V4h8v3M4 12h16m-10 0v3h4v-3",
  memory:
    "M12 3c5 0 9 2 9 4s-4 4-9 4-9-2-9-4 4-4 9-4Zm-9 4v10c0 2 4 4 9 4s9-2 9-4V7M3 12c0 2 4 4 9 4s9-2 9-4",
  chat: "M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z",
  arrow: "M12 19V5m-6 6 6-6 6 6",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  play: "m8 4 13 8-13 8V4Z",
  focus: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  file: "M5 3h9l5 5v13H5V3Zm9 0v6h5M8 13h8m-8 4h6",
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  back: "M20 12H4m6-6-6 6 6 6",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8",
  volume: "M4 10v4h4l5 4V6l-5 4H4Zm13-1a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12",
};
export function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Mark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-mark ${large ? "large" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path
          d="M10 10h8c16 0 16 20 0 20h-8V10Z"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M16 14h4c8 0 8 12 0 12h-4"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="10" cy="20" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}
