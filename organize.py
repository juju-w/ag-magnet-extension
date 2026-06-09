#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将下载好的动漫文件整理成「极影视 / Emby / Jellyfin / Kodi」规范目录：

    剧名 (年)/Season 04/剧名 - S04E09.mkv
    剧名 (年)/Specials/剧名 - <原标题>.mkv     # OP/ED/特典

解析逻辑与浏览器扩展一致：自动识别季号、自动推断长篇番的绝对集号偏移
（如 `09(81)` → 偏移 72 → 相对集 09），不同字幕组的 81 / 01 / 09(81) 统一归并。

同名的 .nfo / 字幕(.ass/.srt/.sup) / 封面(.jpg/.png) 会一起改名跟随视频，
符合极影视「NFO 及封面需与视频同名、同目录」的要求。

用法示例：
    python3 organize.py ~/Downloads/史莱姆S4 ~/NAS/动漫 \\
        --name "关于我转生变成史莱姆这档事" --year 2026 --season 4

不加 --season / --offset 时会自动从文件名推断。先用 --dry-run 预览。
"""

import argparse
import os
import re
import shutil
import sys

VIDEO_EXTS = {'.mkv', '.mp4', '.ts', '.flv', '.avi', '.mov', '.wmv', '.m2ts', '.rmvb'}
# 跟随视频一起改名的附属文件
SIDECAR_EXTS = {'.nfo', '.ass', '.srt', '.ssa', '.sub', '.sup', '.vtt',
                '.jpg', '.jpeg', '.png'}

CN_NUM = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
          '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}

ILLEGAL = re.compile(r'[\\/:*?"<>|\r\n\t]')


def sanitize(s):
    return re.sub(r'\s+', ' ', ILLEGAL.sub(' ', s)).strip()


def pad(n):
    return f'{int(n):02d}' if float(n).is_integer() else str(n)


def detect_season(title):
    m = re.search(r'第\s*([一二三四五六七八九十\d]+)\s*季', title)
    if m:
        v = m.group(1)
        return CN_NUM.get(v, int(v) if v.isdigit() else None)
    m = re.search(r'(\d+)(?:st|nd|rd|th)\s*Season', title, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r'\bS0?(\d{1,2})(?:E\d|\b)', title, re.I)
    if m:
        return int(m.group(1))
    return None


def parse_raw(title):
    """返回 ('paren'|'range'|'single'|'none', a, b)，与扩展一致。"""
    m = re.search(r'(\d{1,3})\s*\(\s*(\d{1,3})\s*\)', title)
    if m:
        return ('paren', int(m.group(1)), int(m.group(2)))
    m = re.search(r'-\s*(\d{1,3})\s*-\s*(\d{1,3})(?=\s|\[|\(|话|集|END|Fin|$)', title)
    if m:
        return ('range', int(m.group(1)), int(m.group(2)))
    m = re.search(r'第\s*(\d{1,3})\s*[话話集]', title)
    if m:
        return ('single', int(m.group(1)), None)
    m = re.search(r'S\d{1,2}E(\d{1,3})', title, re.I)
    if m:
        return ('single', int(m.group(1)), None)
    m = re.search(r'-\s*(\d{1,3}(?:\.\d)?)(?:v\d)?(?=\s|\[|\(|$)', title)
    if m:
        return ('single', float(m.group(1)), None)
    m = re.search(r'\[(\d{1,3})(?:v\d)?\]', title)
    if m:
        return ('single', int(m.group(1)), None)
    return ('none', None, None)


def to_relative(n, offset):
    n = float(n)
    return n - offset if n > offset else n


def episode_label(raw, offset):
    kind, a, b = raw
    if kind == 'paren':
        return ('ep', f'E{pad(a)}')
    if kind == 'single':
        return ('ep', f'E{pad(to_relative(a, offset))}')
    if kind == 'range':
        return ('ep', f'E{pad(to_relative(a, offset))}-E{pad(to_relative(b, offset))}')
    return ('special', None)


def infer(files):
    """从文件名集合自动推断 season 与 offset。"""
    season_votes, offset_votes = {}, {}
    for f in files:
        s = detect_season(f)
        if s:
            season_votes[s] = season_votes.get(s, 0) + 1
        raw = parse_raw(f)
        if raw[0] == 'paren':
            off = raw[2] - raw[1]
            if off > 0:
                offset_votes[off] = offset_votes.get(off, 0) + 1
    top = lambda d: max(d, key=d.get) if d else None
    return top(season_votes), (top(offset_votes) or 0)


def gather_videos(src):
    out = []
    for root, _, names in os.walk(src):
        for n in names:
            if os.path.splitext(n)[1].lower() in VIDEO_EXTS:
                out.append(os.path.join(root, n))
    return sorted(out)


def find_sidecars(video_path):
    """同目录下、与视频同前缀的附属文件（字幕含语言后缀如 .sc.ass）。"""
    folder = os.path.dirname(video_path)
    stem = os.path.splitext(os.path.basename(video_path))[0]
    result = []
    for n in os.listdir(folder):
        full = os.path.join(folder, n)
        if full == video_path or not os.path.isfile(full):
            continue
        base, ext = os.path.splitext(n)
        if ext.lower() in SIDECAR_EXTS and (base == stem or base.startswith(stem + '.')):
            suffix = n[len(stem):]  # 保留 ".sc.ass" / ".nfo" / ".jpg"
            result.append((full, suffix))
    return result


def place(src_path, dst_path, mode, dry):
    if os.path.exists(dst_path):
        return 'skip(已存在)'
    if dry:
        return 'plan'
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    try:
        if mode == 'move':
            shutil.move(src_path, dst_path)
        elif mode == 'copy':
            shutil.copy2(src_path, dst_path)
        elif mode == 'symlink':
            os.symlink(os.path.abspath(src_path), dst_path)
        else:  # hardlink，跨分区自动回退为复制
            try:
                os.link(src_path, dst_path)
            except OSError:
                shutil.copy2(src_path, dst_path)
        return 'ok'
    except Exception as e:
        return f'error: {e}'


def main():
    ap = argparse.ArgumentParser(
        description='整理动漫为极影视/Emby 规范目录',
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument('src', help='下载文件所在目录')
    ap.add_argument('dst', help='媒体库根目录（剧名文件夹会建在此下）')
    ap.add_argument('--name', help='剧名（默认取源目录名）')
    ap.add_argument('--year', type=int, help='年份，提升匹配准确率')
    ap.add_argument('--season', type=int, help='季号（默认自动识别）')
    ap.add_argument('--offset', type=int, help='绝对集号偏移（默认自动推断）')
    ap.add_argument('--mode', choices=['hardlink', 'copy', 'move', 'symlink'],
                    default='hardlink', help='默认 hardlink：不占额外空间且保留原文件做种')
    ap.add_argument('--dry-run', action='store_true', help='只预览不动文件')
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        sys.exit(f'源目录不存在：{args.src}')

    videos = gather_videos(args.src)
    if not videos:
        sys.exit('源目录下没有找到视频文件')

    names = [os.path.basename(v) for v in videos]
    auto_season, auto_offset = infer(names)
    show = sanitize(args.name or os.path.basename(os.path.abspath(args.src)))
    offset = args.offset if args.offset is not None else auto_offset
    default_season = args.season or auto_season or 1
    folder = f'{show} ({args.year})' if args.year else show

    print(f'剧名: {show}   年份: {args.year or "-"}   '
          f'默认季: {default_season}   偏移: {offset}   模式: {args.mode}'
          f'{"   [DRY-RUN]" if args.dry_run else ""}')
    print(f'输出: {os.path.join(args.dst, folder)}\n')

    stats = {}
    unresolved = []
    for v in videos:
        title = os.path.basename(v)
        ext = os.path.splitext(title)[1].lower()
        raw = parse_raw(title)
        # 每个文件优先用自身标题里的季号，否则用默认季
        season = detect_season(title) or default_season
        kind, label = episode_label(raw, offset)

        if kind == 'special':
            season_dir = 'Specials'
            base = sanitize(f'{show} - {os.path.splitext(title)[0]}')[:150]
            unresolved.append(title)
        else:
            season_dir = f'Season {season:02d}'
            base = f'{show} - S{season:02d}{label}'

        dst_dir = os.path.join(args.dst, folder, season_dir)
        dst_video = os.path.join(dst_dir, base + ext)
        status = place(v, dst_video, args.mode, args.dry_run)
        stats[status] = stats.get(status, 0) + 1
        print(f'[{status:>10}] {title}\n             -> {folder}/{season_dir}/{base}{ext}')

        for sc_path, suffix in find_sidecars(v):
            dst_sc = os.path.join(dst_dir, base + suffix)
            st = place(sc_path, dst_sc, args.mode, args.dry_run)
            print(f'             + {os.path.basename(sc_path)} -> {base}{suffix}  [{st}]')

    print('\n汇总:', '  '.join(f'{k}={v}' for k, v in sorted(stats.items())))
    if unresolved:
        print(f'\n⚠ 未能识别为正片（已放入 Specials，请人工确认）：')
        for u in unresolved:
            print('   -', u)
    print('\n提示：极影视需要每个文件夹「一夹一片」，NFO/封面与视频同名。'
          '\n刮削后若集数仍错，可在 极影视→电视剧→操作→修正剧集列表 手动校正。')


if __name__ == '__main__':
    main()
