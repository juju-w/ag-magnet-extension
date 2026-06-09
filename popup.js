'use strict';

const API = 'https://api.animes.garden';
// URL filter params we forward to the API (mirrors the site's own query keys).
const FILTER_KEYS = [
  'search', 'include', 'keywords', 'exclude', 'type', 'types',
  'subject', 'subjects', 'fansub', 'fansubs', 'publisher', 'publishers',
  'after', 'before',
];
const MAX_PAGES = 5; // safety cap for broad search/publisher pages (×1000 each)

const el = {
  title: document.getElementById('animeTitle'),
  status: document.getElementById('statusLine'),
  main: document.getElementById('main'),
  empty: document.getElementById('empty'),
  footer: document.getElementById('footer'),
  fansubChips: document.getElementById('fansubChips'),
  fansubAll: document.getElementById('fansubAll'),
  fansubNone: document.getElementById('fansubNone'),
  episodeChips: document.getElementById('episodeChips'),
  keyword: document.getElementById('keyword'),
  list: document.getElementById('list'),
  fmtHint: document.getElementById('fmtHint'),
  showName: document.getElementById('showName'),
  year: document.getElementById('year'),
  season: document.getElementById('season'),
  offset: document.getElementById('offset'),
  copyFormat: document.getElementById('copyFormat'),
  selectAll: document.getElementById('selectAll'),
  clearAll: document.getElementById('clearAll'),
  copyBtn: document.getElementById('copyBtn'),
};

let items = [];
const activeFansubs = new Set();
let copyResetTimer = null;

init();

async function init() {
  const tab = await currentTab();
  const query = tab && tab.url ? buildApiQuery(tab.url) : null;

  if (!query) {
    showEmpty('请在番剧 / 搜索 / 字幕组 / 发布者 页面打开本插件\n\n例如：animes.garden/subject/456079');
    return;
  }

  el.showName.value = guessShowName(tab.title, query);
  el.status.textContent = '正在加载资源…';
  try {
    const { resources, complete } = await fetchAll(query.params);
    if (!resources.length) {
      showEmpty('该页面暂无可用资源');
      return;
    }
    buildItems(resources);
    autoFillSeasonOffset();
    recompute();
    renderFansubs();
    renderEpisodes();
    renderList();
    updateFooter();
    el.main.hidden = false;
    el.footer.hidden = false;
    el.status.textContent =
      `共 ${items.length} 个资源 · ${activeFansubs.size} 个字幕组` +
      (complete ? '' : `（已达 ${MAX_PAGES * 1000} 条上限，请用筛选缩小范围）`);
  } catch (e) {
    showEmpty('加载失败：' + (e && e.message ? e.message : e));
    return;
  }

  el.keyword.addEventListener('input', () => { renderList(); refreshEpisodeChips(); });
  el.showName.addEventListener('input', renderList);
  el.year.addEventListener('input', renderList);
  const recomputeAll = () => {
    recompute();
    renderEpisodes();
    renderList();
    updateFooter();
  };
  el.season.addEventListener('input', recomputeAll);
  el.offset.addEventListener('input', recomputeAll);
  el.copyFormat.addEventListener('change', renderList);
  el.fansubAll.addEventListener('click', () => setAllFansubs(true));
  el.fansubNone.addEventListener('click', () => setAllFansubs(false));
  el.selectAll.addEventListener('click', () => setAllVisible(true));
  el.clearAll.addEventListener('click', () => setAllVisible(false));
  el.copyBtn.addEventListener('click', copySelected);
  document.addEventListener('mouseup', dragEnd);
}

function currentTab() {
  return new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]))
  );
}

