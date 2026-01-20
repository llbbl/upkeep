// Namespace import from lodash
import * as lodash from "lodash";

export function transform(data: unknown[]) {
  return lodash.map(data, (item) => item);
}
