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
  ["create-external-write-services.js", "create-external-write-services.js"],
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

const businessCopiedFiles = [
  ["health-item-api", "create-health-item-api.js"],
  ["health-item-api", "create-cloud-health-item-store.js"],
  ["template-api", "create-template-api.js"],
  ["template-api", "create-cloud-template-store.js"],
  ["template-api", "template-history.js"],
];

for (const [cloudfunction, fileName] of businessCopiedFiles) {
  const sourcePath = join(
    repositoryRoot,
    "cloudfunctions",
    cloudfunction,
    "src",
    fileName,
  );
  const targetPath = join(targetDirectory, fileName);

  copyFileSync(sourcePath, targetPath);

  if (!readFileSync(sourcePath).equals(readFileSync(targetPath))) {
    throw new Error(`Failed to synchronize ${fileName}`);
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
const writeSystemTemplateTarget = join(
  targetDirectory,
  "system-templates.js",
);
copyFileSync(systemTemplateSource, writeSystemTemplateTarget);

if (
  !readFileSync(systemTemplateSource).equals(
    readFileSync(systemTemplateTarget),
  )
) {
  throw new Error("Failed to synchronize system templates");
}

if (
  !readFileSync(systemTemplateSource).equals(
    readFileSync(writeSystemTemplateTarget),
  )
) {
  throw new Error("Failed to synchronize write system templates");
}

console.log(
  `Synchronized ${copiedFiles.size + businessCopiedFiles.length} shared business files and system templates into external-access-api`,
);
