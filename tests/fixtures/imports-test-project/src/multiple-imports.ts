// Multiple import statements for lodash in the same file
import { debounce } from "lodash";
import { throttle } from "lodash";
import merge from "lodash/merge";

export function handleSearch(fn: () => void) {
  return debounce(fn, 300);
}

export function handleScroll(fn: () => void) {
  return throttle(fn, 100);
}

export function deepMerge<T extends object>(a: T, b: T): T {
  return merge(a, b);
}
