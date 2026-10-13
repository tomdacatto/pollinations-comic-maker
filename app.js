import {
    DEFAULT_STYLE,
    EXAMPLE_IDEAS,
    PANEL_COUNT,
    PANEL_SIZE,
    SEED,
    STYLES,
    SYSTEM_PROMPT,
} from "./config.js";
import {
    ScriptError,
    bubbleSide,
    layoutPage,
    panelPrompt,
    parseScript,
    retryMessages,
    scriptMessages,
    shareText,
    wrapText,
} from "./comic.js";
import {
    PollenError,
    chat,
    clearSession,
    completeSignIn,
    getSession,
    image,
    spaceUrl,
    startSignIn,
    storageAvailable,
} from "./pollen.js";

const DRAFT = "comic.draft";
const PAPER = "#fbf5e6";
const INK = "#161616";
const YELLOW = "#ffd33d";
const DISPLAY_FONT = 'Impact, "Arial Black", sans-serif';
const BODY_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const BUBBLE_FONT = '"Comic Sans MS", "Comic Neue", "Chalkboard SE", system-ui, sans-serif';

const $ = (id) => document.getElementById(id);
const els = {
    account: $("account"),
    framedNote: $("framed-note"),
    form: $("make"),
    idea: $("idea"),
    style: $("style"),
    go: $("go"),
    chips: $("chips"),
    notice: $("notice"),
    status: $("status"),
    output: $("output"),
    page: $("page"),
    narrate: $("narrate"),
    download: $("download"),
    share: $("share"),
    again: $("again"),
};

// Small DOM builder. Text always goes through textContent, so model output
// can never inject markup.
function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === false || value == null) continue;
        if (key === "text") node.textContent = value;
        else if (key === "class") node.className = value;
        else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? "" : String(value));
    }
    node.append(...children.flat().filter((child) => child != null && child !== false));
    return node;
}

// Hugging Face embeds the Space in an iframe. Storage and sign-in both behave
// differently there, so the page checks for it.
function framed() {
    try {
        return window.top !== window.self;
    } catch {
        return true;
    }
}

// Sign-in needs a full tab and working storage. Otherwise it links to a new tab.
let canStore = true;
const signInControl = () =>
    framed() || !canStore
        ? el("a", { class: "button primary", href: spaceUrl(), target: "_blank", rel: "noopener", text: "Sign in in a new tab" })
        : el("button", { class: "button primary", type: "button", text: "Sign in with Pollen", onclick: startSignIn });

function renderAccount() {
    const signedIn = getSession();
    const nodes = signedIn
        ? [
              el("span", { class: "pill", text: "Signed in with your Pollen" }),
              el("button", {
                  class: "button ghost small",
                  type: "button",
                  text: "Sign out",
                  onclick: () => {
                      clearSession();
                      renderAccount();
                  },
              }),
          ]
        : [signInControl()];
    els.account.replaceChildren(...nodes);
}

function notice(content, tone = "info", action = null) {
    els.notice.className = `notice ${tone}`;
    const body = el("div", {}, ...(Array.isArray(content) ? content : [content]));
    els.notice.replaceChildren(...(action ? [body, action] : [body]));
    els.notice.hidden = false;
}

const hideNotice = () => {
    els.notice.hidden = true;
    els.notice.replaceChildren();
};

function setStatus(text) {
    els.status.textContent = text;
    els.status.hidden = !text;
}

// The current generation. Starting a new one aborts the old one and
// invalidates any late responses.
let job = null;

function revokeUrls(current) {
    for (const panel of current?.panels ?? []) {
        if (panel.url) URL.revokeObjectURL(panel.url);
    }
}

function setBusy(busy) {
    els.go.disabled = busy;
    els.go.textContent = busy ? "Working…" : "Make my comic";
}

// Narrate and share need only the script. Download needs every panel drawn.
function setToolbar(current) {
    const hasScript = Boolean(current?.script);
    const allDrawn = hasScript && current.panels.every((p) => p.status === "done");
    els.narrate.disabled = !hasScript;
    els.share.disabled = !hasScript;
    els.download.disabled = !allDrawn;
}

