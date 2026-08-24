/** Formats a shot for the shot history list: "№17 • 10.4" (miss renders as "0.0"). */
export function shotListLabel(shotNumber: number, score: number): string {
  const scoreLabel = score > 0 ? (score / 10).toFixed(1) : '0.0';
  return `№${shotNumber} • ${scoreLabel}`;
}
