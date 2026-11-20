/**
 * DEV/TEST ONLY. A software passkey for the browser, to walk through the passkey
 * screens without Face ID, a fingerprint reader or Windows Hello (and so that a
 * script can drive them: an OS prompt can't be clicked from automation).
 *
 * Paste this file into the browser console on a local dev page, after every
 * full page load. It replaces `navigator.credentials.create/get` on that page
 * with P-256 keys made by WebCrypto and kept in this origin's localStorage, and
 * answers the way a real authenticator does. Everything else is the app's real
 * code, including the check against a Sui node.
 *
 *   window.__softPasskeys.pick = 1            which passkey the "person" picks when the page names none
 *   window.__softPasskeys.failNext = "NotAllowedError"   make the next prompt fail like a closed one
 *   window.__softPasskeys.log                 every create/get the page asked for
 *
 * Never use it for a real account: the private keys sit in localStorage. To
 * clean up: localStorage.removeItem("__soft_passkeys") and "reef:wallet:passkey".
 */
(() => {
  if (window.__softPasskeys) return "already installed";
  const KEY = "__soft_passkeys";
  const b64u = (buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const log = [];
  const state = { pick: 0, failNext: null, log };
  window.__softPasskeys = state;

  /** WebCrypto signs as r||s; WebAuthn hands back DER. */
  const der = (raw) => {
    const int = (b) => {
      let i = 0;
      while (i < b.length - 1 && b[i] === 0) i++;
      b = b.slice(i);
      if (b[0] & 0x80) b = Uint8Array.from([0, ...b]);
      return Uint8Array.from([2, b.length, ...b]);
    };
    const r = int(raw.slice(0, 32));
    const s = int(raw.slice(32));
    return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
  };

  const prompt = () => {
    if (!state.failNext) return;
    const name = state.failNext;
    state.failNext = null;
    throw new DOMException("The operation either timed out or was not allowed.", name);
  };

  navigator.credentials.create = async (options) => {
    const p = options.publicKey;
    log.push({ op: "create", rpId: p.rp.id, user: p.user.name, alg: p.pubKeyCredParams.map((x) => x.alg), selection: p.authenticatorSelection });
    prompt();
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const id = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(KEY, JSON.stringify([...load(), { id: b64u(id), jwk, rpId: p.rp.id, name: p.user.name }]));
    return {
      id: b64u(id),
      rawId: id.buffer,
      type: "public-key",
      response: { getPublicKey: () => spki, clientDataJSON: new ArrayBuffer(0), attestationObject: new ArrayBuffer(0) },
    };
  };

  navigator.credentials.get = async (options) => {
    const p = options.publicKey;
    const allow = (p.allowCredentials || []).map((c) => b64u(c.id));
    log.push({ op: "get", rpId: p.rpId, allow, userVerification: p.userVerification });
    prompt();
    const mine = load().filter((c) => c.rpId === p.rpId);
    const credential = allow.length ? mine.find((c) => allow.includes(c.id)) : mine[state.pick];
    if (!credential) throw new DOMException("No passkey for this site", "NotAllowedError");

    const key = await crypto.subtle.importKey("jwk", credential.jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const rpIdHash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(p.rpId)));
    // flags 0x05 = user present + user verified, then a 4-byte counter
    const authenticatorData = Uint8Array.from([...rpIdHash, 5, 0, 0, 0, 1]);
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: "webauthn.get", challenge: b64u(p.challenge), origin: location.origin, crossOrigin: false }),
    );
    const clientDataHash = new Uint8Array(await crypto.subtle.digest("SHA-256", clientDataJSON));
    const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, Uint8Array.from([...authenticatorData, ...clientDataHash])));
    return {
      id: credential.id,
      rawId: unb64u(credential.id).buffer,
      type: "public-key",
      response: { authenticatorData: authenticatorData.buffer, clientDataJSON: clientDataJSON.buffer, signature: der(raw).buffer, userHandle: null },
    };
  };
  return "software passkey installed";
})();