function panelFigure(current, slot, index, cell) {
    const panel = current.script.panels[index];
    return el(
        "figure",
        { class: "panel", style: `--span:${cell.span}` },
        slot.status === "done" && el("img", { src: slot.url, alt: panel.scene }),
        slot.status === "loading" &&
            el("div", { class: "frame-state" }, el("span", { class: "spinner", "aria-hidden": "true" }), `Drawing panel ${index + 1}`),
        slot.status === "error" &&
            el(
                "div",
                { class: "frame-state error" },
                `Panel ${index + 1} did not draw.`,
                el("button", {
                    class: "button ghost small",
                    type: "button",
                    text: "Try again",
                    onclick: () => drawPanel(current, index),
                }),
            ),
        panel.speech &&
            el(
                "div",
                { class: "bubble", "data-side": bubbleSide(index) },
                panel.speech.who && el("b", { text: `${panel.speech.who}: ` }),
                panel.speech.text,
            ),
        panel.caption && el("div", { class: "caption", text: panel.caption }),
    );
}

function renderComic(current) {
    if (current?.script == null) return;
    const cells = layoutPage(current.panels.length, 2);
    els.page.replaceChildren(
        el("h2", { class: "page-title", text: current.script.title }),
        el(
            "div",
            { class: "grid" },
            current.panels.map((slot, i) => panelFigure(current, slot, i, cells[i])),
        ),
    );
    els.output.hidden = false;
    setToolbar(current);
}

async function drawPanel(current, index) {
    const slot = current.panels[index];
    slot.status = "loading";
    slot.error = null;
    renderComic(current);
    try {
        const blob = await image(panelPrompt(current.script, index, current.style), {
            seed: SEED,
            size: PANEL_SIZE,
            signal: current.signal,
        });
        if (current.signal.aborted) return;
        slot.blob = blob;
        slot.url = URL.createObjectURL(blob);
        slot.status = "done";
    } catch (err) {
        if (current.signal.aborted) return;
        slot.status = "error";
        slot.error = err;
    }
    renderComic(current);
}

// One reply is expected. If it does not parse, the model gets one more try
// with the reason it was rejected.
async function writeScript(idea, style, signal) {
    const messages = scriptMessages({ idea, style, panelCount: PANEL_COUNT, system: SYSTEM_PROMPT });
    const first = await chat(messages, { signal });
    try {
        return parseScript(first, PANEL_COUNT);
    } catch (err) {
        if (!(err instanceof ScriptError)) throw err;
        const second = await chat(retryMessages(messages, first, err.message), { signal });
        return parseScript(second, PANEL_COUNT);
    }
}

async function makeComic(idea, style) {
    const previous = job;
    previous?.controller.abort();
    revokeUrls(previous);
    const controller = new AbortController();
    const current = { controller, signal: controller.signal, idea, style, script: null, panels: [] };
    job = current;
    hideNotice();
    setBusy(true);
    setStatus("Writing the script…");
    els.output.hidden = true;

    try {
        const script = await writeScript(idea, style, current.signal);
        if (job !== current) return;
        current.script = script;
        current.panels = script.panels.map(() => ({ status: "loading", url: null, blob: null, error: null }));
        renderComic(current);
        setStatus(`Drawing ${PANEL_COUNT} panels…`);
        await Promise.all(script.panels.map((_, i) => drawPanel(current, i)));
        if (job !== current) return;
        const failed = current.panels.filter((p) => p.status === "error");
        const paymentError = failed.map((p) => p.error).find((e) => e instanceof PollenError && e.status === 402);
        if (paymentError) {
            showError(paymentError);
        } else if (failed.length) {
            setStatus(`${failed.length} of ${PANEL_COUNT} panels did not draw. Try those again below.`);
        } else {
            setStatus("Your comic is ready.");
        }
    } catch (err) {
        if (job !== current || current.signal.aborted) return;
        showError(err);
    } finally {
        if (job === current) setBusy(false);
    }
}

function showError(err) {
    setStatus("");
    if (err instanceof PollenError && err.status === 402) {
        notice(
            [
                "You are out of Pollen. Top up at ",
                el("a", { href: "https://enter.pollinations.ai", target: "_blank", rel: "noopener", text: "enter.pollinations.ai" }),
                ", or sign in again with a bigger budget.",
            ],
            "error",
            signInControl(),
        );
        return;
    }
    if (err instanceof PollenError && err.status === 401) {
        renderAccount();
        notice(err.message, "error", signInControl());
        return;
    }
    if (err instanceof PollenError && err.status === 429) {
        notice(err.message, "warn");
        return;
    }
    if (err instanceof ScriptError) {
        notice("The model did not return a usable script, even after a retry. Try again, or change the idea a little.", "error");
        return;
    }
    if (err instanceof TypeError) {
        notice("Network error. Check your connection and try again.", "error");
        return;
    }
    notice(err.message || "Something went wrong. Try again.", "error");
}

