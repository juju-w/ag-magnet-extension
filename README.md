# Anime Garden 磁力批量复制

<p align="center">
  <img src="icons/icon128.png" width="96" alt="icon" />
</p>

<p align="center">
  一个 Chrome 扩展：在 <a href="https://animes.garden">animes.garden</a> 上按<b>字幕组</b>和<b>集数</b>快速批量复制磁力链接，<br/>
  并自动生成 <b>极影视 / Emby / Jellyfin</b> 友好的 <code>SxxEyy</code> 命名与目录。
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="manifest" src="https://img.shields.io/badge/Chrome-MV3-ff6699.svg" />
</p>

<p align="center"><b>简体中文</b> · <a href="README.en.md">English</a></p>

## ✨ 特性

- **按字幕组 / 集数批量勾选**，一键复制全部磁力链接，告别逐条点开
- 直接调用官方 API，覆盖**番剧页 / 搜索页 / 字幕组页 / 发布者页**，一套界面
- **长篇番绝对集号自动归并**：`09(81)`、`- 81`、`- 01` 统一成同一集
- **NAS 友好命名**：自动识别番剧名 / 年 / 季，输出 `剧名 (年)/Season xx/剧名 - SxxEyy`
- 配套 [`organize.py`](organize.py)：把下载好的文件整理成极影视规范目录

## 📸 截图

> 稍后补充。

## 安装（开发者模式加载）

1. 打开 Chrome，地址栏输入 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录 `ag-magnet-extension`
4. 工具栏会出现粉色磁铁图标（建议点击拼图图标把它固定）

## 支持的页面

URL 里的过滤条件会被原样转发给官方接口，因此以下页面都能用同一套界面：

- 番剧详情页 `…/subject/456079`
- 搜索结果页 `…/resources/1?search=…`
- 字幕组页 `…/resources/1?fansub=…`
- 发布者页 `…/resources/1?publisher=…`（以及 `include / keywords / type / after / before` 等）

广搜结果很多时，最多加载前 5000 条，可用筛选缩小范围。

## 使用

1. 打开上述任意页面，点击扩展图标，弹窗自动加载该页资源
2. **字幕组**：顶部芯片切换显示哪些字幕组；右上角「全选 / 取消」可一键切换
3. **集数**：点击某一集，勾选/取消该集所有版本；半选状态表示部分已选。**搜索多季时芯片显示 `S01E09 / S04E09`，不同季不再混淆**
4. **资源列表**：每个资源一行可单独勾选；关键词过滤（如 `Baha`、`简体`、`1080`）区分来源/画质
5. 选好**复制格式**（下方有实时示例提示），点击底部「复制选中磁力」，按集数排序、换行分隔写入剪贴板

## NAS 友好命名

「NAS 命名」区设置**番剧名 / 年 / 季 / 偏移**（均自动识别，可改），选择复制格式：

| 复制格式 | 用途 | 输出示例 |
| --- | --- | --- |
| 纯磁力链 | 直接粘到下载器 | `magnet:?xt=urn:btih:…` |
| 磁力 + 重命名 dn | 下载器任务名变规范名 | `magnet:?xt=…&dn=剧名 - S04E09` |
| 极影视目录路径 | 核对/手动建目录 | `剧名 (2026)/Season 04/剧名 - S04E09` |
| 路径 ⇥ 磁力（两列） | **配合 `organize.py` 自动归位** | `剧名 (2026)/Season 04/剧名 - S04E09 ⇥ magnet:…` |

目录结构遵循极影视 / Emby / Jellyfin / Kodi 规范：`剧名 (年)/Season xx/剧名 - SxxEyy`；
合集为 `SxxE01-E12`，OP/ED 等特典放入 `Specials/`。年份默认取最早资源年份，提升匹配准确率
（极影视推荐 `名称.年份`）。

### 长篇番 / 绝对集号自动归并

像《史莱姆》第四季这种长篇，不同字幕组编号方式不一致：

