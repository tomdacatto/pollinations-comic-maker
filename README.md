---
title: Comic Page from One Prompt
emoji: 💥
colorFrom: pink
colorTo: yellow
sdk: static
pinned: false
short_description: One idea becomes a four-panel comic page
tags:
  - pollinations
  - byop
  - comic
  - storytelling
---

# Comic Page from One Prompt

Type one idea. Pollinations writes a four-panel comic script with fixed characters, draws every panel in the same style, and lays the panels out as a comic page with speech bubbles and captions.

Visitors sign in with their own Pollen ([Bring Your Own Pollen](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)), so the Space never pays for anyone's comics. There is no server and no key in this repository.

## What you get

- **Script:** a text model returns strict JSON: a title, characters with a fixed visual description, and per-panel scenes with captions and speech. A reply that does not parse gets one retry.
- **Panels:** all panels are drawn at once with the same look text, character descriptions and seed, so the cast stays recognisable.
- **Page:** a comic-page grid (two columns on wider screens, one column on phones), with speech bubbles and captions drawn as HTML.
- **Download PNG:** the finished page is drawn to a canvas, bubbles and captions included.
- **Copy share text:** the title, the first line and this Space's own URL. It never includes a key.
- **Narrate:** reads the captions and speech with the browser's speech API. This costs no Pollen.
- Light and dark themes, following the system or the Hugging Face theme setting.

## Make it your own

1. Click **Duplicate** on this Space.
2. Edit `config.js`. It holds everything you are likely to change: the text and image models, the number of panels, the looks, the system prompt, the example ideas and the visitor's budget.
3. Done. The new Space works immediately, with no keys to create.

Optional: to attribute the Space to your own developer key and earn on its usage, create a publishable key with your Space URL as its redirect URI, then set `APP_KEY` in `config.js` to `{ key, origin }`. The key is sent only from that origin, so duplicates still work without it.

## How sign-in works

- **Sign in** sends the visitor to `enter.pollinations.ai/authorize` with this page's own URL as the return address. No `client_id` is sent, because a key registered to another Space would reject a different return URL.
- The key comes back in the URL fragment (`#api_key=…`), which browsers never send to a server. The page checks the `state` it stored before leaving, then saves the key in `sessionStorage` (this tab only) and removes the fragment from the address bar.
- Signing out or closing the tab forgets the key.
- The return address is `location` of the running page, so the Space does not need to know its own name. Static Spaces are served from `<owner>-<name>.static.hf.space`.
- Inside the Hugging Face Space page, the app runs in an iframe. That iframe cannot navigate the top page, so **Sign in** opens the Space in a new tab, where the sign-in works in a full tab.
- If the browser blocks site storage, the page says so and offers the new-tab link.

## Models and cost

| Job | Model | Price |
| --- | --- | --- |
| Script | `openai/gpt-5.4-nano`, JSON mode | about 0.15 and 0.94 Pollen per million input and output tokens |
| Panels | `black-forest-labs/flux.1-schnell`, 1024 px, fixed seed | 0.002 Pollen per image |

One comic (one script and four panels) cost about 0.008 Pollen in testing. The visitor's default budget is 1 Pollen for one day.

Models are fixed in `config.js`. They were chosen from the live lists at [text models](https://gen.pollinations.ai/text/models) and [image models](https://gen.pollinations.ai/image/models), and both are open to visitors with Quest Pollen. Check the list again before you change them.

## Limits

- **MCP server mode is not included.** A static Space serves files only and cannot run a server process.
- Image models sometimes draw stray lettering. The prompt asks for no text, but the model may ignore that.
- Narration uses the browser's voices, so it sounds different on each device.

## Files

- `index.html`, `style.css`, `app.js`: the page
- `config.js`: the tunables
- `comic.js`: script parsing and repair, page layout, text wrapping, prompts
- `pollen.js`: sign-in, the key handling and the API calls
- `comic.test.js`, `pollen.test.js`: unit tests (`npm test`, Node 18 or newer, no dependencies)
