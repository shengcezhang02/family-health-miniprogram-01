const { createHmac, randomBytes } = require("node:crypto");

const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createInviteSecurity({ hashKey }) {
  function digest(value) {
    return createHmac("sha256", hashKey).update(value).digest("hex");
  }

  function createShortCode() {
    return [...randomBytes(6)]
      .map((byte) => SHORT_CODE_ALPHABET[byte & 31])
      .join("");
  }

  return {
    createCredentials() {
      const token = randomBytes(24).toString("base64url");
      const shortCode = createShortCode();

      return {
        token,
        shortCode,
        tokenHash: digest(token),
        shortCodeHash: digest(shortCode),
      };
    },

    hashToken(token) {
      return digest(token);
    },

    hashShortCode(shortCode) {
      return digest(shortCode.trim().toUpperCase());
    },
  };
}

module.exports = {
  createInviteSecurity,
};
