function createCloudExternalAccessStore(db) {
  const users = db.collection("users");
  const tokens = db.collection("external_access_tokens");
  const events = db.collection("external_access_events");

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function getTokenById(tokenId) {
    const result = await tokens.doc(tokenId).get();
    return result.data ?? null;
  }

  return {
    async getUserByOpenId(openId) {
      const result = await users
        .where({ wechatOpenId: openId })
        .limit(1)
        .get();
      return result.data[0] ?? null;
    },

    async getTokenByCreationRequest(ownerUserId, requestId) {
      const result = await tokens
        .where({
          ownerUserId,
          creationRequestId: requestId,
        })
        .limit(1)
        .get();
      return result.data[0] ?? null;
    },

    async createToken(token) {
      return db.runTransaction(async (transaction) => {
        const transactionTokens = transaction.collection(
          "external_access_tokens",
        );
        const existingResult = await transactionTokens
          .doc(token._id)
          .get();
        const existing = existingResult.data ?? null;

        if (existing) {
          return existing;
        }

        await transactionTokens.doc(token._id).set({
          data: withoutDocumentId(token),
        });
        return token;
      });
    },

    getTokenById,

    async listTokensByOwner(ownerUserId) {
      const result = await tokens.where({ ownerUserId }).get();
      return result.data.sort((left, right) => {
        const statusDifference =
          Number(Boolean(left.revokedAt)) -
          Number(Boolean(right.revokedAt));

        if (statusDifference !== 0) {
          return statusDifference;
        }

        return (
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime()
        );
      });
    },

    async revokeToken({
      tokenId,
      ownerUserId,
      expectedRevision,
      timestamp,
    }) {
      return db.runTransaction(async (transaction) => {
        const transactionTokens = transaction.collection(
          "external_access_tokens",
        );
        const result = await transactionTokens.doc(tokenId).get();
        const token = result.data ?? null;

        if (!token || token.ownerUserId !== ownerUserId) {
          return { outcome: "not-found" };
        }

        if (token.revokedAt) {
          return { outcome: "revoked", token };
        }

        if (token.revision !== expectedRevision) {
          return { outcome: "revision-conflict", token };
        }

        const {
          encryptedSecret,
          encryptionNonce,
          encryptionAuthTag,
          ...remaining
        } = token;
        const revoked = {
          ...remaining,
          secretHash: null,
          revokedAt: timestamp,
          revision: token.revision + 1,
          updatedAt: timestamp,
        };
        await transactionTokens.doc(tokenId).set({
          data: withoutDocumentId(revoked),
        });
        return { outcome: "revoked", token: revoked };
      });
    },

    async recordAccess(event) {
      return db.runTransaction(async (transaction) => {
        const transactionTokens = transaction.collection(
          "external_access_tokens",
        );
        const tokenResult = await transactionTokens
          .doc(event.tokenId)
          .get();
        const token = tokenResult.data ?? null;

        if (!token || token.revokedAt) {
          return { outcome: "token-unavailable" };
        }

        await transaction
          .collection("external_access_events")
          .doc(event._id)
          .set({ data: withoutDocumentId(event) });
        await transactionTokens.doc(token._id).set({
          data: withoutDocumentId({
            ...token,
            lastUsedAt: event.accessedAt,
            updatedAt: event.accessedAt,
          }),
        });
        return { outcome: "recorded" };
      });
    },

    async listRecentAccesses({ tokenId, ownerUserId, limit }) {
      const token = await getTokenById(tokenId);

      if (!token || token.ownerUserId !== ownerUserId) {
        return null;
      }

      const result = await events
        .where({ tokenId })
        .orderBy("accessedAt", "desc")
        .limit(limit)
        .get();
      return result.data;
    },
  };
}

module.exports = {
  createCloudExternalAccessStore,
};
