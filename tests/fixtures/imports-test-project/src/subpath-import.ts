// Subpath imports from lodash
import debounce from "lodash/debounce";
import throttle from "lodash/throttle";

export function handleSearch(fn: () => void) {
  return debounce(fn, 300);
}

export function handleScroll(fn: () => void) {
  return throttle(fn, 100);
}
