import { describe, expect, it } from "bun:test";
import { type DependabotPR, parsers } from "../../../src/lib/github/dependabot.ts";

const { parseDependabotTitle, determineCheckStatus, parsePR, calculateSummary } = parsers;

describe("dependabot analyzer", () => {
  describe("parseDependabotTitle", () => {
    it("parses standard Bump title", () => {
      const result = parseDependabotTitle("Bump lodash from 4.17.20 to 4.17.21");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("lodash");
      expect(result?.from).toBe("4.17.20");
      expect(result?.to).toBe("4.17.21");
    });

    it("parses scoped package names", () => {
      const result = parseDependabotTitle("Bump @types/node from 18.0.0 to 20.0.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("@types/node");
      expect(result?.from).toBe("18.0.0");
      expect(result?.to).toBe("20.0.0");
    });

    it("parses Update style title with requirement", () => {
      const result = parseDependabotTitle("Update eslint requirement from ^8.0.0 to ^9.0.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("eslint");
      expect(result?.from).toBe("8.0.0");
      expect(result?.to).toBe("9.0.0");
    });

    it("parses title with in /path suffix", () => {
      const result = parseDependabotTitle("Bump lodash from 4.17.20 to 4.17.21 in /packages/app");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("lodash");
      expect(result?.from).toBe("4.17.20");
      expect(result?.to).toBe("4.17.21");
    });

    it("handles version ranges with caret", () => {
      const result = parseDependabotTitle("Bump typescript from ^4.0.0 to ^5.0.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("typescript");
      expect(result?.from).toBe("4.0.0");
      expect(result?.to).toBe("5.0.0");
    });

    it("handles version ranges with tilde", () => {
      const result = parseDependabotTitle("Bump react from ~17.0.0 to ~18.0.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("react");
      expect(result?.from).toBe("17.0.0");
      expect(result?.to).toBe("18.0.0");
    });

    it("handles version ranges with >=", () => {
      const result = parseDependabotTitle("Update axios requirement from >=0.21.0 to >=1.0.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("axios");
      expect(result?.from).toBe("0.21.0");
      expect(result?.to).toBe("1.0.0");
    });

    it("parses package with dots in name", () => {
      const result = parseDependabotTitle("Bump socket.io from 4.0.0 to 4.6.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("socket.io");
      expect(result?.from).toBe("4.0.0");
      expect(result?.to).toBe("4.6.0");
    });

    it("parses package with dashes in name", () => {
      const result = parseDependabotTitle("Bump react-dom from 17.0.0 to 18.2.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("react-dom");
      expect(result?.from).toBe("17.0.0");
      expect(result?.to).toBe("18.2.0");
    });

    it("parses scoped package with dashes", () => {
      const result = parseDependabotTitle("Bump @babel/preset-env from 7.0.0 to 7.22.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("@babel/preset-env");
      expect(result?.from).toBe("7.0.0");
      expect(result?.to).toBe("7.22.0");
    });

    it("returns null for non-Dependabot title", () => {
      expect(parseDependabotTitle("Fix bug in authentication")).toBeNull();
      expect(parseDependabotTitle("Add new feature")).toBeNull();
      expect(parseDependabotTitle("Update README.md")).toBeNull();
    });

    it("returns null for malformed Dependabot title", () => {
      expect(parseDependabotTitle("Bump lodash")).toBeNull();
      expect(parseDependabotTitle("Bump lodash from 4.17.20")).toBeNull();
      expect(parseDependabotTitle("lodash from 4.17.20 to 4.17.21")).toBeNull();
    });

    it("is case insensitive for Bump/Update", () => {
      const result1 = parseDependabotTitle("bump lodash from 1.0.0 to 2.0.0");
      expect(result1).not.toBeNull();
      expect(result1?.package).toBe("lodash");

      const result2 = parseDependabotTitle("UPDATE axios from 0.21.0 to 1.0.0");
      expect(result2).not.toBeNull();
      expect(result2?.package).toBe("axios");
    });
  });

  describe("determineCheckStatus", () => {
    it("returns 'none' for null statusCheckRollup", () => {
      expect(determineCheckStatus(null)).toBe("none");
    });

    it("returns 'none' for empty array", () => {
      expect(determineCheckStatus([])).toBe("none");
    });

    it("returns 'passing' for all successful checks using conclusion", () => {
      const checks = [
        { __typename: "CheckRun", conclusion: "SUCCESS" },
        { __typename: "CheckRun", conclusion: "SUCCESS" },
      ];
      expect(determineCheckStatus(checks)).toBe("passing");
    });

    it("returns 'passing' for successful state", () => {
      const checks = [{ __typename: "StatusContext", state: "SUCCESS" }];
      expect(determineCheckStatus(checks)).toBe("passing");
    });

    it("returns 'failing' for any failed check using conclusion", () => {
      const checks = [
        { __typename: "CheckRun", conclusion: "SUCCESS" },
        { __typename: "CheckRun", conclusion: "FAILURE" },
      ];
      expect(determineCheckStatus(checks)).toBe("failing");
    });

    it("returns 'failing' for timed out check", () => {
      const checks = [{ __typename: "CheckRun", conclusion: "TIMED_OUT" }];
      expect(determineCheckStatus(checks)).toBe("failing");
    });

    it("returns 'failing' for cancelled check", () => {
      const checks = [{ __typename: "CheckRun", conclusion: "CANCELLED" }];
      expect(determineCheckStatus(checks)).toBe("failing");
    });

    it("returns 'failing' for error state", () => {
      const checks = [{ __typename: "StatusContext", state: "ERROR" }];
      expect(determineCheckStatus(checks)).toBe("failing");
    });

    it("returns 'pending' for pending state", () => {
      const checks = [{ __typename: "StatusContext", state: "PENDING" }];
      expect(determineCheckStatus(checks)).toBe("pending");
    });

    it("returns 'pending' for in_progress status", () => {
      const checks = [{ __typename: "CheckRun", status: "IN_PROGRESS" }];
      expect(determineCheckStatus(checks)).toBe("pending");
    });

    it("returns 'pending' for queued status", () => {
      const checks = [{ __typename: "CheckRun", status: "QUEUED" }];
      expect(determineCheckStatus(checks)).toBe("pending");
    });

    it("returns 'passing' for neutral conclusion", () => {
      const checks = [{ __typename: "CheckRun", conclusion: "NEUTRAL" }];
      expect(determineCheckStatus(checks)).toBe("passing");
    });

    it("returns 'passing' for skipped conclusion", () => {
      const checks = [{ __typename: "CheckRun", conclusion: "SKIPPED" }];
      expect(determineCheckStatus(checks)).toBe("passing");
    });

    it("failing takes priority over pending", () => {
      const checks = [
        { __typename: "CheckRun", conclusion: "FAILURE" },
        { __typename: "StatusContext", state: "PENDING" },
      ];
      expect(determineCheckStatus(checks)).toBe("failing");
    });

    it("pending takes priority over passing", () => {
      const checks = [
        { __typename: "CheckRun", conclusion: "SUCCESS" },
        { __typename: "StatusContext", state: "PENDING" },
      ];
      expect(determineCheckStatus(checks)).toBe("pending");
    });

    it("handles lowercase conclusion/state values", () => {
      const checks = [{ __typename: "CheckRun", conclusion: "success" }];
      expect(determineCheckStatus(checks)).toBe("passing");
    });
  });

  describe("parsePR", () => {
    it("parses a valid Dependabot PR", () => {
      const pr = {
        number: 42,
        title: "Bump lodash from 4.17.20 to 4.17.21",
        url: "https://github.com/owner/repo/pull/42",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "MERGEABLE",
        headRefName: "dependabot/npm_and_yarn/lodash-4.17.21",
        statusCheckRollup: [{ __typename: "CheckRun", conclusion: "SUCCESS" }],
      };

      const result = parsePR(pr);

      expect(result).not.toBeNull();
      expect(result?.number).toBe(42);
      expect(result?.title).toBe("Bump lodash from 4.17.20 to 4.17.21");
      expect(result?.package).toBe("lodash");
      expect(result?.from).toBe("4.17.20");
      expect(result?.to).toBe("4.17.21");
      expect(result?.updateType).toBe("patch");
      expect(result?.url).toBe("https://github.com/owner/repo/pull/42");
      expect(result?.createdAt).toBe("2024-01-15T10:00:00Z");
      expect(result?.mergeable).toBe(true);
      expect(result?.checks).toBe("passing");
    });

    it("returns null for non-Dependabot PR", () => {
      const pr = {
        number: 1,
        title: "Fix bug in login",
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "MERGEABLE",
        headRefName: "fix-login",
        statusCheckRollup: null,
      };

      expect(parsePR(pr)).toBeNull();
    });

    it("correctly identifies major update", () => {
      const pr = {
        number: 1,
        title: "Bump typescript from 4.9.0 to 5.0.0",
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "MERGEABLE",
        headRefName: "dependabot/npm_and_yarn/typescript-5.0.0",
        statusCheckRollup: null,
      };

      const result = parsePR(pr);
      expect(result?.updateType).toBe("major");
    });

    it("correctly identifies minor update", () => {
      const pr = {
        number: 1,
        title: "Bump react from 18.0.0 to 18.2.0",
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "MERGEABLE",
        headRefName: "dependabot/npm_and_yarn/react-18.2.0",
        statusCheckRollup: null,
      };

      const result = parsePR(pr);
      expect(result?.updateType).toBe("minor");
    });

    it("handles CONFLICTING mergeable status", () => {
      const pr = {
        number: 1,
        title: "Bump lodash from 4.17.20 to 4.17.21",
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "CONFLICTING",
        headRefName: "dependabot/npm_and_yarn/lodash-4.17.21",
        statusCheckRollup: null,
      };

      const result = parsePR(pr);
      expect(result?.mergeable).toBe(false);
    });

    it("handles UNKNOWN mergeable status", () => {
      const pr = {
        number: 1,
        title: "Bump lodash from 4.17.20 to 4.17.21",
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "UNKNOWN",
        headRefName: "dependabot/npm_and_yarn/lodash-4.17.21",
        statusCheckRollup: null,
      };

      const result = parsePR(pr);
      expect(result?.mergeable).toBe(false);
    });

    it("handles empty mergeable status", () => {
      const pr = {
        number: 1,
        title: "Bump lodash from 4.17.20 to 4.17.21",
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "",
        headRefName: "dependabot/npm_and_yarn/lodash-4.17.21",
        statusCheckRollup: null,
      };

      const result = parsePR(pr);
      expect(result?.mergeable).toBe(false);
    });

    it("handles failing checks", () => {
      const pr = {
        number: 1,
        title: "Bump lodash from 4.17.20 to 4.17.21",
        url: "https://github.com/owner/repo/pull/1",
        createdAt: "2024-01-15T10:00:00Z",
        mergeable: "MERGEABLE",
        headRefName: "dependabot/npm_and_yarn/lodash-4.17.21",
        statusCheckRollup: [{ __typename: "CheckRun", conclusion: "FAILURE" }],
      };

      const result = parsePR(pr);
      expect(result?.checks).toBe("failing");
    });
  });

  describe("calculateSummary", () => {
    it("calculates summary for empty array", () => {
      const result = calculateSummary([]);

      expect(result.total).toBe(0);
      expect(result.patch).toBe(0);
      expect(result.minor).toBe(0);
      expect(result.major).toBe(0);
      expect(result.mergeable).toBe(0);
    });

    it("calculates summary for mixed PRs", () => {
      const prs: DependabotPR[] = [
        {
          number: 1,
          title: "Bump lodash from 4.17.20 to 4.17.21",
          package: "lodash",
          from: "4.17.20",
          to: "4.17.21",
          updateType: "patch",
          url: "https://github.com/owner/repo/pull/1",
          createdAt: "2024-01-15T10:00:00Z",
          mergeable: true,
          checks: "passing",
        },
        {
          number: 2,
          title: "Bump react from 18.0.0 to 18.2.0",
          package: "react",
          from: "18.0.0",
          to: "18.2.0",
          updateType: "minor",
          url: "https://github.com/owner/repo/pull/2",
          createdAt: "2024-01-15T10:00:00Z",
          mergeable: true,
          checks: "passing",
        },
        {
          number: 3,
          title: "Bump typescript from 4.9.0 to 5.0.0",
          package: "typescript",
          from: "4.9.0",
          to: "5.0.0",
          updateType: "major",
          url: "https://github.com/owner/repo/pull/3",
          createdAt: "2024-01-15T10:00:00Z",
          mergeable: false,
          checks: "failing",
        },
        {
          number: 4,
          title: "Bump axios from 1.0.0 to 1.0.1",
          package: "axios",
          from: "1.0.0",
          to: "1.0.1",
          updateType: "patch",
          url: "https://github.com/owner/repo/pull/4",
          createdAt: "2024-01-15T10:00:00Z",
          mergeable: true,
          checks: "passing",
        },
        {
          number: 5,
          title: "Bump eslint from 8.0.0 to 8.5.0",
          package: "eslint",
          from: "8.0.0",
          to: "8.5.0",
          updateType: "minor",
          url: "https://github.com/owner/repo/pull/5",
          createdAt: "2024-01-15T10:00:00Z",
          mergeable: true,
          checks: "pending",
        },
      ];

      const result = calculateSummary(prs);

      expect(result.total).toBe(5);
      expect(result.patch).toBe(2);
      expect(result.minor).toBe(2);
      expect(result.major).toBe(1);
      expect(result.mergeable).toBe(4);
    });

    it("counts updateType: none correctly", () => {
      const prs: DependabotPR[] = [
        {
          number: 1,
          title: "Bump lodash from 4.17.21 to 4.17.21",
          package: "lodash",
          from: "4.17.21",
          to: "4.17.21",
          updateType: "none",
          url: "https://github.com/owner/repo/pull/1",
          createdAt: "2024-01-15T10:00:00Z",
          mergeable: true,
          checks: "passing",
        },
      ];

      const result = calculateSummary(prs);

      expect(result.total).toBe(1);
      expect(result.patch).toBe(0);
      expect(result.minor).toBe(0);
      expect(result.major).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles prerelease versions in title", () => {
      const result = parseDependabotTitle("Bump next from 14.0.0-canary.1 to 14.0.0-canary.2");

      // The current regex may not handle prerelease versions well
      // This test documents the current behavior
      expect(result).not.toBeNull();
      if (result) {
        expect(result.package).toBe("next");
      }
    });

    it("handles v-prefixed versions", () => {
      const result = parseDependabotTitle("Bump package from v1.0.0 to v2.0.0");

      expect(result).not.toBeNull();
      expect(result?.from).toBe("1.0.0");
      expect(result?.to).toBe("2.0.0");
    });

    it("handles complex scoped packages", () => {
      const result = parseDependabotTitle("Bump @azure/storage-blob from 12.0.0 to 12.14.0");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("@azure/storage-blob");
      expect(result?.from).toBe("12.0.0");
      expect(result?.to).toBe("12.14.0");
    });

    it("handles double-digit version numbers", () => {
      const result = parseDependabotTitle("Bump webpack from 5.88.0 to 5.89.0");

      expect(result).not.toBeNull();
      expect(result?.from).toBe("5.88.0");
      expect(result?.to).toBe("5.89.0");
    });

    it("handles package names with numbers", () => {
      const result = parseDependabotTitle("Bump es5-shim from 4.6.0 to 4.6.7");

      expect(result).not.toBeNull();
      expect(result?.package).toBe("es5-shim");
    });
  });

  describe("integration scenarios", () => {
    it("processes a realistic gh pr list output", () => {
      const ghOutput = [
        {
          number: 101,
          title: "Bump @types/react from 18.0.0 to 18.2.15",
          url: "https://github.com/owner/repo/pull/101",
          createdAt: "2024-01-20T08:00:00Z",
          mergeable: "MERGEABLE",
          headRefName: "dependabot/npm_and_yarn/types/react-18.2.15",
          statusCheckRollup: [
            { __typename: "CheckRun", conclusion: "SUCCESS" },
            { __typename: "CheckRun", conclusion: "SUCCESS" },
          ],
        },
        {
          number: 102,
          title: "Bump typescript from 5.0.0 to 5.3.3",
          url: "https://github.com/owner/repo/pull/102",
          createdAt: "2024-01-19T12:00:00Z",
          mergeable: "CONFLICTING",
          headRefName: "dependabot/npm_and_yarn/typescript-5.3.3",
          statusCheckRollup: [{ __typename: "CheckRun", conclusion: "FAILURE" }],
        },
        {
          number: 103,
          title: "Bump next from 13.5.0 to 14.0.0",
          url: "https://github.com/owner/repo/pull/103",
          createdAt: "2024-01-18T16:00:00Z",
          mergeable: "MERGEABLE",
          headRefName: "dependabot/npm_and_yarn/next-14.0.0",
          statusCheckRollup: [{ __typename: "StatusContext", state: "PENDING" }],
        },
      ];

      const parsedPRs: DependabotPR[] = [];
      for (const pr of ghOutput) {
        const parsed = parsePR(pr);
        if (parsed) {
          parsedPRs.push(parsed);
        }
      }

      expect(parsedPRs).toHaveLength(3);

      // First PR - @types/react (minor update)
      expect(parsedPRs[0]?.package).toBe("@types/react");
      expect(parsedPRs[0]?.updateType).toBe("minor");
      expect(parsedPRs[0]?.mergeable).toBe(true);
      expect(parsedPRs[0]?.checks).toBe("passing");

      // Second PR - typescript (minor update, but conflicting)
      expect(parsedPRs[1]?.package).toBe("typescript");
      expect(parsedPRs[1]?.updateType).toBe("minor");
      expect(parsedPRs[1]?.mergeable).toBe(false);
      expect(parsedPRs[1]?.checks).toBe("failing");

      // Third PR - next (major update)
      expect(parsedPRs[2]?.package).toBe("next");
      expect(parsedPRs[2]?.updateType).toBe("major");
      expect(parsedPRs[2]?.mergeable).toBe(true);
      expect(parsedPRs[2]?.checks).toBe("pending");

      const summary = calculateSummary(parsedPRs);
      expect(summary.total).toBe(3);
      expect(summary.major).toBe(1);
      expect(summary.minor).toBe(2);
      expect(summary.patch).toBe(0);
      expect(summary.mergeable).toBe(2);
    });

    it("handles empty PR list", () => {
      const ghOutput: unknown[] = [];
      const parsedPRs: DependabotPR[] = [];

      for (const pr of ghOutput) {
        const parsed = parsePR(pr as Parameters<typeof parsePR>[0]);
        if (parsed) {
          parsedPRs.push(parsed);
        }
      }

      expect(parsedPRs).toHaveLength(0);

      const summary = calculateSummary(parsedPRs);
      expect(summary.total).toBe(0);
      expect(summary.mergeable).toBe(0);
    });

    it("filters out non-Dependabot PRs from mixed list", () => {
      const ghOutput = [
        {
          number: 1,
          title: "Bump lodash from 4.17.20 to 4.17.21",
          url: "https://github.com/owner/repo/pull/1",
          createdAt: "2024-01-15T10:00:00Z",
          mergeable: "MERGEABLE",
          headRefName: "dependabot/npm_and_yarn/lodash-4.17.21",
          statusCheckRollup: null,
        },
        {
          number: 2,
          title: "Fix critical security bug",
          url: "https://github.com/owner/repo/pull/2",
          createdAt: "2024-01-15T09:00:00Z",
          mergeable: "MERGEABLE",
          headRefName: "fix-security-bug",
          statusCheckRollup: null,
        },
        {
          number: 3,
          title: "Update axios requirement from ^0.21.0 to ^1.0.0",
          url: "https://github.com/owner/repo/pull/3",
          createdAt: "2024-01-15T08:00:00Z",
          mergeable: "MERGEABLE",
          headRefName: "dependabot/npm_and_yarn/axios-1.0.0",
          statusCheckRollup: null,
        },
      ];

      const parsedPRs: DependabotPR[] = [];
      for (const pr of ghOutput) {
        const parsed = parsePR(pr);
        if (parsed) {
          parsedPRs.push(parsed);
        }
      }

      expect(parsedPRs).toHaveLength(2);
      expect(parsedPRs[0]?.package).toBe("lodash");
      expect(parsedPRs[1]?.package).toBe("axios");
    });
  });
});
