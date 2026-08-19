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
  ["create-external-access-management.js", "create-external-access-management.js"],
  ["create-external-business-router.js", "create-external-business-router.js"],
  ["create-external-read-services.js", "create-external-read-services.js"],
  ["create-external-token-authenticator.js", "create-external-token-authenticator.js"],
  ["create-external-token-security.js", "create-external-token-security.js"],
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

const systemTemplateSource = join(
  repositoryRoot,
  "cloudfunctions",
  "template-api",
  "src",
  "system-templates.js",
);
const systemTemplateTarget = join(
  targetDirectory,
  "external-system-templates.js",
);
copyFileSync(systemTemplateSource, systemTemplateTarget);

if (
  !readFileSync(systemTemplateSource).equals(
    readFileSync(systemTemplateTarget),
  )
) {
  throw new Error("Failed to synchronize system templates");
}

console.log(
  `Synchronized ${copiedFiles.size} shared business files and system templates into external-access-api`,
);
