// Pure comic logic: parsing and repairing the script, page layout, text
// wrapping and prompts. No DOM and no network, so it is unit-tested directly.

export class ScriptError extends Error {}

const clean = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Take the outermost JSON object out of a model reply. Models sometimes add
// code fences, prose or trailing commas; this removes the first two and the commas.
export function extractObject(raw) {
    const text = String(raw ?? "").replace(/```(?:json)?/gi, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new ScriptError("no JSON object in the reply");
    return text.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1");
}

// Validate and normalise a script. Lengths are clamped, optional fields
// default, extra panels are dropped and invalid characters or speech are removed.
// Throws ScriptError when the script cannot be used, so the caller can retry.
export function parseScript(raw, panelCount) {
    let data;
    try {
        data = JSON.parse(extractObject(raw));
    } catch (err) {
        if (err instanceof ScriptError) throw err;
        throw new ScriptError(`invalid JSON (${err.message})`);
    }
    if (!data || typeof data !== "object") throw new ScriptError("the reply is not a JSON object");

    const panels = Array.isArray(data.panels) ? data.panels : [];
    if (panels.length < panelCount) {
        throw new ScriptError(`expected ${panelCount} panels, got ${panels.length}`);
    }
    const characters = (Array.isArray(data.characters) ? data.characters : [])
        .map((c) => ({ name: clean(c?.name, 24), look: clean(c?.look, 240) }))
        .filter((c) => c.name && c.look)
        .slice(0, 3);

    return {
        title: clean(data.title, 60) || "Untitled comic",
        characters,
        panels: panels.slice(0, panelCount).map((panel, i) => {
            const scene = clean(panel?.scene, 280);
            if (!scene) throw new ScriptError(`panel ${i + 1} has no scene`);
            const speech = panel.speech && typeof panel.speech === "object" ? panel.speech : null;
            const text = clean(speech?.text, 120);
            return {
                scene,
                caption: clean(panel.caption, 140),
                speech: text ? { who: clean(speech.who, 24), text } : null,
            };
        }),
    };
}

export function scriptMessages({ idea, style, panelCount, system }) {
    return [
        { role: "system", content: system },
        {
            role: "user",
            content: `Idea: ${idea}\nLook: ${style.label}.\nWrite exactly ${panelCount} panels.`,
        },
    ];
}

// After an unusable reply, show the model its own answer and why it was rejected.
export function retryMessages(messages, rejectedReply, reason) {
    return [
        ...messages,
        { role: "assistant", content: rejectedReply },
        {
            role: "user",
            content: `That reply was rejected: ${reason}. Reply again with only the corrected JSON object, in the same shape.`,
        },
    ];
}

// Each panel's prompt repeats the style and every character's look so the
// same people and palette appear in each panel.
export function panelPrompt(script, index, style) {
    const cast = script.characters.map((c) => `${c.name}: ${c.look}`).join("; ");
    return [
        `${style.look}.`,
        cast ? `Characters, keep them identical in every panel: ${cast}.` : "",
        `Scene: ${script.panels[index].scene}.`,
        "One single illustration with no text, no lettering and no speech bubbles.",
    ]
        .filter(Boolean)
        .join(" ");
}

// Grid placement for a comic page. The last panel stretches across the row
// when the panel count does not fill it, so the page never has a gap.
export function layoutPage(count, columns = 2) {
    const cells = Array.from({ length: count }, (_, i) => ({
        row: Math.floor(i / columns),
        col: i % columns,
        span: 1,
    }));
    const left = count % columns;
    if (count && left) cells[count - 1].span = columns - left + 1;
    return cells;
}

// Speech bubbles alternate sides so the reading order zigzags down the page.
export const bubbleSide = (index) => (index % 2 ? "right" : "left");

// Greedy word wrap. `measure(text)` returns the width of a string, so the
// function stays independent of the canvas or the DOM. A word wider than the
// line is broken by character.
export function wrapText(text, maxWidth, measure) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= maxWidth) {
            line = candidate;
            continue;
        }
        if (line) lines.push(line);
        let rest = word;
        while (measure(rest) > maxWidth && rest.length > 1) {
            let cut = rest.length - 1;
            while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
            lines.push(rest.slice(0, cut));
            rest = rest.slice(cut);
        }
        line = rest;
    }
    if (line) lines.push(line);
    return lines;
}

// Share text carries the title, the first line of narration and the Space's
// own URL. It never includes a key.
export function shareText(script, url) {
    const line = script.panels.map((p) => p.caption || p.speech?.text || "").find(Boolean);
    return `${script.title}${line ? `: "${line}"` : ""}\nMade from one prompt with Pollinations: ${url}`;
}
