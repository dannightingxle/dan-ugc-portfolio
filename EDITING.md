# How Creator Desk edits videos in CapCut (rebuild guide)

This explains how a video goes from raw clips to a finished CapCut draft in Creator Desk, so another developer can rebuild it in a new project. That project will be **multi-user**, will support **more editors than CapCut**, and will edit in **each creator's own style**.

Read this first. There are three layers, and the first two live in this repo:

| Layer | Where it lives | What it does |
| --- | --- | --- |
| **Cloud app** (Next.js + Supabase) | `app/hub/_lib/edits/`, `app/api/hub/edits/*`, `app/api/hub/helper/*`, `supabase/migrations/20261016090000_creator_edits.sql` | Edit cards, briefs, clip picks, edit styles, editing notes, the job queue, and the live chat for each edit. |
| **Mac helper** (one Node script) | `public/helper/creator-desk-helper.mjs` (v0.3.12) | Runs on the creator's Mac. Checks the cloud for work, opens file pickers, finds B-roll, then runs the creator's **own Claude Code** headless with a prompt it builds. |
| **Claude Code + CapCut MCP** | The creator's Mac only: `~/.claude/`, the edit folder (default `~/Movies/shortform`), and the MCP server registered as `capcut` | Does the actual edit. It reads the clips, makes the cuts, and writes a new CapCut draft. |

> **Not in this repo:** the CapCut MCP server, its tool list, the CapCut version on the Mac, and the saved style rules. The style rules live in production Supabase and in files on the Mac. Where this guide needs them, it gives the exact command or SQL to pull them; nothing about them is guessed. Sections 1, 2, 5 and 7 say where.

---

## 1. The CapCut MCP: tools, what they do, what they take in

### What the repo shows

- The helper lets Claude Code use the whole server with the tool name `mcp__capcut` (`TOOLS` in `creator-desk-helper.mjs`, line 88). So the MCP server is registered in the creator's Claude Code under the name **`capcut`**.
- The helper's progress parser expects every CapCut tool to be called **`mcp__capcut__capcut_<action>`** (`describeTool()`, line 1584). It strips the prefix and shows "CapCut: <action>" on the edit card, plus the `name` argument when a call has one. That `name` is the draft name, so draft-level calls take a `name`.
- Nothing else about the server is in the repo: no source, no config, no tool list.

### Pull the real tool list (run on the Mac that edits)

```bash
claude mcp list
```

```bash
claude mcp get capcut
```

The server's command or URL tells you which project it is. Check `~/.claude.json` (the `mcpServers` key) and `~/Movies/shortform/.mcp.json`. Then open `claude` in `~/Movies/shortform` and type `/mcp` → `capcut` to see every tool with its input schema. **Paste that output into this section.** It's the one thing this guide can't fill in from the cloud.

### The open-source server it most likely is

Two public servers use exactly the `capcut_<action>` names (links in section 9):

