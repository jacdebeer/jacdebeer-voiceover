<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

**New to the app? Read [docs/HOW-TO-USE.md](docs/HOW-TO-USE.md): a short manual, and how to save costs.**

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

### Animation

- The live player animates every beat and element in its own way (cards pop in with their badge, formula tiles slide in, flow arrows push, up/down arrows move, a source document drops in, figures in a new row count up, the caption fades in word by word). It follows `prefers-reduced-motion`.
- Gemini's audio is cleaned on arrival (`utils/audioClean.ts`): a few junk samples at the start and a burst of loud noise at the end are cut. Measured on a real clip: 8 junk samples and 127 ms of noise.
- New visual blocks for concept slides: `formula` (big equation tiles), `cards` (labelled cards) and `change` (up/down chips). `text` and `flow` blocks now reveal one element at a time with the voice, like table rows do. The prompt asks for at least one non-text visual per beat.
- **HyperFrames video export was removed.** A video needs a headless browser and FFmpeg, which cannot run in the app or on Netlify; the project could only be rendered on a local machine. The finished lesson is the standalone html (with its voice-over); a screen recording of it gives a video. The earlier export is in the git history (`services/hyperframesExport.ts`).

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
- **Audio, collections and editing.** Besides lessons the library holds **slide audio** (the voice-over of one slide, saved from the Audio panel with *Save audio to library*, or all clips at once as a collection) and **collections**: in *All slides in one html*, *Save slides as a collection* saves every slide as its own lesson, grouped, and *Download the slides as a .zip* gives one html file per slide. Migration `20261104120000_library_collections.sql` adds the `collections` table and the `kind`, `collection_id`, `position` and `source` columns on `lessons` (`source` is the slide text, mode and voice a lesson was made from).
- **Opening saved work in the studio.** The pencil button on a library item, or *Edit* on a collection, loads it back into the studio (a collection or lesson replaces the open project, with Undo; a saved voice-over is added as a new slide). Saving again then *updates* the saved version: `POST /api/library/:id/finish` with `replaces` swaps the new version in for the old one in a single SQL statement, keeping its embed link, sharing and place in its collection. Slides deleted in the studio are removed from the collection; *Save as a new collection / copy* makes a separate one. Lessons saved before this change have no source, so their spoken words stand in for the slide text, and combined (all-in-one) lessons cannot be opened for editing; save the slides as a collection instead.
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

### Reveal in groups, wide tables, and talking in video time
- **Groups.** Narration entry k belongs to the k-th revealed element. If a beat has fewer entries than elements, the player reveals the elements in as many groups as there are entries, cut at block boundaries where possible (extra groups go to the larger blocks, by square root of size), so each sentence appears together with the part of the screen it talks about and nothing appears in silence. With more entries than elements, each element says several lines.
- **Wide tables.** Every block scrolls sideways inside itself at any screen width (printing is unaffected).
- **Video time.** The player shows `m:ss / m:ss` and reports its timeline (when each line is said, and which blocks are on screen) and its current position to the host page with `postMessage`. Durations are exact for WAV clips, read from the clip for MP3 data URIs, and estimated otherwise. The chat shows "Video is at m:ss", has a "Refer to this time" button, and sends the timeline and the paused position to Claude, which maps times such as "at 1:23", "from 0:40 to 1:10" or "here" to the right beat and block and answers in times, not beat numbers. Changed lines on the confirmation card are prefixed with their time.

### Get Sharp Academy branding (`brand/`)
- From the brand kit PDF: colours `#133756` (navy) and `#87c0cd` (teal), Editorial Today Regular for headings, Antonio ExtraLight with +75 tracking (0.075em) for taglines and labels, and the logo (`brand/logo-full.png`, `logo-mark.png`; the white background of the supplied JPG was removed so it sits on any light surface).
- **Editorial Today is a commercial font and its file is not in this project.** Playfair Display (SIL OFL, bundled in `brand/fonts/`) stands in for it. A copy of Editorial Today installed on the viewer's computer is used first. To use the licensed font everywhere, add its `.woff2` to `brand/fonts/` and an `@font-face` for it in `brand/brand.ts`.
- The app's indigo / violet / emerald Tailwind classes are remapped to navy and teal in `index.html` (the darker teal steps are derived, because white text is not readable on `#87c0cd`). The Tailwind 3 CDN reads `tailwind.config`; a matching `@theme` block covers Tailwind 4.
- Rendered pages carry the logo, tagline, brand type and colours with the fonts and logo embedded (no network needed). A "Get Sharp Academy branding" checkbox in both visuals windows turns it off (`brand: false` in the lesson data).

