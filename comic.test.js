import assert from "node:assert/strict";
import { test } from "node:test";
import {
    ScriptError,
    bubbleSide,
    extractObject,
    layoutPage,
    panelPrompt,
    parseScript,
    retryMessages,
    scriptMessages,
    shareText,
    wrapText,
} from "./comic.js";

const panel = (scene, extra = {}) => ({ scene, caption: "", speech: null, ...extra });
const goodScript = {
    title: "Rain Mayor",
    characters: [{ name: "Mo", look: "grey cat, yellow raincoat, one white ear" }],
    panels: [
        panel("a wet town square at dawn", { caption: "It always rains here." }),
        panel("a cat in a tall hat on a podium", { speech: { who: "Mo", text: "I will fix the sky." } }),
        panel("umbrellas open in unison"),
        panel("the sun peeks out", { caption: "It did not work.", speech: { who: "Mo", text: "Oops." } }),
    ],
};

test("parseScript accepts a valid script unchanged", () => {
    const parsed = parseScript(JSON.stringify(goodScript), 4);
    assert.equal(parsed.title, "Rain Mayor");
    assert.equal(parsed.characters.length, 1);
    assert.equal(parsed.panels.length, 4);
    assert.deepEqual(parsed.panels[1].speech, { who: "Mo", text: "I will fix the sky." });
    assert.equal(parsed.panels[2].speech, null);
    assert.equal(parsed.panels[2].caption, "");
});

test("parseScript repairs fences, prose and trailing commas", () => {
    const raw = `Sure! Here is the comic:\n\`\`\`json\n${JSON.stringify(goodScript).slice(0, -1)},\n}\n\`\`\`\nEnjoy.`;
    assert.equal(parseScript(raw, 4).panels.length, 4);
});

test("parseScript keeps the first N panels and drops extras", () => {
    const script = { ...goodScript, panels: [...goodScript.panels, panel("extra")] };
    const parsed = parseScript(JSON.stringify(script), 4);
    assert.equal(parsed.panels.length, 4);
    assert.ok(!parsed.panels.some((p) => p.scene === "extra"));
});

test("parseScript rejects a script with too few panels", () => {
    const script = { ...goodScript, panels: goodScript.panels.slice(0, 3) };
    assert.throws(() => parseScript(JSON.stringify(script), 4), (err) => err instanceof ScriptError && /expected 4 panels, got 3/.test(err.message));
});

test("parseScript rejects a panel with no scene", () => {
    const script = { ...goodScript, panels: [panel(""), ...goodScript.panels.slice(1)] };
    assert.throws(() => parseScript(JSON.stringify(script), 4), (err) => err instanceof ScriptError && /panel 1 has no scene/.test(err.message));
});

test("parseScript rejects text that is not JSON with a ScriptError", () => {
    assert.throws(() => parseScript("I cannot do that.", 4), ScriptError);
    assert.throws(() => parseScript('{"title": "x", "panels": [', 4), ScriptError);
    assert.throws(() => parseScript("[1, 2, 3]", 4), ScriptError);
});

test("parseScript drops characters without a name or look and caps them at three", () => {
    const script = {
        ...goodScript,
        characters: [
            { name: "A", look: "a look" },
            { name: "", look: "no name" },
            { name: "B" },
            { name: "C", look: "c" },
            { name: "D", look: "d" },
            { name: "E", look: "e" },
        ],
    };
    const names = parseScript(JSON.stringify(script), 4).characters.map((c) => c.name);
    assert.deepEqual(names, ["A", "C", "D"]);
});

test("parseScript clamps long text and falls back to a default title", () => {
    const script = {
        panels: goodScript.panels.map((p) => ({ ...p, scene: "s".repeat(500), caption: "c".repeat(300) })),
    };
    const parsed = parseScript(JSON.stringify(script), 4);
    assert.equal(parsed.title, "Untitled comic");
    assert.equal(parsed.panels[0].scene.length, 280);
    assert.equal(parsed.panels[0].caption.length, 140);
});

test("parseScript drops speech with empty text and collapses whitespace", () => {
    const script = {
        ...goodScript,
        panels: [panel("a   street\n\nat night", { speech: { who: "Mo", text: "   " } }), ...goodScript.panels.slice(1)],
    };
    const parsed = parseScript(JSON.stringify(script), 4);
    assert.equal(parsed.panels[0].scene, "a street at night");
    assert.equal(parsed.panels[0].speech, null);
});

test("extractObject takes the outermost braces", () => {
    assert.equal(extractObject('noise {"a": {"b": 1}} tail'), '{"a": {"b": 1}}');
});

test("layoutPage fills rows and stretches a lone last panel", () => {
    assert.deepEqual(
        layoutPage(4, 2).map((c) => [c.row, c.col, c.span]),
        [
            [0, 0, 1],
            [0, 1, 1],
            [1, 0, 1],
            [1, 1, 1],
        ],
    );
    assert.deepEqual(layoutPage(3, 2).at(-1), { row: 1, col: 0, span: 2 });
    assert.deepEqual(layoutPage(5, 2).at(-1), { row: 2, col: 0, span: 2 });
    assert.deepEqual(layoutPage(1, 2), [{ row: 0, col: 0, span: 2 }]);
    assert.deepEqual(layoutPage(0, 2), []);
});

test("bubbleSide alternates so bubbles zigzag down the page", () => {
    assert.deepEqual([0, 1, 2, 3].map(bubbleSide), ["left", "right", "left", "right"]);
});

test("wrapText wraps on words and breaks a word wider than the line", () => {
    const measure = (s) => s.length * 10;
    assert.deepEqual(wrapText("one two three four", 100, measure), ["one two", "three four"]);
    assert.deepEqual(wrapText("abcdefghij", 40, measure), ["abcd", "efgh", "ij"]);
    assert.deepEqual(wrapText("   ", 100, measure), []);
    for (const line of wrapText("the quick brown fox jumps", 70, measure)) {
        assert.ok(measure(line) <= 70, `line "${line}" is too wide`);
    }
});

test("panelPrompt repeats the style and every character look, and asks for no text", () => {
    const style = { look: "ink outlines, flat colour" };
    const prompt = panelPrompt(goodScript, 1, style);
    assert.match(prompt, /^ink outlines, flat colour\./);
    assert.ok(prompt.includes("Mo: grey cat, yellow raincoat, one white ear"));
    assert.ok(prompt.includes("Scene: a cat in a tall hat on a podium."));
    assert.match(prompt, /no text/);
    assert.equal(panelPrompt(goodScript, 1, style), prompt, "the same input gives the same prompt");
});

test("scriptMessages and retryMessages build the request and the repair turn", () => {
    const style = { label: "Pop art" };
    const messages = scriptMessages({ idea: "a bee", style, panelCount: 4, system: "SYS" });
    assert.equal(messages[0].content, "SYS");
    assert.match(messages[1].content, /Idea: a bee/);
    assert.match(messages[1].content, /exactly 4 panels/);
    const retry = retryMessages(messages, "bad", "invalid JSON");
    assert.equal(retry.length, messages.length + 2);
    assert.equal(retry.at(-2).content, "bad");
    assert.match(retry.at(-1).content, /rejected: invalid JSON/);
});

test("shareText has the title, the first line and the URL, and no key", () => {
    const text = shareText(goodScript, "https://example.static.hf.space/");
    assert.match(text, /^Rain Mayor: "It always rains here\."/);
    assert.match(text, /https:\/\/example\.static\.hf\.space\/$/);
    assert.ok(!/sk_/.test(text));
});