- **[Atx-Guy/capcut-mcp-server](https://github.com/Atx-Guy/capcut-mcp-server)**, a TypeScript MCP server that passes every call to **[VectCutAPI](https://github.com/sun-guannan/VectCutAPI)** (formerly CapCutAPI). VectCutAPI is a Python server on `localhost:9001` that does the real draft writing. VectCutAPI's own MCP server uses the same tools without the `capcut_` prefix (`create_draft`, `add_video`…).
- **[jmsldrn/capcut-mcp](https://github.com/jmsldrn/capcut-mcp)**, which edits draft files in place (tool list below).

`claude mcp get capcut` tells you which one the Mac runs. The VectCut-based tool set, from VectCutAPI's MCP documentation:

| Tool (as Claude Code sees it) | What it does | Main inputs |
| --- | --- | --- |
| `capcut_create_draft` | New empty draft, returns a `draft_id` | `width`, `height` (1080×1920 for 9:16) |
| `capcut_add_video` | Put a clip on a track | `draft_id`, `video_url` (local path or URL), `start`/`end` (source trim, s), `target_start` (timeline position), `track_name`, `speed`, `volume`, transform (`scale_x/y`, `transform_x/y`), transition |
| `capcut_add_audio` | Music, voiceover or SFX | `draft_id`, `audio_url`, `start`/`end`, `target_start`, `volume`, `speed`, audio effects |
| `capcut_add_image` | Still, logo, screenshot overlay | `draft_id`, `image_url`, `start`/`end`, transform, animation in/out, transition |
| `capcut_add_text` | Headline / text card | `draft_id`, `text`, `start`, `end`, `font`, `font_size`, `font_color`, border/stroke, `background_*`, `shadow_*`, `text_styles` (per-range styling), position, intro/outro animation |
| `capcut_add_subtitle` | Captions from an SRT | `draft_id`, `srt` path/text, font style, position (`transform_y`), `time_offset` |
| `capcut_add_effect` | Video effects / filters | `draft_id`, `effect_type`, `parameters`, `start`, duration |
| `capcut_add_sticker` | Sticker | `draft_id`, `resource_id`, position, scale, rotation, `start`/`end` |
| `capcut_add_keyframe` (`add_video_keyframe`) | Punch-in zooms, moves, fades | `draft_id`, `track_name`, `property_types` (e.g. `uniform_scale`, `position_x`, `alpha`), `times`, `values` |
| `capcut_get_duration` (`get_video_duration`) | Clip length | `video_url` |
| `capcut_save_draft` | Write the draft folder | `draft_id` (VectCutAPI writes a `dfd_*` folder; it has to land in CapCut's drafts folder, see section 2) |

If it's **jmsldrn/capcut-mcp**, the tools are:

- `capcut_list_drafts`, `capcut_read_timeline`, `capcut_clone_draft`
- `capcut_add_video` / `_image` / `_audio` / `_text` / `_track`
- `capcut_move_segment`, `capcut_trim_segment`, `capcut_split_segment`, `capcut_delete_segment`
- `capcut_set_props`, `capcut_raw_patch`
- `capcut_validate`, `capcut_save`, `capcut_discard`

It clones segment templates from an existing draft, saves atomically with a `.mcpbak` backup, and **refuses to save while CapCut is running**.

**Check this against `/mcp` on the Mac before relying on it**: names and inputs change between versions.

### What Claude Code uses besides the MCP

These are just as important. Claude Code has `Bash Read Write Edit Glob Grep Skill WebFetch WebSearch` too, and the prompt tells it to use them:

- `ffprobe` / `ffmpeg` for clip lengths, and to pull frames it then reads as images ("look at a frame or two of each").
- `node creator-desk-helper.mjs sound "<link>"` to grab a sound from a TikTok or Instagram page, or from a video that uses it (needs `yt-dlp`/`uvx`).
- `uvx gdown --folder <link>` for Google Drive asset folders, `curl` for direct links, and `screencapture` for app or website screenshots.
- AppleScript into Apple Photos (`search for "WORDS"`), plus `osxphotos export ... --download-missing` for B-roll kept in iCloud.
- The creator's **skills** (`~/.claude/skills/*` and `<edit folder>/.claude/skills/*`). These hold caption-timing scripts, brand profiles (`brands/*.md`) and so on.

---

## 2. How it actually changes CapCut

| Question | Answer | Source |
| --- | --- | --- |
| **What gets written** | A **new CapCut draft folder**. The prompt always says *"Make a new CapCut draft (never overwrite one) named "<name>", adding v2, v3 if that name is taken."* Trial versions **duplicate** a draft and "never change the original". | `promptFor()`, `trialPrompt()` |
| **Where** | CapCut's drafts folder. macOS: `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/<draft name>/`. Windows: `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft\`. A draft is a folder of JSON (`draft_content.json`, `draft_meta_info.json`; newer builds also `draft_info.json`, `template-2.tmp` and a nested timeline document). The MCP server writes it, and CapCut lists the draft the next time it reads that folder. With VectCutAPI the `dfd_*` folder it saves has to be in (or copied into) `com.lveditor.draft`. The helper never touches that folder: it skips any folder called `CapCut` when it lists clips. | MCP server (section 9); `recentClips()` |
| **Draft names** | Personal brand: `Personal <video code>`. Client job: `<Brand> <video code>`, e.g. `Fussy V1`. Whole shoot sheet: `<Brand> V1`, `<Brand> V2`, …. Trials: `<title> T1`, `T2`, …. Claude ends with a line `DRAFT: <name>`, which the helper reads and saves to `hub_edits.draft_name`. | `promptFor()`, `finish()` |
| **CapCut version** | Not stored in the repo. Every helper reads it from `/Applications/CapCut.app/Contents/Info.plist` (`CFBundleShortVersionString`) and reports it every 30 s into `hub_devices.info.capcut`. Run the command or the SQL below to get it. **Version matters.** What's known about CapCut International's draft format by version:
- **8.2 and 9.5** are confirmed to work with pyCapCut.
- **8.7 (Windows):** `template-2.tmp` / `draft_meta_info.json` win over `draft_content.json`.
- **9.2.8+ (macOS):** CapCut reads a nested timeline document; the root files are legacy copies.
- **Some 8.x / 9.3 builds** reject drafts built from old templates.
- **Encryption:** JianYing (the Chinese edition) 6.0+ encrypts drafts, but CapCut International reportedly doesn't (one source), and writing new drafts still works.

Record the version that works on each Mac and **turn off CapCut auto-update**. | `info()`; section 9 |
| **Does CapCut have to be open?** | **No, and it should be closed.** CapCut holds the open project in memory and writes its own copy back on close, so it can overwrite or ignore a new draft (jmsldrn/capcut-mcp refuses to save while it runs). So every prompt says *"If CapCut being open stops the draft saving, say so and stop. I'll close it and reply."* The helper reports whether CapCut is running (`pgrep -x CapCut` → `info.capcutRunning`), so the web app can warn the creator. Exports also happen in CapCut by hand (see section 6). | `promptFor()`, `info()` |
| **Who runs it** | The creator's own `claude` CLI, under their own login and subscription, on their own Mac. The cloud never touches videos: *"Videos never leave your Mac."* Only paths, durations and 160 px thumbnails go up. | helper header, `report()` |

Get the version on the Mac:

```bash
defaults read /Applications/CapCut.app/Contents/Info.plist CFBundleShortVersionString
```

Or for every connected Mac:

```sql
select name, last_seen, info->>'capcut' as capcut, info->>'capcutRunning' as capcut_open,
       info->>'claude' as claude_code, info->>'helper' as helper, info->>'macos' as macos
from hub_devices
where user_id = (select id from auth.users where email = '<creator email>')
order by last_seen desc;
```

### The exact Claude Code call

```text
cd <job folder on the Mac, or ~/Movies/shortform>
claude -p --output-format stream-json --verbose \
  --permission-mode acceptEdits \
  --allowedTools Bash Read Write Edit Glob Grep Skill WebFetch WebSearch mcp__capcut
  [--resume <session id>]          # replies and "carry on"
< prompt on stdin
```

The helper reads the `stream-json` lines and sends them to the card every 1.2 s:

- `assistant` text becomes chat messages.
- `tool_use` becomes short "CapCut: add text (Fussy V1)" lines.
- `session_id` is saved so later replies can `--resume`.

At the end, the run's final message decides the card's state:

| Final message | Card becomes |
| --- | --- |
| Has `DRAFT:` lines | **ready** ("Check it in CapCut") |
| No draft | **needs_you** (Claude asked a question) |
| Errored | **failed** |

---

## 3. The order of steps: raw footage to finished timeline

### A. Before the Mac sees anything (cloud)

1. **Brief → shoot sheet.** In Studio, Claude turns a job's brief into a shoot sheet (`app/hub/_lib/studio/prompts.ts`). Each video card on it has:
   - the reference video and sound
   - the on-screen headline and how long it stays on screen
   - captions yes/no
   - the script, plus 2 alternative hooks (talking videos) or beats (non-talking)
   - clip codes: TH talking head, A1.. app shots, B1.. B-roll, C1.. acting
   - **edit notes in shot order, using the clip codes** ("app screen never longer than 8s")
2. **Edit card.** Each video becomes a row in `hub_edits` whose `brief` is the full card as text (`briefFromSheet()` in `types.ts`). Instead of one card per video, a card can cover a whole sheet (`video_code = 'ALL'`) or be pasted text. It can also say `LIBRARY SEARCH: laptop, coffee` (the Mac finds the B-roll) or `TRIAL VERSIONS:` with `CapCut draft to start from: <name>`.
3. **Pick clips.** Either:
   - press a button so the Mac opens its own file or folder picker (`pick_requested_at` → helper `handlePick()`), or
   - tick clips from the list the Mac sends up: the newest 40 videos, 20 images and 20 audio files from the last 21 days in `~/Downloads`, `~/Desktop` and `~/Movies`, 2 folders deep.

   A picked folder is read in **file-name order (numeric)**, which is the order the clips were filmed.
4. **Run.** `POST /api/hub/edits/[id]/run` sets `status = queued` (optionally for one named Mac).

### B. On the Mac (helper → Claude Code)

5. Within about 2 s, the helper's next check-in claims the card (`claim` → `editing`). If the card has `LIBRARY SEARCH:`, the helper first runs, for each term (up to 6):
   - an Apple Photos search: the newest videos, up to 5, or 3 stills if there are no videos, exported as originals into `~/Movies/Creator Desk/B-roll/<card>/`
   - a file-name search over every video on the external drives: up to 6 matches, using an index cached for 6 h

   It adds what it finds to the card.
6. It builds the prompt (section 5) and starts Claude Code in the **job's own folder**, if the creator set one and it exists, so that folder's `CLAUDE.md`, notes and skills apply. Otherwise it starts in `~/Movies/shortform`.
7. **What Claude Code looks at first.** The order comes from the prompt, plus the creator's `CLAUDE.md` and skills:
   1. The **edit style** and **editing notes** at the top of the prompt, then the brief.
   2. The **clip list** with durations, and which files are images or audio.
   3. **Frames** from each clip (`ffmpeg -ss 1 -i FILE -frames:v 1 frame.jpg`, then it reads the image) to see what each clip is.
   4. For a whole sheet: it **matches clips to videos and shot codes** using the filming order on the sheet, file names, times and frames. It lists the match as `V1: IMG_2001.MOV, IMG_2002.MOV` and **stops to ask** if any match is unsure.
8. **Picking takes.** The shoot sheet films 3 takes of each talking head (e.g. Fussy B1/B2 "3 takes"). The rule written in the prompts is: *use only what fits the shots; skip anything blurry, shaky or with people who aren't me unless the card wants them.* For hooks, the take has to say the script **word for word** where the brief locks it ("hooks word-for-word; body may be reworded"). Any rule about how to rank takes beyond that (energy, first-clean-take, etc.) lives in the creator's `CLAUDE.md` or skills on the Mac, which aren't in this repo. Pull them with section 5's commands.
9. **Cutting silences and mistakes.** Nothing in this repo cuts silence itself. It is done by Claude Code with the creator's skills, which the setup sync carries between Macs (*"brands/\*.md, caption timing scripts…"*). In practice:
   - It transcribes, or uses the script as the reference, to find false starts, repeats and gaps.
   - It sets each clip's `start`/`end` trim and `target_start` so clips butt together on the timeline.
   - It cuts to the voiceover where the VO was recorded separately (Fussy and Coors: "cut to VO").

   The exact gap threshold is a number in that skill. Read it from `~/.claude/skills/` or `~/Movies/shortform/.claude/skills/` (section 5).
10. **Build the timeline in shot order**, following the card's edit notes: main clip(s) → B-roll and app shots over the top, by clip code → headline text and duration → captions (if "Captions: yes") → images and logos → music, voiceover and SFX → extras the brief needs that weren't picked, which it gets or makes itself (screenshots, Drive assets, sounds) or marks with a labelled placeholder.
11. **Save a new draft.** Then it writes a short summary listing what it made, what it swapped in and what's still missing, followed by `DRAFT: <name>`.

### C. After the draft

12. The card shows **"Check it in CapCut"**. The creator opens the draft, fixes what's needed (section 6) and exports.
13. If they reply on the card, the reply goes to the **same Claude Code session** (`--resume`). Lasting feedback comes back as `NOTE:` / `NOTE FOR ALL:` / `NOTE FOR STYLE:` lines and gets saved in the cloud (section 5), so the next edit on any Mac follows it.

---

## 4. Style rules, as numbers

These are the specific numbers this repo and the real job docs set. Rules marked **(Mac)** live in the saved edit style or the Mac's skills, not here. Section 5 shows how to pull them.

| Area | Rule | Where it's set |
| --- | --- | --- |
| **Format** | 9:16 master. Client jobs often also need **4:5**: film centred, then crop 9:16 → 4:5. **No black borders.** All text and faces inside the TikTok safe zone. | Fussy, Coors docs |
| **Deliverables** | **Clean edit:** cut to VO, **no subtitles, no music, no SFX**. **Final edit:** subtitles + music + SFX. Fussy = 2 videos × clean/final × 9:16/4:5 = **8 files**. | Fussy, Coors docs |
| **Length** | Shoot sheet sets it per video; Fussy **30–60 s** (storyboard ~40 s); Coors **≤15 s**. | sheet `length`, docs |
| **Cut pacing** | Hook: **fast cuts, 2–3 clips in the first 4 s** (Fussy 0–4 s). Lists: **one cut per spoken line** (Fussy 11–19 s: 4 lines, 4 cuts ≈ 2 s each). B-roll grabs **2–3 s each**. Coors: **11 shots in 15 s** (cuts every 0.7–1.7 s; e.g. 4.5→6.2→7.6→9.3→10.3→11.0→11.7→13.0). Hero end shot **holds 3 s**. Open on **a strong visual from frame one** (B-roll, or doing something while the hook plays). | Fussy/Coors storyboards; `SCRIPT_RULES` |
| **App / screen recordings** | **Never longer than 8 s** on screen at once. | `SHEET_SPEC` (`prompts.ts`) |
| **Captions** | Final edit: **word-by-word, centred in frame** (Fussy). Card says "Captions: yes/no" per video. Font, size, colour, stroke and animation are **(Mac)**. They go in the saved style as `Captions:` / `Fonts:` rules. The notes-chat prompt's example of the right level of detail is *"Captions: white, bold, max 3 words per line, centred two-thirds down"*. | Fussy doc; notes chat `SYSTEM`; **(Mac)** |
| **On-screen text** | Headline + how long it stays on, per card (`headline`, `headSub`). Coors: **thin white small-caps "spec panel" cards that snap in on each spoken item**, title card at the hook, final-frame card. | sheet card; Coors doc |
| **Zooms** | Coors A1 **slow push in**. Otherwise **(Mac)** `Zooms:` rules (punch-ins are keyframes via `capcut_add_video_keyframe`). | Coors doc; **(Mac)** |
| **B-roll** | Over the top by clip code, as the card says. Only what fits the shot; no blurry or shaky clips, and no other people unless asked. Speed tricks are fine (Coors: reversed shots, ~4 min timelapse sped up to ~1.3 s). | helper prompt; Coors doc |
| **Sound effects** | Final edit only. Fussy: **rain SFX on F4**. Coors: **ice crackle from 10.3 s**. | docs |
| **Music** | Final edit only, "upbeat" (Fussy). The level rule written in code: *music under everything at a level the talking sits clearly over*. The exact dB is **(Mac)**: put it in the style as `Music: -NN dB under voice`. The sound named on the card is fetched from the link (TikTok/Instagram). For idea-based personal-brand cards, the sound is **left out of the draft** and added in the app when posting. | `fileLines()`; HUB.md |
| **Trial reels** | 5 versions; each changes **only the first 1–3 s** (opening shot + hook); everything after stays identical. | `SYSTEM_TRIALS` |

---

## 5. Where the style rules live, and the prompts in full

Style comes from **five places**. Each prompt lists them in this order, and later ones win where they disagree:

1. **The creator's Claude Code setup on the Mac** (read by Claude Code itself):
   - `~/.claude/CLAUDE.md`
   - `~/.claude/skills/*`
   - `<edit folder>/CLAUDE.md`, `CLAUDE.local.md` and `.claude/CLAUDE.md`
   - `<edit folder>/.claude/skills/*`, including `brands/<Brand>.md` brand profiles and caption scripts
   - Claude Code memory at `~/.claude/projects/<folder key>/memory/*.md`

   "Sync my editing setup" copies these files word for word between the creator's Macs through the cloud (`setup.ts`, `setup-types.ts`). It keeps backups in `~/.creator-desk/backups`, never deletes, and never carries `.env` files.
2. **The edit style** (cloud, one per kind: Personal brand / Tech UGC / Brand deals / Other).
   - **Stored in:** `hub_workspaces`, row `project_id = 'editstyles:list'`, as `{ styles: [{ id, name, kind, summary, rules[], source, macs, updatedAt }] }`. Up to 24 styles and 40 rules each. Key frames go in `editstyle:<id>:frames`, 12 per style.
   - **Which one a job uses:** whatever is picked in `editcfg:<job>.styleId`. Otherwise tech jobs get the first `tech` style, other jobs `brand`, and the personal brand `personal`.
   - **Made by** "Read my Mac's editing setup": the helper sends the files from step 1 and Claude sorts them into styles (`SORT_SYSTEM` below).
3. **Editing notes** (cloud): `hub_workspaces` rows `editcfg:_all` (every edit) and `editcfg:<job id>` (one job), `data.notes[]` (newest 60). They're added from an edit's chat (`NOTE:` lines), the notes chat, or typed in.
4. **The video card / brief** itself, including the shoot sheet's edit notes. The card wins where it says otherwise.
5. **Replies in the edit's chat** during an edit.

### Pull the saved rules and examples

```sql
-- the creator's id
select id from auth.users where email = '<creator email>';

-- every edit style with its rules
select jsonb_pretty(data) from hub_workspaces
where user_id = '<id>' and project_id = 'editstyles:list';

-- editing notes for all edits and for each job, and which style each job uses
select project_id, data->'styleId' as style, data->'folder' as mac_folder, jsonb_pretty(data->'notes') as notes
from hub_workspaces where user_id = '<id>' and project_id like 'editcfg:%';

-- the synced Mac setup files (CLAUDE.md, skills, memory) Creator Desk keeps
select project_id, updated_at from hub_workspaces where user_id = '<id>' and project_id like 'setup%';
```

On the Mac, the same rules as files:

```bash
cat ~/.claude/CLAUDE.md ~/Movies/shortform/CLAUDE.md 2>/dev/null; ls ~/.claude/skills ~/Movies/shortform/.claude/skills 2>/dev/null
```

**Paste the output of `editstyles:list` here before you hand this to the next developer.** It holds the real caption font, size, colour, music dB and zoom rules. Until then, the prompts below are the complete rules the repo itself holds.

### The edit prompt the helper sends (single video, `promptFor()`)

Each line is built from the card. `<…>` marks a value that's filled in.

```text
Edit this video in CapCut for me, the same way as when I paste a video card and the clip names into this chat. It's for <Brand>: follow my edit style below, along with my editing skills and the brand profile for <Brand> if there is one.
You're working in <~/job folder>, my folder for these edits: follow its CLAUDE.md, notes and skills for how I edit them.

My edit style for this video - <style name>: <summary>
(This is the saved copy of how I edit these, kept in Creator Desk so every Mac edits them the same way. My CLAUDE.md files and skills on this Mac still apply alongside it, but where they disagree with this style, this style wins - it's the up-to-date one.)
Style rules:
- <rule>
- …

My editing notes - follow these on every edit unless the card says otherwise (where two clash, the later one wins). They're more specific than my edit style, so where a note and the style clash, the note wins:
- <note for all edits>
- <note for this job>

[B-roll I found for you … (LIBRARY SEARCH cards only)]

Clips, on this Mac:
- /Users/…/IMG_2001.MOV (0:14)
- /Users/…/logo.png (image)
- /Users/…/vo.m4a (audio, 0:38)
Images go in as stills or overlays (a logo, product shot, screenshot) where the card says, or where they fit best.
Audio files are a voiceover or music for this edit: use them as the card says (a voiceover under or instead of the talking, music under everything at a level the talking sits clearly over). If it doesn't say, use your judgement and tell me what you did.

Video card:
<the whole card: code, title, type, length, reference, sound, headline, captions yes/no, script, other hooks, delivery, where, props, clips filmed, B-roll and app shots, Edit notes 1..n, post captions, hashtags>

For this run:
- Make a new CapCut draft (never overwrite one) named "<Brand> <V1>", adding v2, v3 if that name is taken.
- If CapCut being open stops the draft saving, say so and stop. I'll close it and reply.
- If the card needs something that isn't in the clips (B-roll, an app screenshot, images, a screen recording), get or make it yourself before asking, the way you would in a normal chat with me:
  - look on this Mac: Apple Photos, Downloads, Desktop, Movies and any connected drives;
  - download it from links on the card or in the brief (a Google Drive folder: `uvx gdown --folder <link> -O <folder>`; a direct image or video link: curl);
  - make it: a screenshot or screen recording of a web page, App Store listing or the app's website (open it, then `screencapture`), a text or list graphic in CapCut, or a freeze-frame or cut-down from the main clip;
  - only if none of that works, put a clearly labelled placeholder in the draft where it goes.
- Sounds: if the card names or links a sound or song, get it: run `node "<helper path>" sound "<link>"` with a TikTok sound page, a TikTok or Instagram video that uses it, or an Instagram audio page - it saves the audio and prints the file. Only a name? Search for it (WebSearch) to find a TikTok using it, then grab that. Or add it from my CapCut favourite sounds if it's there. If none of that works, build the rest and tell me exactly which sound to send a link for.
- Build the draft even if a few extras are missing, then list what you made or swapped in and what I still need to add. Only stop to ask if the main clip can't be found or doesn't match the card.
- When I give you feedback on how you edit in general, not just a change to this one video (fonts, how captions look, pacing, text style), apply it, then save it with one line per rule:
  - `NOTE FOR STYLE: <the rule, in one line>` for a change to my "<style name>" edit style (a font, caption look, colours, layout) - it updates that style for every video in it, on every Mac.
  - `NOTE: <the rule, in one line>` for something just for this job's videos.
  - `NOTE FOR ALL: <the rule, in one line>` for something for all my edits.
  Only for lasting feedback. These lines are how it's remembered: don't also write it into CLAUDE.md, memory or skill files on this Mac - those stay on this one Mac.
- If you need something from me, ask one clear question and stop.
- Finish with a short summary of what you did and, on its own line, DRAFT: <the draft name>.
```

The whole-sheet version (`wholeSheetPrompt()`) is the same, with these differences:

- It lists all the clips filmed.
- It adds *"First work out which clips belong to which video and shot code. Use the filming order on the sheet, the file names and times, and look at a frame or two when you need to. Skip any video with no clips (say which). Before editing, list the match as one line per video (e.g. V1: IMG_2001.MOV, IMG_2002.MOV). If you're unsure about a match, ask me and stop."*
- It names drafts `<Brand> V1`, `V2`….

The trial version (`trialPrompt()`) duplicates the start draft per version, names drafts `T1…T5`, and tries to export each to `~/Movies/Creator Desk/Trial reels/<slug>/T1.mp4…`.

### How a Mac's files become a style (`SORT_SYSTEM`, `styles.ts`)

```text
You sort a video creator's editing setup into edit styles.

The creator edits their short-form videos in CapCut with Claude Code on their Mac. How each kind of video should be edited is written down in files on that Mac: CLAUDE.md files, skills (SKILL.md and the files beside them), memory files and notes. You're given those files.

Find the distinct edit styles in them - for example their personal brand videos, tech UGC videos (app and software videos made for tech companies), brand deals - whatever is actually there. Different folders or skills often mean different styles; files that describe the same style belong together as one.

For each style:
- name: short and plain, the way the creator would say it ("Personal brand", "Tech UGC", "Brand deals"). If one of their existing styles is the same thing, use its exact name.
- kind: "personal" (their own brand's content), "tech" (tech UGC for clients), "brand" (brand deals and sponsored videos), or "other".
- summary: 2-4 plain sentences for the creator on what videos in this style look and feel like.
- rules: the concrete editing rules for this style, one line each, starting with what it's about ("Captions:", "Text:", "Fonts:", "B-roll:", "Cuts:", "Music:", "Hook:", "Zooms:", "Length:", "Export:"). Keep the specifics (fonts, sizes, colours, positions, timings). Only rules that are written in the files: never invent, guess or pad one.
Leave out instructions that aren't about how the videos look and sound (running tools, MCP setup, file housekeeping) and one-offs for a single video. If the files hold no editing rules at all, return no styles.

Their existing styles are listed first, with their rules. They may come from reading another of their Macs, which can be set up differently, so they add together: when a style in these files is one they already have, return it complete - every existing rule, plus what's new in these files, rewriting a rule only where these files clearly change it. Never drop an existing rule just because these files don't mention it. Styles marked "set by them" were written by the creator: still list them if the files have them, but they won't be changed.

reply: one or two friendly sentences to the creator saying which styles you found (or that you found none, and why) and what was new on this Mac.
```

### How feedback updates a style (`FOLD_SYSTEM`, `styles.ts`)

```text
You keep a video creator's edit style up to date. The style is a list of editing rules, one line each, starting with what it's about ("Captions:", "Text:", "Fonts:", "B-roll:", "Cuts:", "Music:"…).

While editing a video, the creator just gave feedback that should change the style from now on. Return the complete updated list of rules:
- Add each new rule, in the same one-line form.
- Where a new rule changes or contradicts an existing one (a different font, size, colour, position or timing), rewrite or replace that existing rule so the list never says two different things.
- Keep every other rule exactly as it is, word for word, in the same order.
Never drop a rule the feedback doesn't touch, and never invent one.
```

### The editing-notes chat (`app/api/hub/edits/notes/chat/route.ts`)

```text
You keep a video creator's editing notes: short standing rules that Claude Code follows every time it edits their videos in CapCut (captions, cuts and pacing, text on screen, zooms, music, B-roll, length, exports).

The creator gives you feedback in a chat, like they would to an editor. Update the notes to match:
- Add a rule for anything new. Make it specific and usable by an editor who's never met them ("Captions: white, bold, max 3 words per line, centred two-thirds down"), not vague ("make captions better").
- Reword a note the feedback changes, and drop one it contradicts or that they ask to drop.
- Keep every other note exactly as it is, in the same order. One line per note, starting with what it's about ("Captions:", "Cuts:", "Hook:").
- If you can't tell what they want, ask one short question in reply and leave the notes unchanged.
reply: one or two friendly sentences to the creator saying what you changed (or your question).
notes: the full updated list of notes for this scope.
```

### Examples

- **Key frames** per style: 6 stills taken at 5 %…95 % of a finished video the creator picks on the Mac, 540 px wide, up to 12 kept per style (`keyFrames()`). They're shown on the style page. They are **not** sent to Claude Code with an edit (the helper gets only name, summary and rules), so today they're reference for people, not the model.
- **Real briefs with edit specs:** the Fussy "Summer BO Anxiety" production plan (v2) and the Coors "Peak of Tech" script/storyboard/shot list, in Google Drive. Section 4 quotes their numbers.

---

## 6. What it gets wrong, and the ~20 % fixed by hand

**How sure this list is:** the repo has no log of corrections. The list comes from the guards built into the prompts and helper, because each guard exists because the failure happened. To get the real list from the creator's own corrections, run:

```sql
select e.title, ev.at, ev.text
from hub_edit_events ev join hub_edits e on e.id = ev.edit_id
where e.user_id = '<id>' and ev.kind = 'user'          -- what the creator typed back
order by ev.at desc limit 200;
```

Then read the `NOTE FOR STYLE` / `NOTE` history in `editcfg:*` → `notes` (`from = 'edit'`). Each one is a correction that became a rule.

| Problem | Why | Who fixes it |
| --- | --- | --- |
| **CapCut open, draft doesn't show or gets overwritten** | CapCut holds its own draft list | Creator closes CapCut, replies "go"; same session carries on |
| **Exports** (clean/final × 9:16/4:5, no black borders) | The MCP writes drafts; export isn't reliable from outside CapCut (the trial prompt says "If you can't, say so: the drafts are enough") | **By hand in CapCut**, including the 4:5 crop |
| **Caption look and animation** | Fonts and CapCut's caption templates/animations are only partly reachable through the MCP; captions built from SRT may not match the creator's animated template | Usually restyled by hand; repeat fixes become `NOTE FOR STYLE` |
| **Sound / trending audio** | TikTok/Instagram sounds often can't be downloaded; idea cards leave the sound out on purpose | Added in CapCut or in the app when posting |
| **Missing B-roll / screenshots** | Not picked, or Photos originals are in iCloud (needs `osxphotos`) | Swapped for labelled placeholders, replaced by hand |
| **Wrong clip ↔ shot match** on whole sheets | Matching from file names, times and a frame or two | Claude lists the match and asks when unsure; creator corrects |
| **Take choice and fine trims** | Picking the best of 3 takes and trimming to the frame on breaths and jump cuts is taste | Tightened by hand |
| **Timing of SFX / text to the beat** | Placement is worked out from the script, not from listening | Nudged by hand |
| **Edit stopped partway** | Mac slept or the helper restarted (`releaseOffline`, `releaseDropped`) | "Carry on" on the card |
| **Brand rules missed** | Brand profile not in the Mac's skills | Add `brands/<Brand>.md` or a job `NOTE:` |

---

## 7. One real example: Fussy "Summer BO Anxiety", Standard (V1)

**This is a reconstruction, not a log.** This session can't read production Supabase, so this is the job's real brief from Google Drive run through the helper's code above. To get the actual run of any recent video, step by step, use:

```sql
select e.title, e.draft_name, e.status, ev.kind, ev.text, ev.at
from hub_edits e join hub_edit_events ev on ev.edit_id = e.id
where e.user_id = '<id>' and e.status in ('ready', 'done')
order by e.updated_at desc, ev.id limit 300;
```

1. **Card:** "Fussy V1 · Summer BO Anxiety". Brief = the production plan:
   - hook word for word
   - body VO
   - storyboard, scenes 1–6
   - shot codes X1, F1, B1, A2…A9, D1/D2, E1/E2, G1/G2, H1
   - edit checklist (clean + final, 9:16 + 4:5)
2. **Clips picked** with the folder picker, read in name order:
   - B1 talking-head takes ×3
   - one continuous body VO `.m4a`
   - the scene clips
   - the H1 screen recording of getfussy.com
3. **Run → Mac claims it.** Status: "Your Mac (…) has started the edit in ~/Movies/shortform."
4. **Prompt** = the brand-deals style + all-edits notes + Fussy notes + clips + card. The draft is named **"Fussy V1"**.
5. **Claude Code:**
   1. `ffprobe` every clip, then pull a frame of each to label them A1…H1.
   2. Pick the B1 take that says the hook word for word.
   3. Lay the VO as the spine and trim its gaps and false starts.
   4. Build to the storyboard timings:
      - 0–4 s: hook, fast cuts F1 → A1 sniff → B1
      - 4–11 s: A2, A3, A4
      - 11–19 s: one cut per line, X2 / E1 / D1 / G1
      - 19–26 s: A5–A7
      - 26–33 s: A8, H1 (under 8 s), F2
      - 33–40 s: D2 / G2 / E2, ending on A9 held 3 s
   5. **Clean draft:** no captions, music or SFX.
   6. **Final:** word-by-word centred captions + upbeat music under the VO + rain SFX on F4.
   7. Card lines along the way: "CapCut: create draft (Fussy V1)", "CapCut: add video", "CapCut: add subtitle", "CapCut: add audio", "CapCut: save draft".
6. **Ends with** a summary + `DRAFT: Fussy V1` → card shows **"Check it in CapCut"**.
7. **By hand:** check the caption style, swap the music for the one picked, export 9:16, then 4:5 (multi-format), with no black borders. Repeat for Variation 1, which only changes scene 1.

---

## 8. How it works in the cloud, for many users

### Architecture

```mermaid
sequenceDiagram
  participant W as Web app (Next.js on Vercel)
  participant DB as Supabase (Postgres + Auth)
  participant H as Mac helper (node, launchd)
  participant C as Claude Code + CapCut MCP (creator's Mac)
  W->>DB: create hub_edits card, pick clips, POST /run → status=queued
  loop every 2 s
    H->>W: GET /api/hub/helper/poll?running=<ids>  (Bearer cdh_ token)
    W->>DB: workFor(device): queued edits + style + notes + folder, picks, replies, cancels, style scans, setup sync
    W-->>H: work
  end
  H->>W: POST /helper/edits/:id {claim:true}
  H->>C: claude -p … --resume? (prompt on stdin)
  C-->>H: stream-json (text, tool_use, session_id, result)
  H->>W: POST /helper/edits/:id {events, sessionId, status, draftName, notes}
  W->>DB: hub_edit_events, notes → editcfg, NOTE FOR STYLE → fold into editstyles (Claude, after())
  W-->>W: card shows live chat; creator replies → hub_edit_events(kind=user, delivered=false) → next poll → --resume
```

### Pieces to copy

- **Accounts and access.** Supabase email/password auth. Each Mac is a `hub_devices` row; only `sha256(token)` is stored.
  - **Pairing:** an 8-character one-time code, valid 15 minutes (`newPairCode`). The helper swaps it for a long-lived `cdh_…` token (`pairDevice`).
  - **Re-pairing** the same Mac name moves its edits to the new entry.
  - **Every helper call** goes through `helperApi()`, which also re-checks, at most once a minute, that the user still has the `edits` feature and a paid plan. Stopped paying = the Mac stops getting work.
- **Tables:** `hub_devices`, `hub_device_files` (newest 80 clips per Mac, with 160 px thumbnails), `hub_edits` (one card per video; unique per `(user, sheet, video_code)`), `hub_edit_events` (chat; `delivered` marks replies the helper has passed on). All are **server-only**: RLS on, no policies, so only the server key reads them, and every query is scoped by `user_id` in `data.ts`. Styles, notes, folders and requests all go in the generic `hub_workspaces` (`user_id`, `project_id` key, `data jsonb`) table, under these key prefixes: `editstyles:list`, `editstyle:<id>:frames`, `editcfg:<scope>`, `stylereq:scan|grab:<uuid>`, setup-sync rows.
- **Queueing and claiming.** Every claim is a conditional update, so two Macs can't both start the same thing:
  - edits: `update … where status='queued'`
  - pickers: `pick_requested_at` is pushed back 100 years when handed out, so it's handed out once
  - style requests: `data->>status = 'waiting'`
- **Several Macs per user.** A card can be sent to one named Mac (`device_id`) or to any. Each Mac runs 1–4 edits side by side (default 3). A session can only be resumed on the Mac it started on. If it moves, it starts fresh from the card.
- **Recovery.** A Mac is offline after 45 s with no check-in. Edits on a Mac gone for 2 minutes, or dropped by a helper restart, become `failed` with a "Carry on" message.
- **Self-update.** Every poll returns `latest` (`LATEST_HELPER` in `types.ts`, which must match `VERSION` in the helper). When no edit is running, the helper downloads `/helper/creator-desk-helper.mjs`, swaps itself and restarts. `autostart on` installs a `launchd` agent (`com.creatordesk.helper`, `KeepAlive`).
- **Rollout.** `edits` is a staged feature (`features-list.ts`) for owners, the beta group or everyone, set on `/hub/admin`.
- **Cost.** The heavy work (the edit) runs on **the user's own Mac and Claude Code subscription**. The cloud only makes small structured calls with the server's `ANTHROPIC_API_KEY`: sorting styles, folding feedback, the notes chat, shoot sheets.

### Each user's own style

This is already per user, and it's the part to keep and strengthen:

1. **Onboarding:** "Read my Mac's editing setup" → `SORT_SYSTEM` turns their own `CLAUDE.md`, skills and memory into named styles. If they have none, they write rules on the style page, or say them in the notes chat, which turns loose feedback into one-line rules.
2. **Examples:** key frames from a finished video they pick.
3. **Every edit** gets their style + all-edits notes + job notes, in that order of precedence, and the card overrides all three.
4. **Learning:** when they correct an edit, Claude emits `NOTE FOR STYLE:`, which is folded into the style in the cloud, so every Mac and every future job in that style follows it.

**Gaps to fix in the new project:**

- Send the key frames to the editing model as images. Today they're people-only.
- Make the numbers structured: font, size, colour, Y position, words per line, caption animation, music dB, zoom %, maximum shot length. A typed `style.params` object next to the free-text `rules[]` lets any editor adapter apply them exactly. Free text can't be applied mechanically.
- Store a short "before → after" from each `user` correction event, as few-shot examples.
- Add a "style test": re-run one reference edit after a style change and diff it.

---

## 9. Other editors (Premiere Pro, Final Cut, DaVinci Resolve) and one central tool

Checked 2026-11-04. Star counts and dates come from the GitHub pages that day. Anything marked *(unverified)* came from search snippets or directories only.

### CapCut / JianYing

| Project | Activity | How it changes the editor | Notes |
| --- | --- | --- | --- |
| [sun-guannan/VectCutAPI](https://github.com/sun-guannan/VectCutAPI) | ~2.4k★, commit 2026-10-24 | Python HTTP server (:9001) + stdio MCP server; writes a draft folder you put in `com.lveditor.draft`. `draft_profile`: `capcut_legacy` / `jianying_legacy` / `jianying_pro_10` | 11 tools ([MCP doc](https://raw.githubusercontent.com/sun-guannan/VectCutAPI/main/MCP_Documentation_English.md)). Its cloud render isn't open source. No version matrix. |
| [Atx-Guy/capcut-mcp-server](https://github.com/Atx-Guy/capcut-mcp-server) | 88★, 1 commit | TypeScript MCP → VectCutAPI | Tools named `capcut_*`, like the ones the helper expects |
| [jmsldrn/capcut-mcp](https://github.com/jmsldrn/capcut-mcp) | 17★, 1 commit | Edits draft JSON in place by cloning templates; atomic save + `.mcpbak` | Read, trim, split, move segments. Won't save while CapCut runs. `CAPCUT_DRAFTS_DIR` sets the folder. |
| [GuanYixuan/pyCapCut](https://github.com/GuanYixuan/pyCapCut) / [pyJianYingDraft](https://github.com/GuanYixuan/pyJianYingDraft) | ~4.8k★ (pyJianYingDraft), v0.3.1 2026-10-14 | Python library that writes drafts | Most complete feature set (keyframes, masks, chroma, transitions, templates). pyCapCut is validated on CapCut 8.2 and 9.5. No auto-export on Mac. |
| [renezander030/capcut-cli](https://github.com/renezander030/capcut-cli) | ~1.1k★, v0.32 | CLI with schema validation + `.bak`; includes `detect-silence`, `import-srt` | Best notes on [CapCut versions](https://raw.githubusercontent.com/renezander030/capcut-cli/master/docs/version-support.md) and [encryption](https://raw.githubusercontent.com/renezander030/capcut-cli/master/docs/jianying-encryption.md) |
| [dcc-mcp/dcc-mcp-capcut](https://github.com/dcc-mcp/dcc-mcp-capcut) | PyPI 0.5.1, 2026-10-17 | Local bridge + panel injected into CapCut; `apply_edit_plan`, `export_video`, `export_otio` | Injection is manual and needs consent. OTIO export drops volume, fades and caption style. |

CapCut has **no FCPXML / EDL / OTIO import or export** that I found. Only these third-party draft writers get edits in.

### Adobe Premiere Pro

| Project | Activity | How it connects | Notes |
| --- | --- | --- | --- |
| [hetpatel-11/Adobe_Premiere_Pro_MCP](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP) | 814★, 173 commits | Node MCP → script files → **CEP panel** runs ExtendScript (UXP version experimental) | 283 tools behind `search_tools` / `invoke_tool`: import, `add_to_timeline_batch`, `razor_all_tracks`, `trim_clip`, effects, keyframes, `create_caption_track`, `export_sequence`. Premiere 2020+, tested on 26.0. **The most complete.** |
| [mikechambers/adb-mcp](https://github.com/mikechambers/adb-mcp) | 738★ | MCP → Node proxy (ws :3001) → **UXP plugin** | Proof of concept, one sequence only. Shows the UXP pattern to copy (Premiere 25.6+ has UXP). |
| [qmasingarbe/pymiere](https://github.com/qmasingarbe/pymiere) | 473★ | Python → CEP → ExtendScript | Unmaintained (tested up to Premiere 23.1) |

- **Adobe's own Claude connector** (Apr 2026) works at Express/Firefly level. It **doesn't drive desktop Premiere timelines** *(secondary sources)*.
- **The reliable file route** is **FCP7 XML (xmeml)** import.

### Final Cut Pro

- **[DareDev256/fcpxml-mcp-server](https://github.com/DareDev256/fcpxml-mcp-server)** (135★, v0.30.0 2026-11-02). Reads FCPXML 1.8–1.14 and writes 1.13. About 100 operations, including silence removal, rough cuts, transcript edits, markers, and export to Resolve and FCP7 XML. "Live" mode pushes FCPXML into the running app (verified on FCP 12.2). Reading an existing timeline still needs **File › Export XML** by hand.
- **[elliotttate/SpliceKit](https://github.com/elliotttate/SpliceKit)** injects code into a re-signed FCP. It's powerful but **not fit to ship to users**.
- **Apple's limits:** FCP's AppleScript is minimal, and Workflow Extensions exchange FCPXML but can't edit the timeline in place. **Generating FCPXML and importing it is the sanctioned route.**

### DaVinci Resolve

- **[samuelgursky/davinci-resolve-mcp](https://github.com/samuelgursky/davinci-resolve-mcp)** (~3.9k★, v4.18.5). Uses the official Python scripting API with Resolve running. 37 compound tools, or 390 with `--full`. Tested on Studio 19.1–21.0 and the free 21.0.3 through an in-app bridge.
- **Free vs Studio:** external scripting needs **Studio**. 21.1 may have made Python Studio-only *(unconfirmed)*.
- **File routes:** Resolve imports **OTIO, FCPXML, XML, EDL and AAF** natively, so it's the easiest file target.

### Editor-agnostic interchange

- **[OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)** (ASWF, ~2.1k★). One timeline model with adapters for [FCP7 XML (Premiere)](https://github.com/OpenTimelineIO/otio-fcp-adapter), [FCPXML (Final Cut)](https://github.com/OpenTimelineIO/otio-fcpx-xml-adapter), [AAF](https://github.com/OpenTimelineIO/otio-aaf-adapter), [CMX3600 EDL](https://github.com/OpenTimelineIO/otio-cmx3600-adapter) and ALE. Resolve reads `.otio` directly.
- There's **no CapCut adapter** and no dedicated OTIO MCP server.

### Cloud rendering (no desktop editor)

- **[Shotstack](https://shotstack.io/docs/guide/agents/)**: official hosted MCP (`https://mcp.shotstack.io/`), JSON timeline, cloud render plus a browser editor. The closest ready-made fit for multi-user SaaS.
- **[Remotion](https://www.remotion.dev/docs/lambda)**: React video rendered on Lambda. Companies need a paid licence. Its hosted docs MCP closed 2026-10-26.
- **Descript API**: open beta since May 2026; cloud only.
- **ffmpeg**: build your own render worker for previews and simple outputs.

### Recommendation: one central tool, any editor

Keep what Creator Desk already does well:

- the cloud card, queue and chat
- per-user styles, notes and the `NOTE FOR STYLE` learning loop
- the local helper with device tokens and self-update
- running on each user's own machine and Claude Code login

Change *what the AI produces*.

1. **Make the AI write an edit plan, not editor calls.** Today Claude Code drives the CapCut MCP directly, so the edit only exists as a CapCut draft. Instead, have it produce one versioned **edit plan** JSON, stored in the cloud next to the card (e.g. `hub_edits.plan jsonb`). Model the plan on OTIO so the time maths and the Premiere / FCP / Resolve conversions come free. It holds:
   - fps and resolution
   - tracks of clips with `asset` (path on the device + hash), `src_in/src_out`, `rec_in` (in frames), speed, volume and fades
   - transform keyframes (zooms)
   - text and caption items carrying a **style preset id**
   - markers for placeholders ("B-roll needed here")
   - only the transitions and effects all editors share, plus `extensions.capcut|premiere|fcp|resolve` for editor-only extras
2. **Typed style presets per user.** Store `style.params` next to the free-text rules, e.g. `{ captions: { font, size, colour, strokePx, yPct, maxWordsPerLine, animation }, music: { duckDb }, zoom: { punchInPct, everyNSec }, cuts: { maxShotSec, silenceGapMs } }`. Each adapter maps a preset to its own editor:
   - CapCut text styles
   - Premiere caption track style
   - FCP title
   - Resolve Text+

   Free-text rules stay as guidance for the AI; the numbers get applied exactly.
3. **One adapter per editor**, running in the local helper (Mac or Windows):

   | Editor | File route (always works) | Live route (optional) |
   | --- | --- | --- |
   | CapCut | Write a draft folder with pyCapCut or the VectCut generator into `com.lveditor.draft`. CapCut closed, backups, pinned versions. | none safe |
   | Premiere | FCP7 XML via OTIO → import | UXP plugin (adb-mcp pattern) or the CEP MCP above |
   | Final Cut | FCPXML 1.11–1.13 → Open Document | fcpxml-mcp-server live mode |
   | Resolve | `.otio` / FCPXML → `ImportTimelineFromFile` | davinci-resolve-mcp (Studio) |

   Each user picks their editor once, per device (`hub_devices.info.editor`, detected like `info.capcut` is today). The card's run button exports the plan to that editor.
4. **Two things never go through a desktop editor:**
   - **Analysis.** Transcription, silence and mistake detection, take scoring and frame descriptions come before the plan is written. They can run in the helper (ffmpeg + a local Whisper) so videos stay on the user's machine.
   - **Preview and render.** An ffmpeg (or Shotstack) render of the plan works for users without a desktop editor, and gives a web preview on the card.
5. **Expect CapCut to break most.** Its format is undocumented and changes with releases. Keep a test set of drafts for each CapCut version you support, run it in CI, report each Mac's CapCut version as today, and warn when a Mac moves to an untested one.
