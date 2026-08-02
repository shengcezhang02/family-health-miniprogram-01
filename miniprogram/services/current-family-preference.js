const CURRENT_FAMILY_KEY = "currentFamilyId";

function createCurrentFamilyPreference(storage) {
  return {
    peekId() {
      const savedFamilyId = storage.get(CURRENT_FAMILY_KEY);
      return typeof savedFamilyId === "string"
        ? savedFamilyId
        : "";
    },

    resolve(families) {
      const savedFamilyId = storage.get(CURRENT_FAMILY_KEY);
      const savedFamily = families.find(
        (family) => family.id === savedFamilyId,
      );

      if (savedFamily) {
        return savedFamily;
      }

      const firstActiveFamily = families[0] ?? null;

      if (firstActiveFamily) {
        storage.set(CURRENT_FAMILY_KEY, firstActiveFamily.id);
      } else {
        storage.remove(CURRENT_FAMILY_KEY);
      }

      return firstActiveFamily;
    },

    select(family) {
      storage.set(CURRENT_FAMILY_KEY, family.id);
      return family;
    },
  };
}

module.exports = {
  createCurrentFamilyPreference,
};
