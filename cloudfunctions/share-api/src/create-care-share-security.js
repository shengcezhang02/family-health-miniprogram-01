const { createHmac } = require("node:crypto");

function createCareShareSecurity({ hashKey }) {
  if (typeof hashKey !== "string" || hashKey.length < 16) {
    throw new Error("CARE_SHARE_HASH_KEY must contain at least 16 characters");
  }

  function hmac(label, value) {
    return createHmac("sha256", hashKey)
      .update(`${label}\n${value}`)
      .digest();
  }

  return {
    createCredentials({ callerUserId, requestId }) {
      const token = hmac(
        "care-share-token-v1",
        `${callerUserId}\n${requestId}`,
      )
        .subarray(0, 24)
        .toString("base64url");

      return {
        token,
        tokenHash: hmac("care-share-digest-v1", token).toString("hex"),
      };
    },

    hashToken(token) {
      return hmac("care-share-digest-v1", token).toString("hex");
    },
  };
}

module.exports = {
  createCareShareSecurity,
};
