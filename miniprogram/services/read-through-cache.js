function createReadThroughCache({
  ttlMs,
  now = () => Date.now(),
}) {
  const entries = new Map();
  let revision = 0;

  return {
    async get(key, load, { fresh = false } = {}) {
      const cached = entries.get(key);

      if (
        !fresh &&
        cached &&
        now() - cached.loadedAt < ttlMs
      ) {
        return cached.value;
      }

      const value = await load();
      entries.set(key, {
        loadedAt: now(),
        value,
      });
      return value;
    },

    clear() {
      entries.clear();
      revision += 1;
    },

    getRevision() {
      return revision;
    },
  };
}

module.exports = {
  createReadThroughCache,
};