function saveDraft(idea) {
    try {
        sessionStorage.setItem(DRAFT, idea);
    } catch {}
}

function onMake(event) {
    event.preventDefault();
    const idea = els.idea.value.trim();
    if (!idea) {
        notice("Type an idea first.", "warn");
        return;
    }
    if (!getSession()) {
        notice(
            framed()
                ? "Sign-in has to happen in a full tab. Open this Space in a new tab, sign in there, then make your comic."
                : "Sign in with your own Pollen first. Your idea is kept while you do.",
            "warn",
            signInControl(),
        );
        saveDraft(idea);
        return;
    }
    saveDraft(idea);
    const style = STYLES.find((s) => s.id === els.style.value) ?? STYLES[0];
    makeComic(idea, style);
}

// Read the script aloud with the browser's speech API. No Pollen is spent.
let narrating = false;
function toggleNarrate() {
    if (!("speechSynthesis" in window)) {
        notice("This browser cannot read text aloud.", "warn");
        return;
    }
    speechSynthesis.cancel();
    if (narrating) {
        narrating = false;
        els.narrate.textContent = "Narrate";
        return;
    }
    const lines = job.script.panels.flatMap((p) => [p.caption, p.speech && `${p.speech.who}: ${p.speech.text}`]).filter(Boolean);
    const finish = () => {
        narrating = false;
        els.narrate.textContent = "Narrate";
    };
    lines.forEach((text, n) => {
        const utterance = new SpeechSynthesisUtterance(text);
        if (n === lines.length - 1) {
            utterance.onend = finish;
            utterance.onerror = finish;
        }
        speechSynthesis.speak(utterance);
    });
    narrating = true;
    els.narrate.textContent = "Stop";
}

function drawCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawCaption(ctx, text, x, y, w, h) {
    const pad = 22;
    ctx.font = `600 34px ${BODY_FONT}`;
    const lines = wrapText(text, w - 32 - pad * 2, (s) => ctx.measureText(s).width);
    const lineHeight = 44;
    const boxH = lines.length * lineHeight + pad * 2;
    const bx = x + 16;
    const by = y + h - boxH - 16;
    ctx.fillStyle = YELLOW;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.fillRect(bx, by, w - 32, boxH);
    ctx.strokeRect(bx, by, w - 32, boxH);
    ctx.fillStyle = INK;
    ctx.textBaseline = "top";
    lines.forEach((line, n) => ctx.fillText(line, bx + pad, by + pad + n * lineHeight));
}

