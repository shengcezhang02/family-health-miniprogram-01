function isExternalAccessEnabled(environment = {}) {
  return environment.EXTERNAL_ACCESS_ENABLED === "true";
}

module.exports = {
  isExternalAccessEnabled,
};
