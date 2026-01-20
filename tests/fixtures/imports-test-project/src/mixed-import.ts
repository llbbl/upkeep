// Mixed imports: default + named
import _, { pick, omit } from "lodash";

export function transform(data: Record<string, unknown>) {
  const picked = pick(data, ["a", "b"]);
  const omitted = omit(data, ["c"]);
  return _.merge(picked, omitted);
}
