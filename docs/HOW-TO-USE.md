# How to use CourseVoice Studio (Get Sharp Academy)

The app turns slide text into a voiced lesson with animated accounting visuals, as one standalone html file. Labels are given in English with the Afrikaans label in brackets.

## 1. The workflow in five steps

1. **Bring the content in.** In **Skyfie Stem-Ateljee** type or paste the text of each slide, upload a PDF (*Laai PDF*) or extract a page. Or use **Klank-Transkripsie** to record or upload speech and turn it into text (see section 4).
2. **Shape the slides.**
   - *Balance slides* (*Balanseer skyfies*) moves text that is too long on to the next slide (limit: 2 400 characters or 380 words per slide). The length bar under each slide card turns amber and then red.
   - *Translate* / *Translate all* (*Vertaal* / *Vertaal alles*) translates one slide or all of them. Nothing changes until every slide has worked, and you can undo.
   - Delete or move any slide with the **"⋯"** menu on its card in the strip, or drag the card to another place. Undo is above the editor.
3. **Choose the narrator** (*Verteller*, step 1 on the right). Press *Choose* (*Kies*) and pick a voice. Pick it once, before you voice anything: another narrator means voicing everything again.
4. **Make the visuals and voice** (*Skyfie-beelde*, step 3 on the right). There are two ways:
   - **This slide** (*Hierdie skyfie*): one slide, with the chat editor. Choose how the voice-over is made: *Explain the slide* (Claude writes a lecturer's explanation from short slide text) or *Read the slide text exactly*. Press *Generate visuals and voice*.
   - **All slides in one html** (*Alle skyfies in een html*): produces every slide in order, then builds one lesson with all of them. Slides that are already made are reused.
5. **Finish.** *Download .html* gives one file with the voice-over inside; it plays in any browser. *Save to library* (*Stoor in biblioteek*) keeps it online, where you can reopen it, share it and copy an embed code (*Biblioteek* in the top bar).

The page opens on a Get Sharp Academy intro, with a thank-you screen at the end. The branding checkbox turns the branding and the intro and outro off.

## 2. Changing a finished lesson: the chat with Claude

Once visuals exist, the panel *Chat with Claude* (*Gesels met Claude*) appears next to the preview. Say what you want changed. You can point at a moment with the video time ("at 1:23: ...", or pause the player and say "here"; the button *Refer to this time* types the time for you).

- Claude **proposes** the change on a card. **Nothing changes until you confirm.**
- A change to how something looks keeps the voice (no voice cost). A change to the spoken words, or a pronunciation, voices the slide again as one take.
- If your request is a standing preference ("always...", "from now on...", how to say a word), the card offers three choices: **this file only**, **this file and all future lessons**, or **only as a rule**. Saved rules are listed under **Rules** (*Reëls*), where you can switch them off or delete them. Rules apply to lessons made and voiced from then on; they do not change lessons that already exist.
- *Undo* brings back the last three versions.

## 3. The finished html

- Controls: play/pause, previous/next, a progress bar with the time, *Show all* (*Wys alles*), voice on/off, full screen and a script pane for read-aloud tools.
- Slides are tabs at the top; the sections of the open slide are listed below them.

## 4. Transcription (Klank-Transkripsie)

Record with the microphone or choose an audio file, then *Transcribe*. The text appears in the box and can be edited.
- *Copy to Voice-over* (*Kopieer na Lees Voor*) copies it into the voice-over box on the right, which has its own text.
- *Apply to current slide* (*Vervang Huidige Skyfie*) replaces the slide you choose in the **open project** (use the "Slide" selector next to the buttons).
- *Create slides* (*Skep Nuwe Skyfies*) adds the paragraphs as new slides after the slide you choose. Neither button replaces your project; both can be undone.

## 5. If something goes wrong

- **A slide shows "Not made as one take"**: its sentences were voiced one by one, without the language check, so the accent can differ between lines. Press the button on that card to voice it again.
- **"ElevenLabs credits ..." message**: the credit limit of the key, or of the account, is used up. Raise the key's limit or top up in ElevenLabs, or choose a Gemini voice. Slides already finished are kept.
- **A slide is too long to produce**: use *Balance slides*.
- **A voice sounds Dutch or a word is said wrongly**: voice the slide again, and fix a word once with a pronunciation rule in the chat ("say Bates as Baates from now on").

---

# How to save costs

What costs money: the **voice** (ElevenLabs credits or the Gemini quota, by the amount of text voiced), the **visuals and chat** (Claude), the **language check** (one speech-to-text call per voiced slide) and **translation**. Check each provider's current prices; the app does not show them. These habits keep the number of paid calls down:

1. **Finish the text before you voice anything.** Voicing is the largest cost, and any change to the spoken words voices the whole slide again. Edit, balance and translate first; voice last.
2. **Choose the narrator once.** Changing narrator means voicing every slide again. The sample button next to the narrator also voices a short text, so use it sparingly.
3. **Put all wording changes in one chat message.** One message with five wording changes means one re-voice. Five messages can mean five. Do look-and-feel changes first: they need no new voice.
4. **Use Undo, not another request.** Undo restores the earlier version with its earlier audio, with no new voice cost.
5. **Make visuals first, voice when you are happy.** *Generate visuals and voice* does both; once the visuals are right, *Re-voice with the selected narrator* reuses them and only voices.
6. **Let the all-slides window reuse finished slides.** It produces only slides that are not ready. Do not press *Regenerate* on a slide that is fine.
7. **Keep slides short.** A slide is voiced as one take; shorter slides mean a smaller re-voice whenever one sentence changes. The limit is 2 400 characters, but 1 000 to 1 500 is a comfortable size.
8. **Read mode costs less than Explain.** In *Read the slide text exactly* the voice says your text. In *Explain* Claude first writes 150 to 300 words and those are voiced too. Use Explain where you want the explanation written for you.
9. **Test with one short slide.** Before voicing a whole course, run one slide to check the narrator, the accent and the visuals.
10. **Turn a repeated correction into a rule.** A pronunciation or convention rule saved once (*this file and all future lessons*) saves repeating the same chat request, and the same re-voicing, in every lesson.
11. **Use *Stop* when a run goes wrong.** It stops the next slides from being produced; finished slides are kept.
12. **Save to the library once, at the end.** The library keeps small MP3 files, so reopening and sharing cost nothing extra, and you can download the html again any time.

For whoever runs the deployment: the visuals and chat use `claude-sonnet-5-5` by default; setting `VISUALS_MODEL` to a smaller model reduces the Claude cost at the price of simpler visuals. The ElevenLabs key can be given a credit limit in ElevenLabs so a long run cannot use more than intended.
