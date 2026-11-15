/**
 * Canonical JSON: one and only one text for a given value, so a hash of it means something.
 * Object keys are sorted, there is no whitespace, and anything ambiguous (undefined, NaN, dates, class
 * instances) is refused instead of being silently turned into something else.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error("canonicalJson: number is not finite");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) throw new Error("canonicalJson: only plain objects are allowed");
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return `{${keys
        .map((k) => {
          if (obj[k] === undefined) throw new Error(`canonicalJson: "${k}" is undefined`);
          return `${JSON.stringify(k)}:${canonicalJson(obj[k])}`;
        })
        .join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: cannot encode ${typeof value}`);
  }
}