// Turn the current page URL into an API query. Works for /subject/:id as well
// as /resources?... search / fansub / publisher pages — the site's query keys
// map 1:1 onto the API's filter params.
function buildApiQuery(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  if (!/animes\.garden$/.test(u.hostname)) return null;

  const subj = u.pathname.match(/\/subject\/(\d+)/);
  if (subj) {
    const p = new URLSearchParams();
    p.append('subject', subj[1]);
    return { params: p, kind: 'subject' };
  }

  const p = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    for (const raw of u.searchParams.getAll(key)) {
      // some links may JSON-encode arrays, e.g. include=["a","b"]
      let values = [raw];
      if (/^\[.*\]$/.test(raw)) {
        try { const arr = JSON.parse(raw); if (Array.isArray(arr)) values = arr; } catch {}
      }
      values.forEach((v) => { if (v != null && v !== '') p.append(key, String(v)); });
    }
  }
  if ([...p].length) return { params: p, kind: 'search' };
  return null;
}

async function fetchAll(params) {
  const all = [];
  let complete = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = new URLSearchParams(params);
    q.set('page', String(page));
    q.set('pageSize', '1000');
    q.set('tracker', 'true');
    const res = await fetch(`${API}/resources?${q.toString()}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const batch = Array.isArray(json.resources) ? json.resources : [];
    all.push(...batch);
    if (json.complete || batch.length < 1000) { complete = true; break; }
  }
  return { resources: all, complete };
}

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function guessShowName(tabTitle, query) {
  if (tabTitle) {
    // "<name> 最新资源 | Anime Garden ..." -> "<name>"
    const name = tabTitle.split('|')[0].replace(/\s*最新资源\s*$/, '').trim();
    if (name && !/Anime Garden/i.test(name)) return stripSeason(name);
  }
  const s = query.params.get('search') || query.params.get('include') || '';
  return stripSeason(s.trim());
}

// Drop season markers from a show name, since season is expressed as SxxEyy.
function stripSeason(s) {
  return s
    .replace(/第\s*[一二三四五六七八九十\d]+\s*季/g, '')
    .replace(/\b\d+(?:st|nd|rd|th)\s*Season\b/gi, '')
    .replace(/\bS0?\d{1,2}\b(?!E\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSeason(title) {
  let m;
  if ((m = title.match(/第\s*([一二三四五六七八九十\d]+)\s*季/))) {
    const v = m[1];
    return CN_NUM[v] ?? (/^\d+$/.test(v) ? +v : null);
  }
  if ((m = title.match(/(\d+)(?:st|nd|rd|th)\s*Season/i))) return +m[1];
  if ((m = title.match(/\bS0?(\d{1,2})(?:E\d|\b)/i))) return +m[1];
  return null;
}

// Extract episode numbers from a title, independent of the season offset.
//   paren  -> "09(81)": a = relative(9), b = absolute(81)
//   range  -> batch "- 73-81": a..b
//   single -> one number that may be relative OR absolute (decided via offset)
function parseRaw(title) {
  let m;
  if ((m = title.match(/(\d{1,3})\s*\(\s*(\d{1,3})\s*\)/))) {
    return { kind: 'paren', a: +m[1], b: +m[2] };
  }
  if ((m = title.match(/-\s*(\d{1,3})\s*-\s*(\d{1,3})(?=\s|\[|\(|话|集|END|Fin|$)/))) {
    return { kind: 'range', a: +m[1], b: +m[2] };
  }
  if ((m = title.match(/第\s*(\d{1,3})\s*[话話集]/))) {
    return { kind: 'single', a: +m[1] };
  }
  if ((m = title.match(/S\d{1,2}E(\d{1,3})/i))) {
    return { kind: 'single', a: +m[1] };
  }
  if ((m = title.match(/-\s*(\d{1,3}(?:\.\d)?)(v\d)?(?=\s|\[|\(|$)/))) {
    return { kind: 'single', a: parseFloat(m[1]), v: m[2] || '' };
  }
  if ((m = title.match(/\[(\d{1,3})(?:v\d)?\]/))) {
    return { kind: 'single', a: +m[1] };
  }
  return { kind: 'none' };
}

// absolute -> season-relative: subtract offset only for numbers past it,
// so already-relative fansubs (e.g. "01") are left untouched.
function toRelative(n, offset) {
  return n > offset ? n - offset : n;
}

// Resolve an item's season-relative episode numbers given the current offset.
//   ep      -> { kind:'ep', num }
//   range   -> { kind:'range', a, b }
//   special -> { kind:'special' }   (OP/ED/特典/未能识别)
function episodeInfo(raw, offset) {
  if (raw.kind === 'paren') return { kind: 'ep', num: raw.a };
  if (raw.kind === 'single') return { kind: 'ep', num: toRelative(raw.a, offset) };
  if (raw.kind === 'range') {
    return { kind: 'range', a: toRelative(raw.a, offset), b: toRelative(raw.b, offset) };
  }
  return { kind: 'special' };
}

function pad(n) {
  if (typeof n === 'number' && !Number.isInteger(n)) return String(n);
  const s = String(n);
  return s.length === 1 ? '0' + s : s;
}

function buildItems(resources) {
  items = resources
    .filter((r) => r.magnet)
    .map((r) => {
      const title = r.title || '';
      return {
        id: r.id,
        res: r,
        magnet: buildMagnet(r),
        fansub: (r.fansub && r.fansub.name) || '（无字幕组）',
        title,
        raw: parseRaw(title),
        seasonDetected: detectSeason(title),
        epLabel: '',
        epSort: 0,
        checked: false,
      };
    });
  items.forEach((it) => activeFansubs.add(it.fansub));
}

// Auto-detect the dominant season and absolute-number offset, prefill the UI.
function autoFillSeasonOffset() {
  const seasonVotes = new Map();
  const offsetVotes = new Map();
  for (const it of items) {
    if (it.seasonDetected) {
      seasonVotes.set(it.seasonDetected, (seasonVotes.get(it.seasonDetected) || 0) + 1);
    }
    if (it.raw.kind === 'paren') {
      const off = it.raw.b - it.raw.a;
      if (off > 0) offsetVotes.set(off, (offsetVotes.get(off) || 0) + 1);
    }
  }
  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (seasonVotes.size) el.season.value = top(seasonVotes);
  if (offsetVotes.size) el.offset.value = top(offsetVotes);

  // year: earliest release year among resources (a sane default for matching)
  let minYear = Infinity;
  for (const it of items) {
    const y = new Date(it.res.createdAt).getFullYear();
    if (y && y < minYear) minYear = y;
  }
  if (isFinite(minYear) && !el.year.value) el.year.value = minYear;
}

// Recompute every item's episode fields from the current offset.
// - Single-season page (a subject page): use the manual 偏移 field.
// - Multi-season list (a cross-season search): labels carry an "Sxx" prefix,
//   and the offset is inferred per season from "rel(abs)" titles, since each
//   season has its own absolute-number base.
function recompute() {
  const distinct = new Set(items.map((it) => it.seasonDetected).filter(Boolean));
  const multi = distinct.size > 1;
  const fieldOffset = Math.max(0, parseInt(el.offset.value, 10) || 0);
  // Undetected items default to S1 (a marker-less first season) in multi mode,
  // else to the (auto-filled, editable) 季 field.
  const fallbackSeason = multi ? 1 : Math.max(0, parseInt(el.season.value, 10) || 1);

  const offMap = {};
  if (multi) {
    const votes = {};
    for (const it of items) {
      if (it.seasonDetected && it.raw.kind === 'paren') {
        const o = it.raw.b - it.raw.a;
        if (o > 0) {
          (votes[it.seasonDetected] = votes[it.seasonDetected] || {});
          votes[it.seasonDetected][o] = (votes[it.seasonDetected][o] || 0) + 1;
        }
      }
    }
    for (const s in votes) {
      offMap[s] = +Object.entries(votes[s]).sort((a, b) => b[1] - a[1])[0][0];
    }
    // Many long series number episodes continuously across seasons
    // (S1: 1-24, S2: 25-48, ...). If some seasons have a known offset but
    // others don't, extrapolate linearly. This is safe: toRelative() only
    // subtracts from numbers ABOVE the offset, so genuinely-relative items
    // (small numbers) are never affected.
    const known = Object.keys(offMap).map(Number).sort((a, b) => a - b);
    if (known.length) {
      let slope, intercept;
      if (known.length >= 2) {
        const xs = known, ys = known.map((s) => offMap[s]);
        const n = xs.length;
        const sx = xs.reduce((a, b) => a + b, 0);
        const sy = ys.reduce((a, b) => a + b, 0);
        const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
        const sxx = xs.reduce((a, x) => a + x * x, 0);
        const denom = n * sxx - sx * sx;
        slope = denom ? (n * sxy - sx * sy) / denom : 0;
        intercept = (sy - slope * sx) / n;
      } else {
        const s0 = known[0], off0 = offMap[s0];
        slope = s0 > 1 && off0 > 0 ? off0 / (s0 - 1) : 0;
        intercept = off0 - slope * s0;
      }
      for (const s of distinct) {
        if (!(s in offMap)) offMap[s] = Math.max(0, Math.round(intercept + slope * s));
      }
    }
  }

  for (const it of items) {
    const ss = it.seasonDetected || fallbackSeason;
    const offset = multi ? (offMap[ss] ?? 0) : fieldOffset;
    const info = episodeInfo(it.raw, offset);
    it.season = ss;
    it.epKind = info.kind;
    it.epNum = info.num;
    it.epA = info.a;
    it.epB = info.b;

    if (info.kind === 'special') {
      it.epLabel = '其它';
      it.epSort = Number.MAX_SAFE_INTEGER;
    } else if (info.kind === 'range') {
      const core = `E${pad(info.a)}-E${pad(info.b)}`;
      it.epLabel = multi ? `S${pad(ss)}${core}` : core;
      it.epSort = ss * 1000 + info.a - 0.5;
    } else {
      const core = `E${pad(info.num)}`;
      it.epLabel = multi ? `S${pad(ss)}${core}` : core;
      it.epSort = ss * 1000 + info.num;
    }
  }
}

function buildMagnet(r) {
  return r.tracker ? r.magnet + r.tracker : r.magnet;
}

// --- NAS-friendly naming ---
function sanitize(s) {
  return String(s).replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

function showTitle() {
  return sanitize(el.showName.value) || 'Anime';
}

function showFolder() {
  const y = parseInt(el.year.value, 10);
  return y ? `${showTitle()} (${y})` : showTitle();
}

function seasonOf(it) {
  // it.season is resolved during recompute(); fall back defensively.
  return Math.max(0, it.season || it.seasonDetected || (parseInt(el.season.value, 10) || 1));
}

// File basename (no extension), e.g. "剧名 - S04E09". Used for the dn rename.
function nasName(it) {
  const show = showTitle();
  const s = pad(seasonOf(it));
  if (it.epKind === 'special') return sanitize(`${show} - ${it.title}`).slice(0, 150);
  if (it.epKind === 'range') return `${show} - S${s}E${pad(it.epA)}-E${pad(it.epB)}`;
  return `${show} - S${s}E${pad(it.epNum)}`;
}

// 极影视 / Emby / Kodi friendly relative path (no extension):
//   剧名 (年)/Season 04/剧名 - S04E09
//   剧名 (年)/Specials/剧名 - <原标题>   (OP/ED/特典)
function nasPath(it) {
  const seasonDir = it.epKind === 'special' ? 'Specials' : `Season ${pad(seasonOf(it))}`;
  return `${showFolder()}/${seasonDir}/${nasName(it)}`;
}

// Replace any existing dn (often an empty "&dn=") with the file basename.
function magnetWithName(it) {
  const base = it.magnet.replace(/[?&]dn=[^&]*/gi, (hit) => (hit[0] === '?' ? '?' : ''));
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}dn=${encodeURIComponent(nasName(it))}`;
}

function formatLine(it) {
  switch (el.copyFormat.value) {
    case 'magnet-dn': return magnetWithName(it);
    case 'path': return nasPath(it);
    case 'path-magnet': return nasPath(it) + '\t' + it.magnet;
    default: return it.magnet;
  }
}

function showsName() {
  return el.copyFormat.value !== 'magnet';
}

const FMT_DESC = {
  magnet: '直接粘贴到下载器（迅雷 / qBittorrent / Aria2 等）即可下载。',
  'magnet-dn': '磁力已写入规范名，下载器任务名会显示为下方样式（注意：磁力改不了单集真实文件名，建议配合下方整理脚本）。',
  path: '仅复制目标相对路径，用于核对目录结构。',
  'path-magnet': '每行「目标路径 ⇥ 磁力」两列，配合 organize.py 把下载好的文件归位到极影视目录。',
};

// Show a one-line description plus a live example of the current format.
function updateFmtHint() {
  const sample = items.find((it) => it.checked) || currentVisibleItems()[0] || items[0];
  let html = escapeHtml(FMT_DESC[el.copyFormat.value] || '');
  if (sample) {
    const line = formatLine(sample).replace(/\t/g, '  ⇥  ');
    const shown = line.length > 120 ? line.slice(0, 120) + '…' : line;
    html += `<span class="eg">示例：${escapeHtml(shown)}</span>`;
  }
  el.fmtHint.innerHTML = html;
}

// --- Rendering ---
function renderFansubs() {
  const groups = countBy(items, (it) => it.fansub);
  el.fansubChips.innerHTML = '';
  for (const [name, count] of groups) {
    const chip = document.createElement('div');
    chip.className = 'chip' + (activeFansubs.has(name) ? ' on' : '');
    chip.innerHTML = `${escapeHtml(name)}<span class="count">${count}</span>`;
    chip.addEventListener('click', () => {
      if (activeFansubs.has(name)) activeFansubs.delete(name);
      else activeFansubs.add(name);
      chip.classList.toggle('on', activeFansubs.has(name));
      renderEpisodes();
      renderList();
      updateFooter();
    });
    el.fansubChips.appendChild(chip);
  }
}

function setAllFansubs(state) {
  activeFansubs.clear();
  if (state) items.forEach((it) => activeFansubs.add(it.fansub));
  renderFansubs();
  renderEpisodes();
  renderList();
  updateFooter();
}

function renderEpisodes() {
  const visible = items.filter((it) => activeFansubs.has(it.fansub));
  const order = [];
  const seen = new Set();
  visible
    .slice()
    .sort((a, b) => a.epSort - b.epSort)
    .forEach((it) => { if (!seen.has(it.epLabel)) { seen.add(it.epLabel); order.push(it.epLabel); } });

  el.episodeChips.innerHTML = '';
  order.forEach((ep) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.ep = ep;
    chip.textContent = ep;
    // Click toggles one episode; press-and-drag across chips selects a range.
    chip.addEventListener('mousedown', (e) => { e.preventDefault(); dragStart(ep); });
    chip.addEventListener('mouseenter', (e) => {
      if (!drag.active) return;
      if (e.buttons & 1) dragOver(ep); // primary button still held
      else dragEnd();                  // released outside the popup
    });
    el.episodeChips.appendChild(chip);
  });
  refreshEpisodeChips();
}

