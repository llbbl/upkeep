import { describe, expect, it } from "bun:test";
import { parsers } from "../../../src/lib/analyzers/audit.ts";

const { parseNpmAudit, parsePnpmAudit, parseYarnAudit } = parsers;

describe("audit analyzer", () => {
  describe("parseNpmAudit", () => {
    it("parses npm audit JSON output with vulnerabilities", () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          "nth-check": {
            name: "nth-check",
            severity: "high",
            isDirect: false,
            via: [
              {
                source: 1090557,
                name: "nth-check",
                dependency: "nth-check",
                title: "Inefficient Regular Expression Complexity",
                url: "https://github.com/advisories/GHSA-rp65-9cf3-cjxr",
                severity: "high",
                cwe: ["CWE-1333"],
                cvss: { score: 7.5, vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" },
                range: "<2.0.1",
              },
            ],
            effects: ["css-select"],
            range: "<2.0.1",
            nodes: ["node_modules/nth-check"],
            fixAvailable: {
              name: "react-scripts",
              version: "5.0.0",
              isSemVerMajor: true,
            },
          },
          "css-select": {
            name: "css-select",
            severity: "high",
            isDirect: false,
            via: ["nth-check"],
            effects: ["svgo"],
            range: "<=3.1.0",
            nodes: ["node_modules/css-select"],
            fixAvailable: {
              name: "react-scripts",
              version: "5.0.0",
              isSemVerMajor: true,
            },
          },
        },
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 2,
            high: 1,
            critical: 0,
            total: 3,
          },
          dependencies: {
            prod: 100,
            dev: 50,
            optional: 0,
            peer: 0,
            peerOptional: 0,
            total: 150,
          },
        },
      });

      const result = parseNpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.summary.critical).toBe(0);
      expect(result?.summary.high).toBe(1);
      expect(result?.summary.moderate).toBe(2);
      expect(result?.summary.low).toBe(0);
      expect(result?.summary.total).toBe(3);

      // Should have the nth-check vulnerability (css-select is just a passthrough)
      const nthCheck = result?.vulnerabilities.find((v) => v.package === "nth-check");
      expect(nthCheck).toBeDefined();
      expect(nthCheck?.severity).toBe("high");
      expect(nthCheck?.title).toBe("Inefficient Regular Expression Complexity");
      expect(nthCheck?.fixAvailable).toBe(true);
      expect(nthCheck?.fixVersion).toBe("5.0.0");
    });

    it("parses npm audit with direct vulnerabilities", () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          lodash: {
            name: "lodash",
            severity: "critical",
            isDirect: true,
            via: [
              {
                source: 1085063,
                name: "lodash",
                dependency: "lodash",
                title: "Prototype Pollution",
                url: "https://github.com/advisories/GHSA-jf85-cpcp-j695",
                severity: "critical",
                range: "<4.17.21",
              },
            ],
            effects: [],
            range: "<4.17.21",
            nodes: ["node_modules/lodash"],
            fixAvailable: true,
          },
        },
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 0,
            high: 0,
            critical: 1,
            total: 1,
          },
        },
      });

      const result = parseNpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.summary.critical).toBe(1);
      expect(result?.summary.total).toBe(1);

      const lodash = result?.vulnerabilities.find((v) => v.package === "lodash");
      expect(lodash).toBeDefined();
      expect(lodash?.severity).toBe("critical");
      expect(lodash?.title).toBe("Prototype Pollution");
      expect(lodash?.path).toBe("lodash");
      expect(lodash?.fixAvailable).toBe(true);
      expect(lodash?.fixVersion).toBeNull(); // fixAvailable is boolean, not object
    });

    it("returns empty result for no vulnerabilities", () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 0,
            high: 0,
            critical: 0,
            total: 0,
          },
        },
      });

      const result = parseNpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.vulnerabilities).toHaveLength(0);
      expect(result?.summary.total).toBe(0);
    });

    it("returns null for empty output", () => {
      expect(parseNpmAudit("")).toBeNull();
      expect(parseNpmAudit("   ")).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseNpmAudit("not valid json")).toBeNull();
    });

    it("returns null for output without metadata", () => {
      const output = JSON.stringify({ vulnerabilities: {} });
      expect(parseNpmAudit(output)).toBeNull();
    });

    it("handles different severity levels", () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          "pkg-low": {
            name: "pkg-low",
            severity: "low",
            isDirect: true,
            via: [{ title: "Low severity issue", severity: "low" }],
            effects: [],
            range: "*",
            nodes: [],
            fixAvailable: false,
          },
          "pkg-moderate": {
            name: "pkg-moderate",
            severity: "moderate",
            isDirect: true,
            via: [{ title: "Moderate severity issue", severity: "moderate" }],
            effects: [],
            range: "*",
            nodes: [],
            fixAvailable: false,
          },
          "pkg-high": {
            name: "pkg-high",
            severity: "high",
            isDirect: true,
            via: [{ title: "High severity issue", severity: "high" }],
            effects: [],
            range: "*",
            nodes: [],
            fixAvailable: false,
          },
          "pkg-critical": {
            name: "pkg-critical",
            severity: "critical",
            isDirect: true,
            via: [{ title: "Critical severity issue", severity: "critical" }],
            effects: [],
            range: "*",
            nodes: [],
            fixAvailable: false,
          },
        },
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 1,
            moderate: 1,
            high: 1,
            critical: 1,
            total: 4,
          },
        },
      });

      const result = parseNpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.vulnerabilities).toHaveLength(4);

      const low = result?.vulnerabilities.find((v) => v.package === "pkg-low");
      expect(low?.severity).toBe("low");

      const moderate = result?.vulnerabilities.find((v) => v.package === "pkg-moderate");
      expect(moderate?.severity).toBe("moderate");

      const high = result?.vulnerabilities.find((v) => v.package === "pkg-high");
      expect(high?.severity).toBe("high");

      const critical = result?.vulnerabilities.find((v) => v.package === "pkg-critical");
      expect(critical?.severity).toBe("critical");
    });
  });

  describe("parsePnpmAudit", () => {
    it("parses pnpm audit JSON output with vulnerabilities", () => {
      const output = JSON.stringify({
        actions: [],
        advisories: {
          "1090557": {
            id: 1090557,
            module_name: "nth-check",
            severity: "high",
            title: "Inefficient Regular Expression Complexity in nth-check",
            url: "https://github.com/advisories/GHSA-rp65-9cf3-cjxr",
            vulnerable_versions: "<2.0.1",
            patched_versions: ">=2.0.1",
            overview: "nth-check is vulnerable to...",
            recommendation: "Upgrade to version 2.0.1 or later",
            cwe: ["CWE-1333"],
            findings: [
              {
                version: "1.0.2",
                paths: ["react-scripts>@svgr/webpack>@svgr/plugin-svgo>svgo>css-select>nth-check"],
              },
            ],
          },
        },
        muted: [],
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 0,
            high: 1,
            critical: 0,
          },
          dependencies: 100,
          devDependencies: 50,
          optionalDependencies: 0,
          totalDependencies: 150,
        },
      });

      const result = parsePnpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.summary.high).toBe(1);
      expect(result?.summary.total).toBe(1);

      expect(result?.vulnerabilities).toHaveLength(1);
      const vuln = result?.vulnerabilities[0];
      expect(vuln?.package).toBe("nth-check");
      expect(vuln?.severity).toBe("high");
      expect(vuln?.title).toBe("Inefficient Regular Expression Complexity in nth-check");
      expect(vuln?.path).toBe(
        "react-scripts > @svgr/webpack > @svgr/plugin-svgo > svgo > css-select > nth-check"
      );
      expect(vuln?.fixAvailable).toBe(true);
      expect(vuln?.fixVersion).toBe("2.0.1");
    });

    it("parses pnpm audit with multiple vulnerabilities", () => {
      const output = JSON.stringify({
        advisories: {
          "123": {
            id: 123,
            module_name: "vulnerable-pkg-1",
            severity: "critical",
            title: "Critical vulnerability",
            url: "https://example.com/123",
            vulnerable_versions: "<1.0.0",
            patched_versions: ">=1.0.0",
            overview: "",
            recommendation: "",
            cwe: [],
            findings: [{ version: "0.9.0", paths: ["vulnerable-pkg-1"] }],
          },
          "456": {
            id: 456,
            module_name: "vulnerable-pkg-2",
            severity: "moderate",
            title: "Moderate vulnerability",
            url: "https://example.com/456",
            vulnerable_versions: "<2.0.0",
            patched_versions: ">=2.0.0",
            overview: "",
            recommendation: "",
            cwe: [],
            findings: [{ version: "1.9.0", paths: ["some-dep>vulnerable-pkg-2"] }],
          },
        },
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 1,
            high: 0,
            critical: 1,
          },
        },
      });

      const result = parsePnpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.summary.critical).toBe(1);
      expect(result?.summary.moderate).toBe(1);
      expect(result?.summary.total).toBe(2);
      expect(result?.vulnerabilities).toHaveLength(2);
    });

    it("returns null for pnpm error response", () => {
      const output = JSON.stringify({
        error: {
          code: "ERR_PNPM_AUDIT_NO_LOCKFILE",
          message: "No pnpm-lock.yaml found",
        },
      });

      expect(parsePnpmAudit(output)).toBeNull();
    });

    it("returns null for empty output", () => {
      expect(parsePnpmAudit("")).toBeNull();
    });

    it("handles no fix available", () => {
      const output = JSON.stringify({
        advisories: {
          "789": {
            id: 789,
            module_name: "unfixable-pkg",
            severity: "high",
            title: "No fix available",
            url: "https://example.com/789",
            vulnerable_versions: "*",
            patched_versions: "<0.0.0",
            overview: "",
            recommendation: "",
            cwe: [],
            findings: [{ version: "1.0.0", paths: ["unfixable-pkg"] }],
          },
        },
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 0,
            high: 1,
            critical: 0,
          },
        },
      });

      const result = parsePnpmAudit(output);

      expect(result).not.toBeNull();
      const vuln = result?.vulnerabilities[0];
      expect(vuln?.fixAvailable).toBe(false);
      expect(vuln?.fixVersion).toBeNull();
    });

    it("returns empty result for no vulnerabilities", () => {
      const output = JSON.stringify({
        advisories: {},
        metadata: {
          vulnerabilities: {
            info: 0,
            low: 0,
            moderate: 0,
            high: 0,
            critical: 0,
          },
        },
      });

      const result = parsePnpmAudit(output);

      expect(result).not.toBeNull();
      expect(result?.vulnerabilities).toHaveLength(0);
      expect(result?.summary.total).toBe(0);
    });
  });

  describe("parseYarnAudit", () => {
    it("parses yarn audit NDJSON output with vulnerabilities", () => {
      const lines = [
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: {
              id: 1090557,
              path: "react-scripts>@svgr/webpack>@svgr/plugin-svgo>svgo>css-select>nth-check",
              dev: false,
              optional: false,
              bundled: false,
            },
            advisory: {
              id: 1090557,
              module_name: "nth-check",
              severity: "high",
              title: "Inefficient Regular Expression Complexity",
              url: "https://github.com/advisories/GHSA-rp65-9cf3-cjxr",
              vulnerable_versions: "<2.0.1",
              patched_versions: ">=2.0.1",
              overview: "nth-check is vulnerable to...",
              recommendation: "Upgrade to version 2.0.1 or later",
              cwe: ["CWE-1333"],
            },
          },
        }),
        JSON.stringify({
          type: "auditSummary",
          data: {
            vulnerabilities: {
              info: 0,
              low: 0,
              moderate: 0,
              high: 1,
              critical: 0,
            },
            dependencies: 150,
          },
        }),
      ];
      const output = lines.join("\n");

      const result = parseYarnAudit(output);

      expect(result).not.toBeNull();
      expect(result?.summary.high).toBe(1);
      expect(result?.summary.total).toBe(1);

      expect(result?.vulnerabilities).toHaveLength(1);
      const vuln = result?.vulnerabilities[0];
      expect(vuln?.package).toBe("nth-check");
      expect(vuln?.severity).toBe("high");
      expect(vuln?.title).toBe("Inefficient Regular Expression Complexity");
      expect(vuln?.path).toBe(
        "react-scripts > @svgr/webpack > @svgr/plugin-svgo > svgo > css-select > nth-check"
      );
      expect(vuln?.fixAvailable).toBe(true);
      expect(vuln?.fixVersion).toBe("2.0.1");
    });

    it("parses yarn audit with multiple vulnerabilities", () => {
      const lines = [
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: { id: 1, path: "pkg-a", dev: false, optional: false, bundled: false },
            advisory: {
              id: 1,
              module_name: "pkg-a",
              severity: "critical",
              title: "Critical issue",
              url: "",
              vulnerable_versions: "*",
              patched_versions: ">=1.0.0",
              overview: "",
              recommendation: "",
              cwe: [],
            },
          },
        }),
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: { id: 2, path: "dep>pkg-b", dev: false, optional: false, bundled: false },
            advisory: {
              id: 2,
              module_name: "pkg-b",
              severity: "moderate",
              title: "Moderate issue",
              url: "",
              vulnerable_versions: "*",
              patched_versions: ">=2.0.0",
              overview: "",
              recommendation: "",
              cwe: [],
            },
          },
        }),
        JSON.stringify({
          type: "auditSummary",
          data: {
            vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 1 },
          },
        }),
      ];
      const output = lines.join("\n");

      const result = parseYarnAudit(output);

      expect(result).not.toBeNull();
      expect(result?.summary.critical).toBe(1);
      expect(result?.summary.moderate).toBe(1);
      expect(result?.summary.total).toBe(2);
      expect(result?.vulnerabilities).toHaveLength(2);
    });

    it("handles yarn output with warnings before advisories", () => {
      const lines = [
        '{"type":"warning","data":"package.json: No license field"}',
        '{"type":"info","data":"Color legend"}',
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: { id: 1, path: "pkg", dev: false, optional: false, bundled: false },
            advisory: {
              id: 1,
              module_name: "pkg",
              severity: "high",
              title: "High issue",
              url: "",
              vulnerable_versions: "*",
              patched_versions: ">=1.0.0",
              overview: "",
              recommendation: "",
              cwe: [],
            },
          },
        }),
        JSON.stringify({
          type: "auditSummary",
          data: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
        }),
      ];
      const output = lines.join("\n");

      const result = parseYarnAudit(output);

      expect(result).not.toBeNull();
      expect(result?.vulnerabilities).toHaveLength(1);
      expect(result?.summary.high).toBe(1);
    });

    it("returns null for output without summary or advisories", () => {
      const output = '{"type":"warning","data":"some warning"}';
      expect(parseYarnAudit(output)).toBeNull();
    });

    it("returns null for empty output", () => {
      expect(parseYarnAudit("")).toBeNull();
    });

    it("calculates summary from vulnerabilities if summary line is missing", () => {
      const lines = [
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: { id: 1, path: "pkg-a", dev: false, optional: false, bundled: false },
            advisory: {
              id: 1,
              module_name: "pkg-a",
              severity: "high",
              title: "High issue",
              url: "",
              vulnerable_versions: "*",
              patched_versions: ">=1.0.0",
              overview: "",
              recommendation: "",
              cwe: [],
            },
          },
        }),
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: { id: 2, path: "pkg-b", dev: false, optional: false, bundled: false },
            advisory: {
              id: 2,
              module_name: "pkg-b",
              severity: "critical",
              title: "Critical issue",
              url: "",
              vulnerable_versions: "*",
              patched_versions: ">=1.0.0",
              overview: "",
              recommendation: "",
              cwe: [],
            },
          },
        }),
      ];
      const output = lines.join("\n");

      const result = parseYarnAudit(output);

      expect(result).not.toBeNull();
      expect(result?.vulnerabilities).toHaveLength(2);
      expect(result?.summary.high).toBe(1);
      expect(result?.summary.critical).toBe(1);
      expect(result?.summary.total).toBe(2);
    });

    it("handles no fix available", () => {
      const lines = [
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: { id: 1, path: "pkg", dev: false, optional: false, bundled: false },
            advisory: {
              id: 1,
              module_name: "pkg",
              severity: "high",
              title: "No fix",
              url: "",
              vulnerable_versions: "*",
              patched_versions: "<0.0.0",
              overview: "",
              recommendation: "",
              cwe: [],
            },
          },
        }),
        JSON.stringify({
          type: "auditSummary",
          data: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
        }),
      ];
      const output = lines.join("\n");

      const result = parseYarnAudit(output);

      expect(result).not.toBeNull();
      const vuln = result?.vulnerabilities[0];
      expect(vuln?.fixAvailable).toBe(false);
      expect(vuln?.fixVersion).toBeNull();
    });

    it("handles malformed JSON lines gracefully", () => {
      const lines = [
        "not valid json",
        JSON.stringify({
          type: "auditAdvisory",
          data: {
            resolution: { id: 1, path: "pkg", dev: false, optional: false, bundled: false },
            advisory: {
              id: 1,
              module_name: "pkg",
              severity: "low",
              title: "Low issue",
              url: "",
              vulnerable_versions: "*",
              patched_versions: ">=1.0.0",
              overview: "",
              recommendation: "",
              cwe: [],
            },
          },
        }),
        "another invalid line",
        JSON.stringify({
          type: "auditSummary",
          data: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 } },
        }),
      ];
      const output = lines.join("\n");

      const result = parseYarnAudit(output);

      expect(result).not.toBeNull();
      expect(result?.vulnerabilities).toHaveLength(1);
      expect(result?.summary.low).toBe(1);
    });
  });

  describe("severity normalization", () => {
    it("normalizes 'medium' to 'moderate' for npm", () => {
      const output = JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {
          pkg: {
            name: "pkg",
            severity: "medium", // Some versions use 'medium'
            isDirect: true,
            via: [{ title: "Issue", severity: "medium" }],
            effects: [],
            range: "*",
            nodes: [],
            fixAvailable: false,
          },
        },
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 },
        },
      });

      const result = parseNpmAudit(output);

      expect(result).not.toBeNull();
      const vuln = result?.vulnerabilities[0];
      expect(vuln?.severity).toBe("moderate");
    });
  });
});
