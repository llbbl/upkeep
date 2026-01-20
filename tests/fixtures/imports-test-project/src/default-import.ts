// Default import from lodash
import _ from "lodash";

export function transform(data: unknown[]) {
  return _.map(data, (item) => item);
}
