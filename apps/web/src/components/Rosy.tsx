export function Rosy({ small = false }: { small?: boolean }) {
  return (
    <img
      className={`rosy-avatar ${small ? "small" : ""}`}
      src="/rosy.png"
      alt="Rosy"
      width={48}
      height={48}
    />
  );
}
