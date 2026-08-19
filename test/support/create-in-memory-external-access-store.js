function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createInMemoryExternalAccessStore({ users = [] } = {}) {
  const userDocuments = new Map(users.map((user) => [user._id, clone(user)]));
  const tokenDocuments = new Map();
  const eventDocuments = new Map();

  return {
    async getUserByOpenId(openId) {
      return clone(
        [...userDocuments.values()].find(
          (user) => user.wechatOpenId === openId,
        ) ?? null,
      );
    },

    async getTokenByCreationRequest(ownerUserId, requestId) {
      return clone(
        [...tokenDocuments.values()].find(
          (token) =>
            token.ownerUserId === ownerUserId &&
            token.creationRequestId === requestId,
        ) ?? null,
      );
    },

    async createToken(token) {
      const existing = tokenDocuments.get(token._id);

      if (existing) {
        return clone(existing);
      }

      tokenDocuments.set(token._id, clone(token));
      return clone(token);
    },

    async getTokenById(tokenId) {
      return clone(tokenDocuments.get(tokenId) ?? null);
    },

    async listTokensByOwner(ownerUserId) {
      return clone(
        [...tokenDocuments.values()].filter(
          (token) => token.ownerUserId === ownerUserId,
        ),
      );
    },

    async revokeToken({
      tokenId,
      ownerUserId,
      expectedRevision,
      timestamp,
    }) {
      const existing = tokenDocuments.get(tokenId);

      if (!existing || existing.ownerUserId !== ownerUserId) {
        return { outcome: "not-found" };
      }

      if (existing.revokedAt) {
        return { outcome: "revoked", token: clone(existing) };
      }

      if (existing.revision !== expectedRevision) {
        return { outcome: "revision-conflict", token: clone(existing) };
      }

      const {
        encryptedSecret,
        encryptionNonce,
        encryptionAuthTag,
        ...remaining
      } = existing;
      const revoked = {
        ...remaining,
        secretHash: null,
        revokedAt: timestamp,
        revision: existing.revision + 1,
        updatedAt: timestamp,
      };
      tokenDocuments.set(tokenId, clone(revoked));
      return { outcome: "revoked", token: clone(revoked) };
    },

    async recordAccess(event) {
      eventDocuments.set(event._id, clone(event));
      const token = tokenDocuments.get(event.tokenId);

      if (token && !token.revokedAt) {
        tokenDocuments.set(event.tokenId, {
          ...token,
          lastUsedAt: event.accessedAt,
          updatedAt: event.accessedAt,
        });
      }
    },

    async listRecentAccesses({ tokenId, ownerUserId, limit }) {
      const token = tokenDocuments.get(tokenId);

      if (!token || token.ownerUserId !== ownerUserId) {
        return null;
      }

      return clone(
        [...eventDocuments.values()]
          .filter((event) => event.tokenId === tokenId)
          .sort(
            (left, right) =>
              new Date(right.accessedAt).getTime() -
              new Date(left.accessedAt).getTime(),
          )
          .slice(0, limit),
      );
    },

    inspectTokens() {
      return clone([...tokenDocuments.values()]);
    },

    inspectEvents() {
      return clone([...eventDocuments.values()]);
    },
  };
}

module.exports = {
  createInMemoryExternalAccessStore,
};
