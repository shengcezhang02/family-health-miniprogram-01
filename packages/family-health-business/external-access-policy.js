const EXTERNAL_ACCESS_PERMISSION_PRESET =
  "experimental_full_family_health_v1";
const EXTERNAL_ACCESS_NOTICE_VERSION =
  EXTERNAL_ACCESS_PERMISSION_PRESET;

function defineAction(service, mode) {
  return Object.freeze({
    service,
    operation: null,
    mode,
  });
}

const actionSources = [
  ["getContext", "context", "read"],
  ["listHealthItems", "healthItems", "read"],
  ["getHealthItem", "healthItems", "read"],
  ["listTemplates", "templates", "read"],
  ["createRecord", "healthItems", "write"],
  ["createReminder", "healthItems", "write"],
  ["createRecurringRule", "healthItems", "write"],
  ["updateHealthItem", "healthItems", "write"],
  ["checkInReminder", "healthItems", "write"],
  ["pauseRule", "healthItems", "write"],
  ["resumeRule", "healthItems", "write"],
  ["softDeleteItem", "healthItems", "write"],
  ["createCustomTemplate", "templates", "write"],
  ["updateCustomTemplate", "templates", "write"],
  ["setTemplateStatus", "templates", "write"],
  ["copySystemTemplate", "templates", "write"],
  ["updateSystemTemplateSettings", "templates", "write"],
];

const EXTERNAL_ACCESS_ACTIONS = Object.freeze(
  Object.fromEntries(
    actionSources.map(([operation, service, mode]) => [
      operation,
      Object.freeze({
        ...defineAction(service, mode),
        operation,
      }),
    ]),
  ),
);

function getExternalAccessAction(action) {
  if (typeof action !== "string") {
    return null;
  }

  return EXTERNAL_ACCESS_ACTIONS[action] || null;
}

module.exports = {
  EXTERNAL_ACCESS_ACTIONS,
  EXTERNAL_ACCESS_NOTICE_VERSION,
  EXTERNAL_ACCESS_PERMISSION_PRESET,
  getExternalAccessAction,
};
