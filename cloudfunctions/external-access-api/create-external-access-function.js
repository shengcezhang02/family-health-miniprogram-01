function createExternalAccessFunction({ managementApi, httpApi } = {}) {
  return async function main(event = {}) {
    const isHttpEvent = Boolean(
      event.httpMethod ||
        event.path ||
        event.requestContext?.httpMethod,
    );

    return isHttpEvent
      ? httpApi.handle(event)
      : managementApi.handle(event);
  };
}

module.exports = {
  createExternalAccessFunction,
};
