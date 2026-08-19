const {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes: defaultRandomBytes,
  timingSafeEqual,
} = require("node:crypto");

function normalizeMasterKey(masterKey) {
  const key = Buffer.isBuffer(masterKey)
    ? Buffer.from(masterKey)
    : Buffer.from(masterKey || "", "base64url");

  if (key.length !== 32) {
    throw new Error("EXTERNAL_ACCESS_MASTER_KEY must decode to 32 bytes");
  }

  return key;
}

function createExternalTokenSecurity({
  masterKey,
  keyVersion = "v1",
  randomBytes = defaultRandomBytes,
} = {}) {
  const encryptionKey = normalizeMasterKey(masterKey);

  function digestSecret(secret) {
    return createHmac("sha256", encryptionKey)
      .update(`external-access-auth-v1\n${secret}`)
      .digest("hex");
  }

  function aad(tokenId, ownerUserId) {
    return Buffer.from(
      `external-access-token-v1\n${tokenId}\n${ownerUserId}`,
      "utf8",
    );
  }

  return {
    createCredential({ tokenId, ownerUserId }) {
      const secret = randomBytes(32).toString("base64url");
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
      cipher.setAAD(aad(tokenId, ownerUserId));
      const encryptedSecret = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final(),
      ]);

      return {
        credential: `fhp_${tokenId}.${secret}`,
        secretHash: digestSecret(secret),
        encryptedSecret: encryptedSecret.toString("base64url"),
        encryptionNonce: nonce.toString("base64url"),
        encryptionAuthTag: cipher.getAuthTag().toString("base64url"),
        encryptionKeyVersion: keyVersion,
        secretHint: secret.slice(-4),
      };
    },

    revealCredential(token) {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(token.encryptionNonce, "base64url"),
      );
      decipher.setAAD(aad(token._id, token.ownerUserId));
      decipher.setAuthTag(
        Buffer.from(token.encryptionAuthTag, "base64url"),
      );
      const secret = Buffer.concat([
        decipher.update(
          Buffer.from(token.encryptedSecret, "base64url"),
        ),
        decipher.final(),
      ]).toString("utf8");

      return `fhp_${token._id}.${secret}`;
    },

    parseCredential(credential) {
      const match =
        typeof credential === "string"
          ? credential.match(
              /^fhp_([A-Za-z0-9_-]{6,80})\.([A-Za-z0-9_-]{43})$/,
            )
          : null;

      return match
        ? {
            tokenId: match[1],
            secret: match[2],
          }
        : null;
    },

    verifySecret(secret, secretHash) {
      const actual = Buffer.from(digestSecret(secret), "hex");
      const expected =
        typeof secretHash === "string" &&
        /^[a-f0-9]{64}$/.test(secretHash)
          ? Buffer.from(secretHash, "hex")
          : Buffer.alloc(actual.length);

      return timingSafeEqual(actual, expected);
    },
  };
}

module.exports = {
  createExternalTokenSecurity,
};
