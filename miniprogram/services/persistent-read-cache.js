const DEFAULT_STORAGE_KEY = "family-health-read-snapshots-v1";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 24;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPersistentReadCache({
  get,
  set,
  remove,
  now = () => Date.now(),
  storageKey = DEFAULT_STORAGE_KEY,
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
}) {
  let verifiedUserId = "";
  let verifiedFamilyIds = new Set();
  let verifiedFamilies = [];

  function readStore() {
    try {
      const stored = get(storageKey);
      return {
        verifiedAccess:
          stored?.verifiedAccess &&
          typeof stored.verifiedAccess === "object"
            ? stored.verifiedAccess
            : undefined,
        entries: Array.isArray(stored?.entries)
          ? stored.entries
          : [],
      };
    } catch (_error) {
      return {
        verifiedAccess: undefined,
        entries: [],
      };
    }
  }

  function isFresh(entry) {
    return (
      Number.isFinite(entry.savedAt) &&
      now() - entry.savedAt >= 0 &&
      now() - entry.savedAt < ttlMs
    );
  }

  function saveStore({ verifiedAccess, entries }) {
    try {
      if (!verifiedAccess && entries.length === 0) {
        remove(storageKey);
        return;
      }

      set(storageKey, {
        version: 1,
        verifiedAccess,
        entries: entries
          .sort((left, right) => right.savedAt - left.savedAt)
          .slice(0, maxEntries),
      });
    } catch (_error) {
      // 本地缓存只是体验优化，写入失败不能阻断云端主流程。
    }
  }

  function getCurrentVerifiedAccess() {
    if (!verifiedUserId || verifiedFamilies.length === 0) {
      return undefined;
    }

    return {
      userId: verifiedUserId,
      families: cloneJson(verifiedFamilies),
      verifiedAt: now(),
    };
  }

  function setVerifiedAccess(access) {
    verifiedUserId =
      typeof access?.userId === "string" ? access.userId : "";
    verifiedFamilies = Array.isArray(access?.families)
      ? access.families
          .filter(
            (family) =>
              family &&
              typeof family.id === "string" &&
              family.id,
          )
          .map((family) => ({
            id: family.id,
            name:
              typeof family.name === "string" ? family.name : "",
          }))
      : [];
    verifiedFamilyIds = new Set(
      verifiedFamilies.map((family) => family.id),
    );
  }

  function canAccess(familyId) {
    return (
      Boolean(verifiedUserId) && verifiedFamilyIds.has(familyId)
    );
  }

  return {
    restoreAccess() {
      const store = readStore();
      const access = store.verifiedAccess;

      if (
        !access ||
        !Number.isFinite(access.verifiedAt) ||
        now() - access.verifiedAt < 0 ||
        now() - access.verifiedAt >= ttlMs
      ) {
        setVerifiedAccess(undefined);
        saveStore({
          verifiedAccess: undefined,
          entries: [],
        });
        return undefined;
      }

      setVerifiedAccess(access);
      const retainedEntries = store.entries.filter(
        (entry) =>
          entry.userId === verifiedUserId &&
          verifiedFamilyIds.has(entry.familyId) &&
          isFresh(entry),
      );
      saveStore({
        verifiedAccess: access,
        entries: retainedEntries,
      });
      return {
        userId: verifiedUserId,
        families: cloneJson(verifiedFamilies),
      };
    },

    verifyAccess({ userId, familyIds, families }) {
      const storedAccess = readStore().verifiedAccess;
      const requestedFamilyIds = Array.isArray(familyIds)
        ? familyIds.filter(
            (familyId) =>
              typeof familyId === "string" && familyId,
          )
        : [];
      const requestedFamilies = Array.isArray(families)
        ? families
        : requestedFamilyIds.map((familyId) => {
            const storedFamily = (
              storedAccess?.families || []
            ).find((family) => family.id === familyId);
            return storedFamily || { id: familyId, name: "" };
          });

      setVerifiedAccess({
        userId,
        families: requestedFamilies,
      });
      const retainedEntries = readStore().entries.filter(
        (entry) =>
          entry.userId === verifiedUserId &&
          verifiedFamilyIds.has(entry.familyId) &&
          isFresh(entry),
      );
      saveStore({
        verifiedAccess: getCurrentVerifiedAccess(),
        entries: retainedEntries,
      });
    },

    getFamily(familyId) {
      if (!canAccess(familyId)) {
        return undefined;
      }

      const family = verifiedFamilies.find(
        (candidate) => candidate.id === familyId,
      );
      return family ? cloneJson(family) : undefined;
    },

    getVerifiedUserId() {
      return verifiedUserId;
    },

    read({ key, familyId }) {
      if (!canAccess(familyId)) {
        return undefined;
      }

      const entries = readStore().entries;
      const entry = entries.find(
        (candidate) =>
          candidate.userId === verifiedUserId &&
          candidate.familyId === familyId &&
          candidate.key === key &&
          isFresh(candidate),
      );

      return entry ? cloneJson(entry.value) : undefined;
    },

    write({ key, familyId, value }) {
      if (!canAccess(familyId)) {
        return;
      }

      const store = readStore();
      const entries = store.entries.filter(
        (entry) =>
          isFresh(entry) &&
          !(
            entry.userId === verifiedUserId &&
            entry.familyId === familyId &&
            entry.key === key
          ),
      );
      entries.push({
        key,
        userId: verifiedUserId,
        familyId,
        savedAt: now(),
        value: cloneJson(value),
      });
      saveStore({
        verifiedAccess:
          store.verifiedAccess || getCurrentVerifiedAccess(),
        entries,
      });
    },
  };
}

module.exports = {
  createPersistentReadCache,
};
