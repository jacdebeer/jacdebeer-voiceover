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
