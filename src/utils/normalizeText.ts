export function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bnao\b/g, "não")
    .replace(/\bacao\b/g, "ação");
}
