import { merge } from "lodash";

export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  return merge({}, target, source);
}
