function removeDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
export function normalizeName(name: string): string {
  return removeDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function nameToSlug(name: string): string {
  return normalizeName(name).replace(/\s+/g, "-");
}