function drawBubble(ctx, speech, x, y, w, side) {
    const pad = 22;
    const fontSize = 32;
    ctx.font = `700 ${fontSize}px ${BUBBLE_FONT}`;
    const maxText = Math.min(w * 0.55, 460);
    const label = speech.who ? `${speech.who}: ${speech.text}` : speech.text;
    const lines = wrapText(label, maxText - pad * 2, (s) => ctx.measureText(s).width);
    const lineHeight = 40;
    const bubbleW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const bubbleH = lines.length * lineHeight + pad * 2;
    const bx = side === "left" ? x + 28 : x + w - 28 - bubbleW;
    const by = y + 28;
    roundRect(ctx, bx, by, bubbleW, bubbleH, 28);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    // Tail: a small triangle below the bubble, on the speaker's side.
    const tailBase = side === "left" ? bx + 60 : bx + bubbleW - 60;
    const tailTip = side === "left" ? tailBase - 14 : tailBase + 14;
    const bottom = by + bubbleH;
    ctx.beginPath();
    ctx.moveTo(tailBase - 18, bottom - 2);
    ctx.lineTo(tailTip, bottom + 34);
    ctx.lineTo(tailBase + 18, bottom - 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.stroke();
    // Cover the outline where the tail joins the bubble.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(tailBase - 16, bottom - 4, 32, 6);
    ctx.fillStyle = INK;
    ctx.textBaseline = "top";
    lines.forEach((line, n) => ctx.fillText(line, bx + pad, by + pad + n * lineHeight));
}

// Draws the finished page at print-friendly size. Captions and bubbles are
// drawn onto the canvas, because HTML overlays do not export.
async function drawComicCanvas(current) {
    const CELL = 800;
    const GAP = 24;
    const MARGIN = 48;
    const HEAD = 150;
    const cells = layoutPage(current.panels.length, 2);
    const rows = Math.max(...cells.map((c) => c.row)) + 1;
    const canvas = document.createElement("canvas");
    canvas.width = MARGIN * 2 + 2 * CELL + GAP;
    canvas.height = HEAD + rows * CELL + (rows - 1) * GAP + MARGIN;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = INK;
    ctx.font = `64px ${DISPLAY_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(current.script.title.toUpperCase(), canvas.width / 2, HEAD / 2);
    ctx.textAlign = "left";

    for (const [i, slot] of current.panels.entries()) {
        const cell = cells[i];
        const x = MARGIN + cell.col * (CELL + GAP);
        const y = HEAD + cell.row * (CELL + GAP);
        const w = cell.span * CELL + (cell.span - 1) * GAP;
        const bitmap = await createImageBitmap(slot.blob);
        drawCover(ctx, bitmap, x, y, w, CELL);
        const panel = current.script.panels[i];
        if (panel.caption) drawCaption(ctx, panel.caption, x, y, w, CELL);
        if (panel.speech) drawBubble(ctx, panel.speech, x, y, w, bubbleSide(i));
        ctx.lineWidth = 8;
        ctx.strokeStyle = INK;
        ctx.strokeRect(x, y, w, CELL);
    }
    return canvas;
}

async function downloadPng() {
    if (!job?.script || job.panels.some((p) => p.status !== "done")) return;
    const canvas = await drawComicCanvas(job);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const url = URL.createObjectURL(blob);
    const slug = job.script.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "comic";
    const link = el("a", { href: url, download: `${slug}.png` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function copyShare() {
    if (!job?.script) return;
    const text = shareText(job.script, spaceUrl());
    try {
        await navigator.clipboard.writeText(text);
        setStatus("Share text copied.");
    } catch {
        notice(["Copy did not work here. Select this text and copy it:", el("p", { class: "copy-fallback", text })], "info");
    }
}

function startOver() {
    job?.controller.abort();
    revokeUrls(job);
    job = null;
    els.output.hidden = true;
    els.page.replaceChildren();
    setStatus("");
    hideNotice();
    els.idea.focus();
}

function init() {
    // Hugging Face passes ?__theme=light|dark|system. Light and dark are applied
    // here; system is left to prefers-color-scheme in the stylesheet.
    const theme = new URLSearchParams(location.search).get("__theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

    els.style.replaceChildren(
        ...STYLES.map((s) => el("option", { value: s.id, text: s.label, selected: s.id === DEFAULT_STYLE })),
    );
    els.chips.replaceChildren(
        ...EXAMPLE_IDEAS.map((idea) =>
            el("button", {
                class: "chip",
                type: "button",
                text: idea,
                onclick: () => {
                    els.idea.value = idea;
                    els.idea.focus();
                },
            }),
        ),
    );

    try {
        els.idea.value = sessionStorage.getItem(DRAFT) || "";
    } catch {}

    const storage = storageAvailable();
    canStore = storage;
    if (!storage) {
        els.framedNote.replaceChildren(
            "This browser blocks site storage here, so sign-in cannot be kept. ",
            el("a", { href: spaceUrl(), target: "_blank", rel: "noopener", text: "Open this Space in a new tab" }),
            ".",
        );
        els.framedNote.hidden = false;
    }
    const outcome = storage ? completeSignIn() : null;
    if (outcome === "denied") notice("Sign-in was cancelled. Sign in again whenever you are ready.", "info");
    if (outcome === "bad-state" || outcome === "bad-key") notice("Sign-in could not be verified. Please try again.", "error");
    if (outcome === "no-storage") notice("Signed in, but this browser would not keep the sign-in. Open the Space in a new tab.", "error");

    if (framed()) {
        els.framedNote.replaceChildren(
            "This preview runs inside Hugging Face, which keeps sign-in separate. ",
            el("a", { href: spaceUrl(), target: "_blank", rel: "noopener", text: "Open this Space in a new tab" }),
            " to sign in and make comics.",
        );
        els.framedNote.hidden = false;
    }

    renderAccount();
    els.form.addEventListener("submit", onMake);
    els.idea.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) els.form.requestSubmit();
    });
    els.narrate.addEventListener("click", toggleNarrate);
    els.download.addEventListener("click", downloadPng);
    els.share.addEventListener("click", copyShare);
    els.again.addEventListener("click", startOver);
}

init();