// --- episode drag-select ---
const drag = { active: false, value: false, seen: new Set() };

function epRows(ep) {
  return currentVisibleItems().filter((it) => it.epLabel === ep);
}

function dragStart(ep) {
  const rows = epRows(ep);
  const allOn = rows.length > 0 && rows.every((it) => it.checked);
  drag.active = true;
  drag.value = !allOn; // start on a fully-selected chip => drag deselects
  drag.seen = new Set();
  dragOver(ep);
}

function dragOver(ep) {
  if (drag.seen.has(ep)) return;
  drag.seen.add(ep);
  epRows(ep).forEach((it) => (it.checked = drag.value));
  refreshEpisodeChips();
  updateFooter();
}

function dragEnd() {
  if (!drag.active) return;
  drag.active = false;
  renderList(); // sync the resource-list checkboxes once at the end
}

function refreshEpisodeChips() {
  const visible = currentVisibleItems();
  el.episodeChips.querySelectorAll('.chip').forEach((chip) => {
    const ep = chip.dataset.ep;
    const rows = visible.filter((it) => it.epLabel === ep);
    const on = rows.filter((it) => it.checked).length;
    chip.classList.toggle('on', rows.length > 0 && on === rows.length);
    chip.classList.toggle('partial', on > 0 && on < rows.length);
  });
}

