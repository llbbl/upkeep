// Named imports from lodash
import { debounce, throttle } from "lodash";

export function handleSearch(fn: () => void) {
  return debounce(fn, 300);
}

export function handleScroll(fn: () => void) {
  return throttle(fn, 100);
}