### Translate all, balance slides, all slides in one html
- **Translate all** (toolbar, "3 · Language"): translates every slide to the other language. Nothing changes until every slide has been translated; one level of undo.
- **Balance slides** (`utils/slideBalance.ts`, `BalanceModal`): a slide above 2 400 characters or 380 words is too long to produce (one voice take, one visuals generation, and the whole slide is voiced again for every change). Overflow moves to the start of the next slide, cut so that the parts come out even; headings stay with the paragraph after them; a paragraph is only split when it is longer than the limit by itself; the result is shown before it is applied; one level of undo. The same limit blocks "All slides" until the slides are balanced. The limits are conservative values chosen from what rendered fine in testing (a 518-word explanation), not a provider limit.
- **Slide visuals** is now two things: *This slide* (the window with the chat editor) and *All slides in one html* (`AllSlidesModal`): produces every slide in order (visuals, then voice in one take), reuses slides that are already made, builds one lesson whose navigation is grouped by slide, MP3 audio, and offers download and save to library.
- **Presentation length (Explain mode).** In the all-slides window, *Explain every slide* shows a slider (1 to 30 minutes). `netlify/lib/lengthPlan.mjs` shares the time over the slides (water-filling between 10 s and 150 s per slide, at an assumed 140 words per minute) and writes rule L into each slide's request (`targetSeconds`, `totalMinutes`, `slideCount` on `POST /api/visuals`): the word range and how deep to go (one beat up to 20 s, up to eight beats with two examples at 150 s). The slide's `targetSeconds` is kept on its entry, so changing the slider makes the slides again; the window reports the length actually made.
- **Transcription**: "Copy to Voice-over" moves the transcription to its own editable text box in "Lees Transkripsie Voor", which is what is read aloud.
- A script element without a sentence of its own now appears together with the next element that has one, instead of popping up in silence.

### Voice, one take, and the model
- **Whole slides are voiced as a background job** (`/api/tts-job`, `netlify/functions/tts-background.mts`). A slide as one ElevenLabs take takes longer than a synchronous Netlify function may run (about 26 s, a 504) and as raw audio is larger than a function may answer with (about 6 MB, roughly 94 s). The job runs for up to 15 minutes, asks ElevenLabs for MP3 (`mp3_44100_128`, about a third the size), and the browser fetches it and decodes it to the 24 kHz PCM the rest of the app uses (`utils/audioDecode.ts`). Text of up to 500 characters still uses the synchronous route.
- Before this, a slide whose one-take failed fell back to voicing every sentence on its own, without the Dutch check; that is where Dutch-sounding lines came from. A slide made that way is now flagged ("Not made as one take") with a button to voice it again, and the all-slides producer counts it as needing the voice again.
- **Visuals and chat use `claude-sonnet-5-5`** (set `VISUALS_MODEL` to change it); if the account rejects it, `claude-haiku-5-5` answers (`netlify/lib/anthropic.mts`). The prompt now asks for T-accounts and journals wherever a slide is about accounts (illustrative figures, flagged, never read aloud), mixes block types instead of only cards, and limits how much text goes in each box.
- Both visuals windows have a full-screen button (Esc leaves it).

### Chat in the all-slides window, and no "figures are an example" notes
- Once the one html file is built, the all-slides window has the same chat as the single-slide window. It edits the **whole lesson** (the beats of every slide, each tagged with its slide in `group`), and the times in the chat are times in the whole lesson. A confirmed edit is mapped back to the slides: only slides whose spoken text changed (or that contain a changed pronunciation word) are voiced again, each as one take; the rest keep their audio. Nothing is applied until every voicing has finished. Undo keeps the last three edits; the file is rebuilt after each edit. A combined lesson may have up to 80 beats (a single slide still 12).
- Notes such as "Illustrasie: Die syfers is slegs 'n voorbeeld" (and an "Illustrasie" period in the header line) are no longer written (the prompt forbids them), are removed from new lessons on the server, and are removed when any page is built (`forDisplay`, from `stripIllustrationNotes` in `netlify/lib/lessonRepair.mjs`), so lessons made earlier are cleaned too. If the note also held real content, that content stays as a plain note. Straight `'n` in titles and labels is tidied to `’n`; spoken lines are never touched because the audio is found by their exact text.

### One example through the whole course, and no balance remarks
- When the all-slides window produces slides in order, each new slide is sent the example figures of the slides before it (`services/lessonContext.ts`: the latest state of every T-account with its net balance, plus journal, equation, source-document and calculation lines). The prompt tells the model to use exactly those amounts and counter-accounts for any account already listed, to carry a closing balance forward as the opening balance (Saldo b/o), and to invent figures only for new accounts. The first slide gets none. Slides that are already made are not regenerated; a slide made on its own has no earlier context.
- The player no longer prints "Slegs 'n uittreksel — die totale hoef nie te balanseer nie" (or the English version) under T-accounts, equations or trial balances that do not balance. The green "✓ Debits = Credits" check still shows when the totals do balance.