function currentVisibleItems() {
  const kw = el.keyword.value.trim().toLowerCase();
  return items.filter(
    (it) => activeFansubs.has(it.fansub) && (!kw || it.title.toLowerCase().includes(kw))
  );
}

function renderList() {
  updateFmtHint();
  const visible = currentVisibleItems().sort(
    (a, b) => a.epSort - b.epSort || a.fansub.localeCompare(b.fansub)
  );
  el.list.innerHTML = '';

  if (!visible.length) {
    const d = document.createElement('div');
    d.className = 'group-head';
    d.textContent = '没有匹配的资源';
    el.list.appendChild(d);
    return;
  }

  const byFansub = new Map();
  visible.forEach((it) => {
    if (!byFansub.has(it.fansub)) byFansub.set(it.fansub, []);
    byFansub.get(it.fansub).push(it);
  });

  const withName = showsName();
  for (const [fansub, rows] of byFansub) {
    const head = document.createElement('div');
    head.className = 'group-head';
    head.textContent = `${fansub} · ${rows.length}`;
    el.list.appendChild(head);

    rows.forEach((it) => {
      const row = document.createElement('label');
      row.className = 'row';
      row.innerHTML = `
        <input type="checkbox" ${it.checked ? 'checked' : ''} />
        <span class="ep">${escapeHtml(it.epLabel)}</span>
        <span class="meta">
          <span class="rtitle">${escapeHtml(it.title)}</span>
          <span class="rsub">${formatSize(it.res.size)} · ${formatDate(it.res.createdAt)}</span>
          ${withName ? `<span class="rname">→ ${escapeHtml(nasPath(it))}</span>` : ''}
        </span>`;
      const cb = row.querySelector('input');
      cb.addEventListener('change', () => {
        it.checked = cb.checked;
        refreshEpisodeChips();
        updateFooter();
      });
      el.list.appendChild(row);
    });
  }
}

