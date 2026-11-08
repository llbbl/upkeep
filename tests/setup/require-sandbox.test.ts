import { existsSync } from "node:fs";

// This prevents accidental host runs; a PR can still remove the guard.
if (process.env.UPKEEP_SANDBOX !== "1" || !existsSync("/.dockerenv")) {
  throw new Error("Tests run only in the sandbox: use `just test` (or `just coverage-check`).");
}