### Intro, outro, compact navigation, more motion (the html player)
- **Intro and outro** (branded pages only; the "Get Sharp Academy branding" checkbox turns them off). The page opens on an animated intro: the logo arrives, then the lesson title and tagline, with a Play button (which also satisfies the browser's rule that sound needs a click). Play shows the intro for about 2.3 s and then starts the lesson. After the last beat a thank-you screen (logo, "Dankie!" / "Thank you!", confetti) with a replay button appears. Both are silent. The clock counts them: the first beat starts at 0:03 and 4 s are added at the end. Earlier, only the HyperFrames video had an end card; that went with the video export.
- **Compact navigation:** the slides of a multi-slide lesson are tabs ("Skyfie 1  8"); only the sections of the open slide are listed, in one scrolling row. The header is on fewer lines, the logo smaller, and a full-screen button was added next to the controls.
- **Motion:** larger emoji that bounce in and float on the element being spoken; a pointing hand on each new card, step, chip, tile, note or document; a colour wash in the element's own colour on arrival; moving gradient arrows between flow steps and bigger pulsing up/down arrows; operators in formulas pulse; debit amounts flash blue and credit amounts amber as a T-account row arrives; figures count up; sparkles when a beat that ends in a balanced check is complete; a sweep across the top of the stage on each new beat. All of it follows `prefers-reduced-motion`.

### Bookkeeping conventions (every lesson)
- **Folio column always empty.** The prompt (rule D and the schema examples) now asks for `"fol":""` everywhere; before, rule D and the examples asked for folios such as DJ1 and B3, which contradicted the recording rules.
- **Dates are only the day of the month** (`5`, `31`), never `31-Mar-23` or `5 Mei 2026`, in journals, ledgers, T-accounts and equation tables (rule D2). A source document may show its full date; the month and year go in the journal's `period`.
- **Payment by EFT (Cash Payments Journal):** the EFT number (for example `EFT118`) is the source document, in the Doc column of the journal row and in the source document block, never the supplier's invoice number (the invoice number may be in the details).
- These are also enforced in code, not only asked for: `normalizeBookkeeping` (`netlify/lib/lessonRepair.mjs`) clears folios, shortens dates and sets the EFT document number. It runs on new lessons on the server, on every chat edit, and when any page is built (`forDisplay`), so lessons made earlier come out right too.

### Account coverage
- Rule K in the visuals prompt: every account the text names must be drawn at least once as a T-account (normal side, a typical entry, figures consistent with the rest of the lesson and the shared example), also on introduction, overview, comparison and summary slides, where the model used to show only cards, flows and formulas. Up to 3 accounts may share one T-account block on an overview or summary beat. This is an instruction to the model; the app does not check that it was followed.

### Rules for all future lessons (from the chat)
- When a chat change looks like a standing preference (a convention, terminology, a wording or layout rule, how a word is pronounced, or the user says "always" / "from now on"), Claude adds a **rule** to its proposal. The confirmation card then offers three choices: **This file only**, **This file and all future lessons**, or **Only as a rule (the file stays)**. A one-off content change (this figure, this title) has no rule and keeps the single confirm button. If the user only states a rule and nothing in the file needs to change, the card has just "Save as a rule for all future lessons".
- Two kinds of rule, saved per user in Netlify Blobs (`user-rules`, `netlify/lib/rules.mts`, `/api/rules`):
  - **instruction**: one sentence that is added to the lesson-writing prompt for every new lesson and to the chat's own prompt (so it does not contradict it);
  - **pronunciation**: a word and how it is said; sent with every voicing (`narrateLines`), with the lesson's own pronunciations winning.
- "Rules (n)" in the chat header and in the app header opens the list: switch a rule off or delete it. Rules apply to lessons made and voiced from then on; they do not change lessons that already exist. At most 60 rules; the same rule twice is one rule; an unusable rule from the model is dropped and the file change stays.

### Transcription into the open project, and managing slides
- **"Vervang Huidige Skyfie" and "Skep Nuwe Skyfies"** now work inside the project that is open in the Skyfie Stem-Ateljee. A "Skyfie" selector next to them (it follows the open slide) says which slide: the first button replaces that slide's text, the second adds the transcription's paragraphs as new slides after it (a paragraph too long to produce is cut into balanced slides). Before, "Skep Nuwe Skyfies" replaced every slide of the project. Both switch to the Skyfie Stem-Ateljee and offer Undo.
- **Any slide can be deleted or moved.** Each card in the slide strip has a "⋯" menu: move to a position (a list of 1..n), one place left or right, or delete. Cards can also be dragged to another place. The toolbar's delete button still deletes the open slide. Every change shows an Undo bar above the editor. Moving keeps a slide's audio and visuals (they follow the slide), and the editor stays on the slide that was open.
