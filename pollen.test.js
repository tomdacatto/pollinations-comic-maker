import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAuthorizeUrl, clientIdFor, readReturn, spaceUrl } from "./pollen.js";

test("spaceUrl returns the direct origin root, whether or not index.html was requested", () => {
    assert.equal(spaceUrl("https://owner-name.static.hf.space/"), "https://owner-name.static.hf.space/");
    assert.equal(spaceUrl("https://owner-name.static.hf.space/index.html?__theme=dark#x"), "https://owner-name.static.hf.space/");
    assert.equal(spaceUrl("http://localhost:8790/index.html"), "http://localhost:8790/");
});

test("readReturn accepts the legacy fragment when the state matches", () => {
    const hash = "#api_key=sk_test1234567890&state=abc123";
    assert.deepEqual(readReturn(hash, "abc123"), { status: "ok", key: "sk_test1234567890" });
});

test("readReturn rejects a fragment whose state does not match or is missing", () => {
    assert.equal(readReturn("#api_key=sk_test1234567890&state=other", "abc123").status, "bad-state");
    assert.equal(readReturn("#api_key=sk_test1234567890", "abc123").status, "bad-state");
    assert.equal(readReturn("#api_key=sk_test1234567890&state=abc123", null).status, "bad-state");
});

test("readReturn reports a denial and ignores a page with no fragment", () => {
    assert.equal(readReturn("#error=access_denied&state=abc123", "abc123").status, "denied");
    assert.equal(readReturn("", "abc123").status, "none");
    assert.equal(readReturn("#unrelated=1", null).status, "none");
});

test("readReturn rejects a value that does not look like a secret key", () => {
    assert.equal(readReturn("#api_key=pk_publishable_key&state=abc123", "abc123").status, "bad-key");
    assert.equal(readReturn("#api_key=sk_&state=abc123", "abc123").status, "bad-key");
    assert.equal(readReturn("#api_key=sk_has%20space_here&state=abc123", "abc123").status, "bad-key");
});

test("buildAuthorizeUrl uses the legacy flow and sends no client_id by default", () => {
    const url = new URL(buildAuthorizeUrl({ redirectUri: "https://owner-name.static.hf.space/", state: "s1" }));
    assert.equal(url.origin + url.pathname, "https://enter.pollinations.ai/authorize");
    assert.equal(url.searchParams.get("redirect_uri"), "https://owner-name.static.hf.space/");
    assert.equal(url.searchParams.get("state"), "s1");
    assert.equal(url.searchParams.get("budget"), "1");
    assert.equal(url.searchParams.get("expiry"), "1");
    assert.equal(url.searchParams.get("models"), "text,image,audio");
    assert.equal(url.searchParams.has("client_id"), false);
    assert.equal(url.searchParams.has("response_type"), false, "the fragment flow has no response_type");
});

test("buildAuthorizeUrl adds client_id when one is given", () => {
    const url = new URL(buildAuthorizeUrl({ redirectUri: "https://a.example/", state: "s", clientId: "pk_abc" }));
    assert.equal(url.searchParams.get("client_id"), "pk_abc");
});

test("clientIdFor sends the key only from the origin it was registered for", () => {
    const appKey = { key: "pk_abc", origin: "https://owner-name.static.hf.space" };
    assert.equal(clientIdFor(appKey, "https://owner-name.static.hf.space"), "pk_abc");
    assert.equal(clientIdFor(appKey, "https://someone-else.static.hf.space"), null);
    assert.equal(clientIdFor(null, "https://owner-name.static.hf.space"), null);
});
