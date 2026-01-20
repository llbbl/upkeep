// Import with aliases
import { debounce as debounceFn, throttle as throttleFn } from "lodash";

export function handleSearch(fn: () => void) {
  return debounceFn(fn, 300);
}

export function handleScroll(fn: () => void) {
  return throttleFn(fn, 100);
}
