# Anime Garden Magnet Batch Copy

<p align="center">
  <img src="icons/icon128.png" width="96" alt="icon" />
</p>

<p align="center">
  A Chrome extension that batch-copies magnet links from <a href="https://animes.garden">animes.garden</a>
  by <b>fansub group</b> and <b>episode</b>,<br/>
  and generates <b>Emby / Jellyfin / 极影视</b>-friendly <code>SxxEyy</code> names and folders.
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="manifest" src="https://img.shields.io/badge/Chrome-MV3-ff6699.svg" />
</p>

<p align="center"><a href="README.md">简体中文</a> · <b>English</b></p>

## ✨ Features

- **Batch-select by fansub / episode** and copy every magnet link in one click — no more opening entries one by one
- Calls the official API directly, covering **subject / search / fansub / publisher** pages with a single UI
- **Absolute-episode merging for long-running anime**: `09(81)`, `- 81`, `- 01` are unified into the same episode, keeping the chips tidy
- Copies **plain magnet links** — paste straight into your downloader
- Want a tidy NAS library? The companion [`organize.py`](organize.py) sorts your downloads into `Show (Year)/Season xx/Show - SxxEyy`

## 📸 Screenshots

> Coming soon.

## Install (load unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this `ag-magnet-extension` folder
4. A pink magnet icon appears in the toolbar (pin it via the puzzle-piece menu)

## Supported pages

Filters in the page URL are forwarded as-is to the official API, so the same UI works on:

- Subject page `…/subject/456079`
- Search results `…/resources/1?search=…`
- Fansub page `…/resources/1?fansub=…`
- Publisher page `…/resources/1?publisher=…` (plus `include / keywords / type / after / before`, etc.)

For very large result sets, up to 5000 entries are loaded; narrow them with the filters.

## Usage

1. Open any of the pages above and click the extension icon — the popup loads that page's resources automatically
2. **Fansub**: chips toggle which groups are shown; **Select all / Clear** is in the top-right
3. **Episode**: click an episode to check/uncheck all its versions, or **press and drag across chips to range-select multiple episodes**; a half-filled chip means partially selected.
   **When a search spans multiple seasons, chips show `S01E09 / S04E09` so seasons no longer collide**
4. **Resource list**: each resource is one checkable row; keyword filtering (e.g. `Baha`, `简体`, `1080`) distinguishes source/quality
5. Click **Copy selected magnets** at the bottom — **plain magnet links** are sorted by episode and joined by newlines into the clipboard, ready to paste into your downloader

## Long-running anime / automatic absolute-episode merging

For a long series like *That Time I Got Reincarnated as a Slime* Season 4, fansubs number episodes inconsistently, which makes them hard to pick by episode when mixed:

- ANi / Skymoon: `第四季 - 81` (**absolute** numbering, continuing from episode 73)
- 沸班亚马: `第四季 - 01` (**season-relative** numbering)
- 豌豆字幕组: `[S4][09(81)]` (**both** relative 09 and absolute 81)

The extension **merges them into the same episode** so the chips only show a clean 01–09:

- **Auto-infer offset**: from a `09(81)`-style title it computes `offset = 81 − 9 = 72` (shown next to "Episode", editable).
- **Unify**: `relative = number > offset ? number − offset : number`. So ANi's 81, 沸班亚马's 01 and 豌豆's 09(81) all merge into **E09**.
- Offset `0` means no conversion (the default for ordinary single-season shows). For cross-season searches chips show `S01E09 / S04E09`, and the offset is **inferred per season / linearly extrapolated**.

> Want clean NAS filenames? A magnet can't rename a single episode's real file (the filename is baked into the torrent
> metadata), so naming is handled after download by `organize.py` — far more reliable than tinkering with the magnet.

## organize.py — sort downloads into a media-server library

Organizes downloaded files into `Show (Year)/Season 04/Show - S04E09.ext`, using the same parsing logic as the
extension (auto season detection, auto offset inference), and renames same-stem `.nfo` / subtitles / posters to follow the video.

```bash
# preview with --dry-run first, drop it once it looks right
python3 organize.py ~/Downloads/SlimeS4 ~/NAS/anime \
    --name "That Time I Got Reincarnated as a Slime" --year 2026 --season 4 --dry-run
```

- Omitting `--season / --offset` triggers auto-inference; `--name` defaults to the source folder name.
- `--mode` defaults to `hardlink` (no extra disk space, keeps the original seeding); also `copy / move / symlink`.
- Anything not recognized as a main episode (OP/ED, etc.) goes into `Specials/` and is listed at the end for manual review.

## How it works

It does not scrape the page DOM; instead it forwards the current page's URL filters to the official API
`GET https://api.animes.garden/resources?<filters>&pageSize=1000&tracker=true`, paging until `complete`.
Episodes are parsed from titles, and trackers are appended to each magnet for more peers.

## Files

- `manifest.json` — MV3 config (only needs `activeTab` and the `api.animes.garden` host permission)
- `popup.html` / `popup.css` / `popup.js` — popup UI and logic
- `organize.py` — script that sorts downloads into an Emby/极影视-compliant library
- `icons/` — icons (including the editable `icon.svg` source)

## Contributing

Issues and PRs welcome. Episode-parsing rules live in `parseRaw` (popup.js) and `parse_raw` (organize.py); keep the
two in sync, and include a real-world title sample when adding a matching rule.

## Disclaimer

This extension is only a convenience tool over the public pages of [animes.garden](https://animes.garden). It calls the
site's public API to aggregate and copy third-party resource links, and **does not host or store any content**. Comply
with your local laws and use it for lawful personal purposes only; copyright of any downloaded content belongs to its
respective owners.

## License

[MIT](LICENSE) © 2026 juju-w