- ANi / Skymoon：`第四季 - 81`（**绝对集号**，从第 73 集连续计数）
- 沸班亚马：`第四季 - 01`（**季内相对集号**）
- 豌豆字幕组：`[S4][09(81)]`（**同时给**相对 09 和绝对 81）

NAS（Jellyfin/Emby/Plex）按季刮削，需要的是**季内相对集号**——直接写 E81 会被当成第 4 季第 81 集而刮削失败。插件的处理：

- **自动识别季号**：从 `第四季 / 4th Season / S04` 解析，预填「季」。
- **自动推断偏移**：从 `09(81)` 这类括号写法算出 `偏移 = 81 − 9 = 72`，预填「偏移」。
- **统一归并**：`相对集 = 集号 > 偏移 ? 集号 − 偏移 : 集号`。于是 ANi 的 81、沸班亚马的 01、豌豆的 09(81) 全部归并成 **E09**，集数芯片只显示 01–09，复制出来就是 `剧名 - S04E09`。

「季」和「偏移」都可手动修改（偏移填 0 即不转换，适用于普通单季番）。若某资源标题自带季号，会优先用它自己的季。
跨季搜索时，偏移按**每季分别推断**（每季绝对集起点不同）。

> ⚠️ **磁力改名的真实限制**：磁力链的 `dn` 只是「显示名」。单集种子的真实文件名写死在种子元数据里，`dn` 改不了磁盘上的文件名——它影响的是下载客户端里的**任务名 / 部分客户端的文件夹名**。
> 想让 NAS 稳定刮削，推荐用「路径 ⇥ 磁力」两列格式配合下面的 `organize.py`。

## organize.py — 下载后整理成极影视目录

把下载好的文件整理成 `剧名 (年)/Season 04/剧名 - S04E09.ext`，解析逻辑与扩展一致
（自动识别季、自动推断偏移），并按极影视要求让同名 `.nfo` / 字幕 / 封面跟随视频改名。

```bash
# 先 --dry-run 预览，确认无误再去掉
python3 organize.py ~/Downloads/史莱姆S4 ~/NAS/动漫 \
    --name "关于我转生变成史莱姆这档事" --year 2026 --season 4 --dry-run
```

- 不传 `--season / --offset` 会自动推断；`--name` 默认取源目录名。
- `--mode` 默认 `hardlink`（不占额外空间且保留原文件继续做种），另有 `copy / move / symlink`。
- 未能识别为正片的（OP/ED 等）会放入 `Specials/` 并在末尾列出，便于人工确认。
- 极影视刮削后若集数仍有误，可在 **极影视 → 电视剧 → 操作 → 修正剧集列表** 手动校正。

## 工作原理

不爬页面 DOM，而是把当前页 URL 的过滤参数转发给官方接口
`GET https://api.animes.garden/resources?<filters>&pageSize=1000&tracker=true`，
分页直到 `complete`；集数从标题解析，磁力链接自动拼接 tracker 以获得更多 peers。

## 文件

- `manifest.json` — MV3 配置（仅需 `activeTab` 与 `api.animes.garden` 主机权限）
- `popup.html` / `popup.css` / `popup.js` — 弹窗界面与逻辑
- `organize.py` — 下载后整理成极影视/Emby 规范目录的脚本
- `icons/` — 图标（含可编辑的 `icon.svg` 源文件）

## 贡献

欢迎 Issue / PR。集数解析规则集中在 `popup.js` 的 `parseRaw` 与 `organize.py` 的 `parse_raw`，
两者保持一致；新增匹配规则时请同步修改并附上对应的真实标题样例。

## 免责声明

本扩展仅作为 [animes.garden](https://animes.garden) 公开页面的便捷工具，只调用其公开 API 聚合并复制
第三方资源链接，**不托管、不存储任何资源内容**。请遵守当地法律法规，仅用于个人合法用途；
下载内容的版权归原权利人所有。

## 许可证

[MIT](LICENSE) © 2026 juju-w
