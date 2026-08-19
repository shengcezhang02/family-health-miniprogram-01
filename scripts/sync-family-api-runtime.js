const { copyFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const sourceDirectory = join(
  root,
  "cloudfunctions",
  "family-api",
  "src",
);
const targetDirectory = join(root, "cloudfunctions", "family-api");
const runtimeFiles = [
  "create-cloud-family-store.js",
  "create-family-api.js",
  "create-invite-security.js",
];

for (const fileName of runtimeFiles) {
  copyFileSync(
    join(sourceDirectory, fileName),
    join(targetDirectory, fileName),
  );
}

console.log("family-api runtime modules synchronized");
