// Bring Your Own Pollen for a static Space. The visitor signs in on
// enter.pollinations.ai and is sent back to this page. The key comes back in
// the URL fragment, which the browser never sends to a server. It is kept in
// sessionStorage for this tab only. Nothing here runs on a server.
// Flow reference: https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md
import { APP_KEY, BUDGET, EXPIRY_DAYS, IMAGE_MODEL, KEY_MODELS, TEXT_MODEL } from "./config.js";

const ENTER = "https://enter.pollinations.ai";
const GEN = "https://gen.pollinations.ai";
const SESSION = "pollen.session";
const PENDING = "pollen.pending";
const DAY_MS = 86_400_000;

export class PollenError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.status = status;
    }
}

// The address the app is served from, without index.html, query or fragment.
// Static Spaces are served from <owner>-<name>.static.hf.space. Inside the
// Hugging Face page the app runs in an iframe whose src is that same origin,
// so `location` is already the direct URL and nothing needs to be built.
export function spaceUrl(href = location.href) {
    return new URL("./", href).href;
}

// client_id is sent only from the origin its key was registered for. Anywhere
// else the consent screen falls back to the hostname and no redirect check runs.
export function clientIdFor(appKey, origin) {
    if (!appKey || new URL(appKey.origin).origin !== origin) return null;
    return appKey.key;
}

export function buildAuthorizeUrl({ redirectUri, state, clientId = null }) {
    const params = new URLSearchParams({
        redirect_uri: redirectUri,
        state,
        models: KEY_MODELS,
        budget: String(BUDGET),
        expiry: String(EXPIRY_DAYS),
    });
    if (clientId) params.set("client_id", clientId);
    return `${ENTER}/authorize?${params}`;
}

// Reads the legacy fragment: #api_key=sk_...&state=... or #error=access_denied.
// The state must match the one this page stored before it redirected.
export function readReturn(hash, expectedState) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (params.has("error")) return { status: "denied" };
    if (!params.has("api_key")) return { status: "none" };
    if (!expectedState || params.get("state") !== expectedState) return { status: "bad-state" };
    const key = params.get("api_key");
    if (!/^sk_\S{8,}$/.test(key)) return { status: "bad-key" };
    return { status: "ok", key };
}

export function storageAvailable() {
    try {
        sessionStorage.setItem("pollen.probe", "1");
        sessionStorage.removeItem("pollen.probe");
        return true;
    } catch {
        return false;
    }
}

export function getSession() {
    try {
        const session = JSON.parse(sessionStorage.getItem(SESSION) || "null");
        if (session?.key && session.expiresAt > Date.now()) return session;
    } catch {}
    clearSession();
    return null;
}

export function clearSession() {
    try {
        sessionStorage.removeItem(SESSION);
    } catch {}
}

const randomState = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

// Top-level navigation only. Inside a framed page, sign-in must run in a full tab.
export function startSignIn() {
    const state = randomState();
    sessionStorage.setItem(PENDING, JSON.stringify({ state }));
    location.assign(
        buildAuthorizeUrl({
            redirectUri: spaceUrl(),
            state,
            clientId: clientIdFor(APP_KEY, location.origin),
        }),
    );
}

// Call once on page load. Returns "ok", "denied", "bad-state", "bad-key",
// "no-storage" or null when the page was not opened from a sign-in.
export function completeSignIn(hash = location.hash) {
    let pending = null;
    try {
        pending = JSON.parse(sessionStorage.getItem(PENDING) || "null");
    } catch {}
    const result = readReturn(hash, pending?.state);
    if (result.status === "none") return null;
    try {
        sessionStorage.removeItem(PENDING);
    } catch {}
    // Drop the fragment so the key is not left in the address bar. The query
    // (for example ?__theme=dark from Hugging Face) is kept.
    history.replaceState(null, "", location.pathname + location.search);
    if (result.status !== "ok") return result.status;
    try {
        sessionStorage.setItem(SESSION, JSON.stringify({ key: result.key, expiresAt: Date.now() + EXPIRY_DAYS * DAY_MS }));
    } catch {
        return "no-storage";
    }
    return "ok";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function failure(res) {
    const body = await res.json().catch(() => ({}));
    const detail = body.error?.message || body.message || `Request failed (${res.status})`;
    if (res.status === 401) {
        clearSession();
        return new PollenError("Your sign-in expired. Sign in again to continue.", 401);
    }
    if (res.status === 402) {
        return new PollenError(
            "You are out of Pollen for this sign-in. Top up at enter.pollinations.ai, or sign in again with a bigger budget.",
            402,
        );
    }
    if (res.status === 429) return new PollenError("Too many requests. Wait a moment and try again.", 429);
    return new PollenError(detail, res.status);
}

// Sends the visitor's key. A 429 is retried once after a short pause, since the
// four panel requests start together.
async function gen(path, init = {}, retry = true) {
    const session = getSession();
    if (!session) throw new PollenError("Sign in with your Pollen to continue.", 401);
    const res = await fetch(GEN + path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${session.key}` },
    });
    if (res.status === 429 && retry) {
        await sleep(2500);
        return gen(path, init, false);
    }
    if (!res.ok) throw await failure(res);
    return res;
}

export async function chat(messages, { signal } = {}) {
    const res = await gen("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: TEXT_MODEL,
            messages,
            response_format: { type: "json_object" },
        }),
        signal,
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new PollenError("The model sent an empty reply.");
    return text;
}

export async function image(prompt, { seed, size, signal } = {}) {
    const params = new URLSearchParams({
        model: IMAGE_MODEL,
        width: String(size),
        height: String(size),
        seed: String(seed),
    });
    const res = await gen(`/image/${encodeURIComponent(prompt)}?${params}`, { signal });
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) throw new PollenError("The picture was not returned.");
    return blob;
}
