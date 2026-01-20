// CommonJS require for lodash
const lodash = require("lodash");

export function transform(data: unknown[]) {
  return lodash.map(data, (item) => item);
}
