export function formatCompactPublicKey(value: string): string {
  const compactValue = value.trim();
  if (compactValue.length <= 16) {
    return compactValue;
  }

  return `${compactValue.slice(0, 8)}...${compactValue.slice(-8)}`;
}
