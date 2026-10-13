// Everything you are likely to change lives in this file.

// Optional attribution for the original Space. Leave null: sign-in then works
// on any duplicate without a registered key. To attribute the app to your own
// pk_ key, set `origin` to this Space's URL and register that URL as the key's
// redirect URI at https://enter.pollinations.ai/keys.
export const APP_KEY = null; // { key: "pk_...", origin: "https://owner-name.static.hf.space" }

// What a visitor's key may spend and for how long. Pollen is per visitor.
export const BUDGET = 1;
export const EXPIRY_DAYS = 1;

// Models. Both are open to visitors with Quest Pollen (not paid_only).
// Prices per the live list at https://gen.pollinations.ai/text/models and
// https://gen.pollinations.ai/image/models: text gpt-5.4-nano is about 0.15 and
// 0.94 Pollen per million input and output tokens; flux.1-schnell is 0.002 per image.
export const TEXT_MODEL = "openai/gpt-5.4-nano";
export const IMAGE_MODEL = "black-forest-labs/flux.1-schnell";

export const PANEL_COUNT = 4;
export const PANEL_SIZE = 1024; // square panels, in pixels
// One seed for every panel keeps the drawing style steadier across panels.
export const SEED = 42;

// Each style's `look` is added to every panel prompt.
export const STYLES = [
    {
        id: "ink",
        label: "Ink and halftone",
        look: "classic comic book art, bold black ink outlines, halftone dots, flat vivid colours",
    },
    {
        id: "pop",
        label: "Pop art",
        look: "pop art, thick outlines, bright primary colours, Ben-Day dots, glossy highlights",
    },
    {
        id: "storybook",
        label: "Storybook watercolour",
        look: "soft watercolour painting, pastel palette, loose ink linework, storybook illustration",
    },
    {
        id: "noir",
        label: "Noir",
        look: "black and white noir comic, heavy shadows, high contrast, grainy texture",
    },
];
export const DEFAULT_STYLE = "ink";

export const EXAMPLE_IDEAS = [
    "A cat becomes mayor of a town where it always rains",
    "Two robots try to bake the first pizza in space",
    "A grandma wins a surfing contest at eighty",
    "A lost sock starts a rescue team",
];

// Sent before every script request. parseScript in comic.js expects this shape.
export const SYSTEM_PROMPT = `You write very short comic strips for one page.
Reply with one JSON object and nothing else. Shape:
{"title": "at most 6 words",
 "characters": [{"name": "name", "look": "fixed visual description: age, hair, clothes, colours, distinctive features"}],
 "panels": [{"scene": "what is drawn: place, action, camera angle. Do not ask for lettering in the picture",
   "caption": "optional narration, at most 20 words",
   "speech": {"who": "speaker", "text": "at most 15 words"} or null}]}
Use one to three characters. Each look is copied into every panel, so keep it concrete.
Tell a beginning, a turn and a punchline. Keep names and looks identical across panels. Write in English.`;
