import "./require-sandbox.test.ts";
import { expect, test } from "bun:test";
import { dirname, join, relative, sep } from "node:path";

test("every test imports the sandbox guard first", async () => {
  const testsRoot = join(import.meta.dir, "..");
  const guardPath = join(import.meta.dir, "require-sandbox.test.ts");
  const missing: string[] = [];

  for await (const file of new Bun.Glob("**/*.test.ts").scan({
    cwd: testsRoot,
    absolute: true,
    onlyFiles: true,
    dot: true,
  })) {
    if (file === guardPath) continue;
    const path = relative(dirname(file), guardPath).split(sep).join("/");
    const importPath = path.startsWith(".") ? path : `./${path}`;
    const source = await Bun.file(file).text();
    if (!source.startsWith(`import "${importPath}";\n`)) {
      missing.push(relative(testsRoot, file));
    }
  }

  expect(missing.sort(), "Tests missing the sandbox guard as their first import").toEqual([]);
});
