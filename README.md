<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1y671hbioFvi9cm50oAoD7xAm6CgRVXDQ

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Slide visuals (from GSA-accounts-explainer)

The **Slide visuals** button in the studio turns the current slide's text into an animated accounting explainer (source documents, journals, T-accounts, ledgers) that reveals in step with the selected narrator.

- Claude (`claude-haiku-5-5`) is given the slide text as the script. It returns lesson data only; the fixed player in `lesson-player/` draws it. The prompt and block schema are ported unchanged from GSA-accounts-explainer (`netlify/lib/lessonPrompt.mjs`), plus a rule that the spoken lines must be the slide text verbatim.
- Every spoken line is voiced with the selected narrator (Gemini or ElevenLabs, same `/api/tts` as the rest of the studio) and embedded in the preview, so each line plays as its visual appears.
- The panel checks that the spoken lines equal the slide text word for word and says where they differ.
- Server: `POST /api/visuals` queues a job, `netlify/functions/visuals-background.mts` runs it (up to 15 minutes), `GET /api/visuals/:id` returns the result. Requires a signed-in Identity user.

Add this environment variable on the Netlify site (mark it secret): `ANTHROPIC_API_KEY`.

Not included yet: visuals and their audio are kept in memory for the open page only (use Download .html to keep them); they are not saved to the workspace. The Azure narration and e-mail-code sign-in from the explainer are not used here.

### Animation and video export (HyperFrames)

- The live player animates each beat in and highlights the row being spoken. It follows `prefers-reduced-motion`.
- **HyperFrames video project (.zip)** in the Slide visuals window downloads `index.html` plus one audio clip per spoken line, timed from the real length of each clip. It is a HyperFrames composition (1920x1080, GSAP timeline), checked with `npx hyperframes lint` and rendered with `npx hyperframes render`.
- Render it on your own machine (Node 22+ and FFmpeg). The composition loads GSAP from jsDelivr, so the first render needs internet access.
- Known lint warnings: each beat is a plain section rather than a sub-composition. Rendering is not affected.
- The **Video (HyperFrames)** tab in the Slide visuals window plays the same composition inside the app, with the voice, a play/pause button and a scrubber. It loads GSAP from jsDelivr.
- Gemini's audio is cleaned on arrival (`utils/audioClean.ts`): a few junk samples at the start and a burst of loud noise at the end are cut. Measured on a real clip: 8 junk samples and 127 ms of noise.
- New visual blocks for concept slides: `formula` (big equation tiles), `cards` (labelled cards) and `change` (up/down chips). `text` and `flow` blocks now reveal one element at a time with the voice, like table rows do. The prompt asks for at least one non-text visual per beat.
- The video export scales each beat up or down to fill the 1920x1080 frame.

### Afrikaans terminology and voice

- `netlify/lib/afrikaansTerms.mjs` is the app's built-in Afrikaans glossary: 136 standard terms from the Raad op Rekeningkundige Standaarde glossary (2014), 96 English-to-Afrikaans pairs from N. Stegmann's review of Juta's accounting dictionary (Lexikos 10, 2000, using the review's preferred or replacement terms where it gives one), and a list of Dutch forms to avoid. The existing house terms in `lessonPrompt.mjs` still win where they differ.
- It is sent to Claude for every Afrikaans visuals job, and to Gemini for Translate and Conversational Polish when the target is Afrikaans.
- Voice: Gemini now gets an explicit instruction to speak South African Afrikaans (not Dutch) on every Afrikaans line, whatever the voice's own style prompt says. ElevenLabs keeps `language_code: af` and now uses Eleven v3's most stable setting, so the voice varies less from line to line.
- If the slide text is clearly Afrikaans but the ENG/AFR toggle says English, the text is still voiced as Afrikaans.
- Visuals: every card, formula part, change item and flow step can carry one emoji icon (shown on screen only, never spoken).

### Consistent Afrikaans voice (filter, pronunciation, one take)

- **Pronunciation lexicon** (`netlify/lib/pronunciation.mjs`): text sent to a voice is rewritten first. The screen, subtitles and audio lookup keep the original text. Bate/Bates become Baate/Baates (voices read them as English), BEL and the listed abbreviations are spelled out (B.E.L., K.B.A., B.T.W. ...), whole numbers become Afrikaans words (R4 600 = vier duisend ses honderd rand), and unambiguous Dutch spellings (uitgave, niet, factuur ...) become Afrikaans. Add a word to `SPELLED` or `DUTCH_TO_AFRIKAANS` to extend it.
- **Dutch filter**: after a take is voiced, `/api/voice-check` transcribes it with ElevenLabs Scribe (needs `ELEVENLABS_API_KEY`). If the language heard is Dutch, or the transcript has two or more clearly Dutch words, the take is voiced again (stricter instruction, different sample), up to twice. If the check is unavailable the take is used and the window says "not available".
- **One take**: Slide visuals voices the whole slide in one go, so voice, accent, tone, volume and pace cannot drift between lines, then cuts it back into lines at the pauses (`utils/segmentTake.ts`). If the cut is not trusted it voices line by line instead and says so.
- **Volume**: every generated clip, from every voice, is brought to the same speech level (`normalizeLoudness`), with soft peak limiting instead of clipping.

### Emoji

Every beat, card, formula part, change item, flow step and text box (and the lesson heading) can carry one accounting emoji, shown large (beat and lesson titles inline, flow and formula icons above the label). The prompt asks for them; `addDefaultIcons` in `netlify/lib/lessonRepair.mjs` fills in any that are missing from the wording (Afrikaans or English keywords: bank 🏦, kontant 💰, faktuur 🧾, joernaal 📒, toeneem 📈, ...), so a slide never comes back without them. Emoji are never spoken.
