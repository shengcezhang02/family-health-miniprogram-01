const { copyFileSync, mkdirSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const sourceDirectory = join(
  repositoryRoot,
  "packages",
  "family-health-business",
);
const targetDirectory = join(
  repositoryRoot,
  "cloudfunctions",
  "external-access-api",
);

mkdirSync(targetDirectory, { recursive: true });

const copiedFiles = new Map([
  ["create-external-business-router.js", "create-external-business-router.js"],
  ["external-access-feature.js", "external-access-feature.js"],
  ["external-access-policy.js", "external-access-policy.js"],
  ["index.js", "family-health-business.js"],
  ["render-external-access-skill-draft.js", "render-external-access-skill-draft.js"],
]);

for (const [sourceFileName, targetFileName] of copiedFiles) {
  const sourcePath = join(sourceDirectory, sourceFileName);
  const targetPath = join(targetDirectory, targetFileName);

  copyFileSync(sourcePath, targetPath);

  const source = readFileSync(sourcePath);
  const target = readFileSync(targetPath);

  if (!source.equals(target)) {
    throw new Error(`Failed to synchronize ${sourceFileName}`);
  }
}

console.log(
  `Synchronized ${copiedFiles.size} shared business files into external-access-api`,
);
