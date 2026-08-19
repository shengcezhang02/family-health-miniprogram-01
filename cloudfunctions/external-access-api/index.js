const {
  createExternalBusinessRouter,
  isExternalAccessEnabled,
} = require("./family-health-business");
const {
  createExternalAccessApi,
} = require("./create-external-access-api");

const router = createExternalBusinessRouter({
  isEnabled: () => isExternalAccessEnabled(process.env),
  services: {},
});

const api = createExternalAccessApi({
  isEnabled: () => isExternalAccessEnabled(process.env),
  dispatchBusinessAction: (request) => router.execute(request),
});

exports.main = async (event) => api.handle(event ?? {});