function setAllVisible(state) {
  currentVisibleItems().forEach((it) => (it.checked = state));
  renderList();
  refreshEpisodeChips();
  updateFooter();
}

function updateFooter() {
  updateFmtHint();
  const n = items.filter((it) => it.checked).length;
  el.copyBtn.textContent = `复制选中磁力 (${n})`;
  el.copyBtn.disabled = n === 0;
  el.copyBtn.classList.remove('done');
  if (copyResetTimer) { clearTimeout(copyResetTimer); copyResetTimer = null; }
}

async function copySelected() {
  const chosen = items.filter((it) => it.checked);
  if (!chosen.length) return;
  chosen.sort((a, b) => a.epSort - b.epSort || a.fansub.localeCompare(b.fansub));
  const text = chosen.map(formatLine).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    el.copyBtn.textContent = `已复制 ${chosen.length} 条 ✓`;
    el.copyBtn.classList.add('done');
    copyResetTimer = setTimeout(updateFooter, 1800);
  } catch (e) {
    el.copyBtn.textContent = '复制失败，请重试';
  }
}

// --- helpers ---
function countBy(arr, keyFn) {
  const m = new Map();
  arr.forEach((x) => { const k = keyFn(x); m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function formatSize(kb) {
  if (!kb) return '';
  const mb = kb / 1024;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(0) + ' MB';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function showEmpty(msg) {
  el.status.textContent = '';
  el.empty.textContent = msg;
  el.empty.hidden = false;
  el.main.hidden = true;
  el.footer.hidden = true;
}
