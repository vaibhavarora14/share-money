import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ignoredDirectories = new Set([".expo", "dist", "node_modules"]);
const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const barrelImportPattern =
  /from\s+["']@expo\/vector-icons["']|require\(\s*["']@expo\/vector-icons["']\s*\)/g;

async function findSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : findSourceFiles(entryPath);
      }
      return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
    }),
  );
  return files.flat();
}

const sourceFiles = await findSourceFiles(mobileRoot);

const violations = [];
for (const sourceFile of sourceFiles) {
  const source = await readFile(sourceFile, "utf8");
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    barrelImportPattern.lastIndex = 0;
    if (barrelImportPattern.test(line)) {
      violations.push(`${path.relative(mobileRoot, sourceFile)}:${index + 1}`);
    }
  });
}

if (violations.length > 0) {
  console.error(
    [
      "Use a direct @expo/vector-icons/<family> import so Metro includes only the requested font:",
      ...violations.map((violation) => `- ${violation}`),
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log("Icon imports are bundle-safe.");
}
