// Dynamic import
export async function loadLodash() {
  const lodash = await import("lodash");
  return lodash.default;
}

export async function loadDebounce() {
  const { debounce } = await import("lodash");
  return debounce;
}
