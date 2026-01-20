import { describe, expect, it } from "bun:test";
import { parsers } from "../../../src/lib/analyzers/deps.ts";

const {
  parseNpmOutdated,
  parsePnpmOutdated,
  parseYarnOutdated,
  parseBunOutdated,
  parseNpmAudit,
  parsePnpmAudit,
  parseYarnAudit,
} = parsers;

describe("deps analyzer", () => {
  describe("parseNpmOutdated", () => {
    it("parses npm outdated JSON output correctly", () => {
      const output = JSON.stringify({
        lodash: {
          current: "4.17.20",
          wanted: "4.17.21",
          latest: "4.17.21",
          dependent: "my-project",
          location: "node_modules/lodash",
        },
        typescript: {
          current: "5.0.0",
          wanted: "5.3.0",
          latest: "5.3.0",
          dependent: "my-project",
          location: "node_modules/typescript",
        },
      });

      const result = parseNpmOutdated(output);

      expect(result).toHaveLength(2);

      const lodash = result.find((p) => p.name === "lodash");
      expect(lodash).toBeDefined();
      expect(lodash?.current).toBe("4.17.20");
      expect(lodash?.latest).toBe("4.17.21");
      expect(lodash?.updateType).toBe("patch");
      expect(lodash?.isDevDep).toBe(false);

      const ts = result.find((p) => p.name === "typescript");
      expect(ts).toBeDefined();
      expect(ts?.current).toBe("5.0.0");
      expect(ts?.latest).toBe("5.3.0");
      expect(ts?.updateType).toBe("minor");
    });

    it("returns empty array for empty output", () => {
      expect(parseNpmOutdated("")).toEqual([]);
      expect(parseNpmOutdated("{}")).toEqual([]);
    });

    it("handles major version updates", () => {
      const output = JSON.stringify({
        next: {
          current: "13.5.0",
          wanted: "13.5.0",
          latest: "14.0.0",
          dependent: "my-project",
          location: "node_modules/next",
        },
      });

      const result = parseNpmOutdated(output);
      expect(result[0]?.updateType).toBe("major");
    });

    it("handles invalid JSON gracefully", () => {
      const result = parseNpmOutdated("not valid json");
      expect(result).toEqual([]);
    });
  });

  describe("parsePnpmOutdated", () => {
    it("parses pnpm outdated JSON output correctly", () => {
      const output = JSON.stringify({
        lodash: {
          current: "4.17.0",
          latest: "4.17.21",
          wanted: "4.17.0",
          isDeprecated: false,
          dependencyType: "dependencies",
        },
        typescript: {
          current: "5.9.2",
          latest: "5.9.3",
          wanted: "5.9.2",
          isDeprecated: false,
          dependencyType: "devDependencies",
        },
      });

      const result = parsePnpmOutdated(output);

      expect(result).toHaveLength(2);

      const lodash = result.find((p) => p.name === "lodash");
      expect(lodash).toBeDefined();
      expect(lodash?.current).toBe("4.17.0");
      expect(lodash?.latest).toBe("4.17.21");
      expect(lodash?.updateType).toBe("patch");
      expect(lodash?.isDevDep).toBe(false);

      const ts = result.find((p) => p.name === "typescript");
      expect(ts).toBeDefined();
      expect(ts?.isDevDep).toBe(true);
      expect(ts?.updateType).toBe("patch");
    });

    it("returns empty array for empty output", () => {
      expect(parsePnpmOutdated("")).toEqual([]);
      expect(parsePnpmOutdated("{}")).toEqual([]);
    });
  });

  describe("parseYarnOutdated", () => {
    it("parses yarn outdated NDJSON output correctly", () => {
      const lines = [
        '{"type":"warning","data":"package.json: No license field"}',
        '{"type":"info","data":"Color legend"}',
        '{"type":"table","data":{"head":["Package","Current","Wanted","Latest","Package Type","URL"],"body":[["lodash","4.17.0","4.17.0","4.17.21","dependencies","https://lodash.com/"],["typescript","5.9.2","5.9.2","5.9.3","devDependencies","https://www.typescriptlang.org/"]]}}',
      ];
      const output = lines.join("\n");

      const result = parseYarnOutdated(output);

      expect(result).toHaveLength(2);

      const lodash = result.find((p) => p.name === "lodash");
      expect(lodash).toBeDefined();
      expect(lodash?.current).toBe("4.17.0");
      expect(lodash?.latest).toBe("4.17.21");
      expect(lodash?.updateType).toBe("patch");
      expect(lodash?.isDevDep).toBe(false);

      const ts = result.find((p) => p.name === "typescript");
      expect(ts).toBeDefined();
      expect(ts?.isDevDep).toBe(true);
    });

    it("returns empty array for empty output", () => {
      expect(parseYarnOutdated("")).toEqual([]);
    });

    it("handles output with only warnings", () => {
      const output = '{"type":"warning","data":"some warning"}';
      expect(parseYarnOutdated(output)).toEqual([]);
    });
  });

  describe("parseBunOutdated", () => {
    it("parses bun outdated table output correctly", () => {
      const output = `bun outdated v1.3.5 (1e86cebd)
Resolving... |-----------------------------------------------|
| Package          | Current | Update | Latest  |
|------------------|---------|--------|---------|
| lodash           | 4.17.0  | 4.17.0 | 4.17.21 |
|------------------|---------|--------|---------|
| typescript (dev) | 5.9.2   | 5.9.2  | 5.9.3   |
|-----------------------------------------------|`;

      const result = parseBunOutdated(output);

      expect(result).toHaveLength(2);

      const lodash = result.find((p) => p.name === "lodash");
      expect(lodash).toBeDefined();
      expect(lodash?.current).toBe("4.17.0");
      expect(lodash?.latest).toBe("4.17.21");
      expect(lodash?.updateType).toBe("patch");
      expect(lodash?.isDevDep).toBe(false);

      const ts = result.find((p) => p.name === "typescript");
      expect(ts).toBeDefined();
      expect(ts?.current).toBe("5.9.2");
      expect(ts?.latest).toBe("5.9.3");
      expect(ts?.isDevDep).toBe(true);
    });

    it("returns empty array for output with no packages", () => {
      const output = `bun outdated v1.3.5
Resolving...`;
      expect(parseBunOutdated(output)).toEqual([]);
    });
  });

  describe("parseNpmAudit", () => {
    it("parses npm audit JSON output correctly", () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 1,
            moderate: 2,
            high: 3,
            critical: 1,
            total: 7,
          },
          dependencies: {
            prod: 10,
            dev: 5,
            optional: 0,
            peer: 0,
            peerOptional: 0,
            total: 15,
          },
        },
      });

      const result = parseNpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.critical).toBe(1);
      expect(result?.high).toBe(3);
      expect(result?.moderate).toBe(2);
      expect(result?.low).toBe(1);
    });

    it("returns null for empty output", () => {
      expect(parseNpmAudit("")).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseNpmAudit("not json")).toBeNull();
    });

    it("returns null for output without metadata", () => {
      const output = JSON.stringify({ something: "else" });
      expect(parseNpmAudit(output)).toBeNull();
    });
  });

  describe("parsePnpmAudit", () => {
    it("parses pnpm audit JSON output correctly", () => {
      const output = JSON.stringify({
        actions: [],
        advisories: {},
        muted: [],
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 3,
            high: 3,
            critical: 1,
          },
          dependencies: 3,
          devDependencies: 0,
          optionalDependencies: 0,
          totalDependencies: 3,
        },
      });

      const result = parsePnpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.critical).toBe(1);
      expect(result?.high).toBe(3);
      expect(result?.moderate).toBe(3);
      expect(result?.low).toBe(0);
    });

    it("returns null for error response", () => {
      const output = JSON.stringify({
        error: {
          code: "ERR_PNPM_AUDIT_NO_LOCKFILE",
          message: "No pnpm-lock.yaml found",
        },
      });

      expect(parsePnpmAudit(output)).toBeNull();
    });
  });

  describe("parseYarnAudit", () => {
    it("parses yarn audit NDJSON output correctly", () => {
      const lines = [
        '{"type":"auditAdvisory","data":{"resolution":{"id":123},"advisory":{}}}',
        '{"type":"auditSummary","data":{"vulnerabilities":{"info":0,"low":0,"moderate":3,"high":3,"critical":1},"dependencies":2}}',
      ];
      const output = lines.join("\n");

      const result = parseYarnAudit(output);

      expect(result).not.toBeNull();
      expect(result?.critical).toBe(1);
      expect(result?.high).toBe(3);
      expect(result?.moderate).toBe(3);
      expect(result?.low).toBe(0);
    });

    it("returns null for output without summary", () => {
      const output = '{"type":"auditAdvisory","data":{}}';
      expect(parseYarnAudit(output)).toBeNull();
    });

    it("returns null for empty output", () => {
      expect(parseYarnAudit("")).toBeNull();
    });
  });
});
