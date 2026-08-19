const INVALID_CREDENTIAL = Object.freeze({
  ok: false,
  code: "INVALID_CREDENTIAL",
  message: "访问凭证无效或已撤销",
});

function createExternalTokenAuthenticator({
  tokenStore,
  tokenSecurity,
} = {}) {
  return {
    async authenticate(authorizationHeader) {
      const match =
        typeof authorizationHeader === "string"
          ? authorizationHeader.match(/^Bearer ([^\s]+)$/i)
          : null;
      const parsed = match
        ? tokenSecurity.parseCredential(match[1])
        : null;

      if (!parsed) {
        return INVALID_CREDENTIAL;
      }

      const token = await tokenStore.getTokenById(parsed.tokenId);

      if (
        !token ||
        token.revokedAt ||
        !tokenSecurity.verifySecret(
          parsed.secret,
          token.secretHash,
        )
      ) {
        return INVALID_CREDENTIAL;
      }

      return {
        userId: token.ownerUserId,
        externalTokenId: token._id,
        permissionPreset: token.permissionPreset,
      };
    },
  };
}

module.exports = {
  createExternalTokenAuthenticator,
};
