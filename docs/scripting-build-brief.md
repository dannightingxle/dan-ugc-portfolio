# Build brief: scriptwriting in Creator Desk

## What I want

A creator drops in a brand brief and gets back a full script pack: 3 hooks, the script with visuals and timings, a shot list grouped by location, and an edit map. The scripts have to sound like a real person, not an ad. The rules for that are in `scriptwriting-prompt.md`, which comes with this brief.

Creator Desk is for other creators too, not just me, so everything here is per user.

## Before you build

1. Look at how the app works now: how the tech UGC shoot list generator calls the model, how brand jobs are stored, how users and auth work, and where API keys live. Reuse those patterns. Don't add a second way of calling the model.
2. Give me a plan before writing any code: which files change, any new tables or fields, and any questions.
3. Don't change the tech UGC shoot list generator in this build.

## The prompt

- Save `scriptwriting-prompt.md` in the repo as-is, next to any other prompts, and load it as the system prompt.
- Fill `{{creator_profile}}` from the creator's profile (below) and `{{creator_rules}}` from their saved rules. If they have no rules yet, put "None yet."
- Don't reword or shorten the rules in it. If you think one should change, ask me.
- Use structured output (JSON schema or tool use) so the reply always parses.

## Creator profile (per user)

If the app already has a profile, extend it. Fields:

- Name and handle
- Spelling (UK or US) and currency
- Niches
- True facts about them that can go in scripts (family, pets, job, routines, where they live). Plain text box. Label it so they know only what's written here gets used.
- How they talk: a short writing or speaking sample, words they use, words they'd never say
- Products they genuinely use (optional)

## The script request

A "Write script" button on a brand job card (prefills brand and anything already on the job), plus a standalone version.

Fields:

- Brand and product
- The brief (paste text; file upload too if the app already handles uploads)
- Length: 15s, 30s or 60s
- Format: talking head, voiceover + B-roll, or a mix
- Their real experience with the product (prompt them: have you used it, what happened, what surprised you)
- Must say / must not say
- Where it's going: brand's ads, my page, or an application

Only brand + product and length are required. The model asks for anything else it needs (see questions in the output).

## Output shape

```json
{
  "questions": ["..."],
  "hooks": [{"text": "...", "visual": "..."}],
  "sections": [{"label": "HOOK | PROBLEM | PRODUCT | PROOF | CTA", "start_s": 0, "end_s": 3, "visual": "...", "lines": ["..."]}],
  "shot_list": [{"code": "A", "location": "...", "shots": [{"code": "A1", "description": "..."}]}],
  "edit_map": [{"line": "...", "shot": "A1", "on_screen_text": "..."}],
  "alt_angles": ["..."],
  "placeholders": ["..."],
  "assumptions": ["..."],
  "flags": ["..."],
  "suggested_rule": ""
}
```

If `questions` isn't empty, show the questions with an answer box each and don't show a script. Answering them re-runs the request with the answers added.

## Checks in code

After each generation, check:

- No em dash (U+2014) or en dash (U+2013) anywhere
- No numbers written as words (one to twenty, thirty, forty, fifty, hundred), outside proper nouns
- None of the banned phrases from the "Never use" section of the prompt (keep the list in 1 config array)
- Spoken word count within 15% of the range for the chosen length (15s: 35-40, 30s: 70-80, 60s: 140-150)
- Exactly 3 hooks, and every edit map shot code exists in the shot list

If anything fails, retry once automatically with the failures listed in the request. If it still fails, show the pack with a small warning listing what failed. Never more than 1 retry.

## Feedback and rules

- A "Not right?" button with quick picks ("Too salesy", "Doesn't sound like me", "Hook's boring", "Too long") plus a free text box. It re-runs the request with the previous version and the feedback included.
- When `suggested_rule` comes back, show it with a "Save this rule" button. Saved rules go in the creator's rules list, which they can edit and delete in their profile, and get injected into every future request.
- Keep every version of a script on the job, newest first.

## Display

- Must work on a phone, because creators read it on set.
- Order: hooks (with visuals), script by section (visual above the lines, timings shown), shot list by location, edit map table.
- Highlight [placeholders] so they stand out. Show assumptions and flags in a small box under the script.
- Buttons: copy the whole pack, copy the script only.

## Done when

- The Rise Oats example from the prompt, entered as a request, gives a pack that passes every code check
- A request with no brief and an unknown product returns questions, not a script
- A saved rule shows up in the prompt of the next request (log it in dev)
- The pack reads well on a phone screen
- The API key never reaches the browser
