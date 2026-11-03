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

### Explain mode (voice-over written from a slide outline)

The Slide visuals window has two voice-over modes:
- **Explain the slide**: for a short outline (just headings). Claude acts as the lecturer, as the original GSA-accounts-explainer did: it teaches every point in order, follows the accounting cycle (source document, calculation, journal, ledger T-accounts, accounting equation), uses one short worked example with round illustrative figures (labelled as illustration), and writes the spoken explanation itself. Slides under 70 words start in this mode.
- **Read the slide text exactly**: the voice says only what is on the slide, with the repeat repair and the word-for-word check. Best for a finished script.

In Explain mode the repeat repair removes only sentences that repeat earlier ones, and the script check is not shown. The voice is still one continuous take, cut into lines.

The video export also checks that wide blocks (T-accounts, journals) fit inside the frame and their own boxes, not just that they are not too tall.

### ElevenLabs credits

Every ElevenLabs voice call spends credits, and an API key can have its own credit limit (set under API keys in ElevenLabs; a key called GSA-Coursevoice had 20 000). To keep spending down:
- An ElevenLabs voice voices a slide once. A Dutch-sounding result is reported, not regenerated (the language is already sent to ElevenLabs). A Gemini voice gets one retry.
- If the one-take split is only somewhat sure, an ElevenLabs take is kept instead of voicing the slide again line by line. The line-by-line fallback no longer checks each line.
- The language check samples the first 45 seconds. It also uses ElevenLabs credits (speech to text), even for a Gemini voice.
- When the key runs out, the error says so ("ElevenLabs credits: ... Raise this API key's credit limit or top up in ElevenLabs, or choose a Gemini voice").

### Lesson library (Netlify Database)

Finished lessons can be saved, reopened, downloaded and embedded. Open **Slide visuals**, build a lesson, then **Save to library**. The **Library** button in the header lists your saved lessons: play one, rename it, download it as a standalone .html file, delete it, or share it.

- **Storage.** Netlify Database (Postgres) through `@netlify/database`. The tables are created by `netlify/database/migrations/20261103120000_create_lesson_library.sql`, which Netlify applies on deploy. A database is provisioned automatically on the first deploy that includes the package; it needs a credit-based Netlify plan.
- **Why not one big file.** A function request is limited to about 6 MB and a finished lesson file can be 12 MB. So a lesson is saved as a small JSON document plus one MP3 clip per spoken line (compressed about 7 times, in the browser, with `@breezystack/lamejs`), uploaded one clip at a time. A lesson only appears in the library once every clip has arrived, and a failed save removes what was uploaded.
- **Who can see it.** Only the person who saved a lesson can list, open, rename, share or delete it.
- **Embedding.** Tick **Public embed link** on a lesson to get an iframe code for your site. The embed page is small and plays the audio from the app. Unticking it stops the link on the next visit. The embed routes are `/api/embed/<token>` and `/api/embed/<token>/audio/<n>`, they need no sign-in, and they work only for a lesson that is public. The audio supports byte-range requests, which Safari needs. For a very busy site, an MP4 on a video host is the better choice.
- **Download.** The standalone .html built from a saved lesson carries its audio inside it (MP3, about 1 MB for two minutes), so it is far smaller than before.
- Deploy previews get a copy of the production database, so saved lessons are visible there. Do not share a preview link publicly.

### Chat with Claude to edit a lesson
Once a slide has visuals, the Slide visuals window shows a chat panel. The user describes a change (a table row, a figure, a title, an emoji, a spoken sentence, a pronunciation) and Claude answers and proposes it. Nothing changes until the user presses Confirm.
- `POST /api/visuals-chat` queues the job (Netlify Blobs store `chat-jobs`, background function `chat-background`); `GET /api/visuals-chat/:id` returns `{reply, proposal}`. The request carries the lesson JSON and the last 12 chat turns, never audio.
- Claude proposes an RFC 6902 patch (add, replace, remove only; top-level keys `icon,title,subtitle,currency,labels,scenario,beats,pronunciations`; at most 60 operations). `netlify/lib/lessonPatch.mjs` applies it to a copy and validates the result against the player's block rules. A proposal that does not validate is sent back to Claude once to repair, otherwise it is dropped.
- A visual-only change keeps the existing audio and costs no voice credits. A change to caption/narration, or to `pronunciations`, voices the whole slide again in one take (to keep one voice, tone and volume), with the selected narrator.
- `pronunciations` ({"Bates": "Baates"}) are applied to the text sent to the voice only, in `forSpeech`; the screen keeps the written word.
- The last three versions are kept for Undo while the window stays open. After a chat edit the "matches the slide script" check is hidden, because the lesson no longer matches the slide word for word.
- Not editable here: the narrator voice (use the Narrator list) and the audio file itself.

### Narration alignment, small screens, download size, labels
- Narration entry k is spoken when the k-th revealed element appears (a source document, table row, T-account row, totals row, card, tile, chip, flow step or text block each count as one). The prompt tells Claude to count them. If a lesson has more narration entries than elements, the player speaks the extra entries after the last element (and a beat with nothing to reveal speaks them after its caption), so no sentence is skipped.
- On screens up to 760 px wide each block scrolls sideways instead of clipping a wide table.
- "Download standalone .html" now encodes the voice-over as MP3 (the 14.7 MB test page became 2.2 MB).
- The source-document column heading ("Qty" / "Hoev.") and the "To" / "Aan" label follow the lesson language.
