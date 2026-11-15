# 敲谱机 · FNF Charter

在手机上边放歌边敲屏写 Friday Night Funkin' 谱面。**单文件网页，离线可用**，一次导出 Psych Engine / Codename Engine / V-Slice 三种格式。

写谱一般得坐电脑前对着波形一格格点。这个反过来：手机横过来，屏幕分成四块，歌在放，手指跟着敲——敲下去就是音符。

---

## 打开

把 `charter.html` 拷到手机，用浏览器打开就行（Chrome / Kiwi / Edge 都可以）。不用装、不用联网、不用签名。

也可以丢到任意静态服务器上访问。

> 部分浏览器在 `file://` 下会拦下载，见下面「导不出来怎么办」。

---

## 怎么用

1. **「选一首歌（Inst）」** 导入主音轨（伴奏，mp3 / ogg / wav，浏览器能解的都行）
2. **可选**「加载人声轨（可选，可多条）」—— 一首歌可以加 0~n 条人声轨，播放时与主音轨同步
3. 展开 **☰** 面板填歌曲信息：歌名、作者、谱师、难度、BPM、偏移、流速、游戏速度、舞台
4. 点 **▶** 播放。屏幕**横着分四块 = 左下上右**，手指敲哪块就在哪条轨落一个音符
5. **长按**：按住不放，时长超过 0.7 个分度就算长按，自动写 `sLen`
6. 底栏：

| 控件 | 作用 |
|---|---|
| 🥁 | 节拍器开关 |
| 🧲 | 吸附（1/4、1/8、1/16） |
| 我 / 对手 | 切换写玩家轨还是对手轨 |
| ✕ | 橡皮：点一下删掉附近最近的音符 |
| −5 −1 +1 +5 | 整体平移（毫秒），全部音符一起挪 |
| 110 | 当前 BPM 显示 |

左上角 **↶ ↷** 撤销 / 重做（一次手势算一步），**🗑** 清空。

---

## 校准（重要）

触屏点下去到浏览器收到事件有延迟，不同机型差几十毫秒。不校准的话整首谱会统一偏。

点 **「自动校准（跟着鼓点敲 8 下）」**：节拍器响，你跟着敲 8 下，取差值中位数写进校准值。校准完还能用底栏 ±ms 再微调——录一遍听回放，觉得偏就整体挪。

校准值是「音频输出延迟 + 人的反应延迟」，两个一起补。

---

## 导出

点 **「导出」**（人声轨只在播放时同步播放，**不写进导出的谱面文件**，游戏端各自按自己格式处理人声）：

| 按钮 | 产物 | 放哪 |
|---|---|---|
| **Psych Engine** | `psych.json` | `mods/<你的mod>/data/<歌名>/<难度>.json`（Psych 0.7.x 的 `Song.loadFromJson` 走 `data/<folder>/<song>.json`） |
| **Codename Engine** | zip：`meta.json` + `charts/<难度>.json` | 解压到 `mods/<你的mod>/songs/<歌名>/`，音频放 `songs/<歌名>/song/` |
| **V-Slice** | zip：`metadata.json` + `chart.json` | 你的 V-Slice 数据目录，`<歌名>/metadata.json` + `<歌名>/charts/<难度>.json`（若引擎是平铺两份文件就直接用这两个名字） |

另外两个：

- **保存工程 .json** / **导入工程 .json** —— 中途存盘，下次接着写（含所有音符和歌曲信息）
- **看原文（复制用）** —— 全屏只读文本框，逐个文件翻页

### 导不出来怎么办

`file://` 页面里 Chrome 有时会拦 blob 下载。两个办法：

1. 点 **「看原文（复制用）」**，全选复制，自己粘进文件存
2. 用 HTTP 打开：`python3 -m http.server 8099`，然后手机浏览器访问 `http://127.0.0.1:8099/charter.html`

---

## 三种格式的关键字段

导出器踩过的坑都在这，改代码前先看：

**V-Slice** —— 音符 `d`：`0-3 = 玩家`，`4-7 = 对手`。依据 FNF 官方 `SongNoteDataRaw`：

```haxe
// source/funkin/data/song/SongData.hx
// 0 = left, 1 = down, 2 = up, 3 = right
// `floor(direction / strumlineSize)` specifies which strumline the note is on.
// 0 = player, 1 = opponent, etc.
public function getStrumlineIndex(strumlineSize:Int = 4):Int { return Math.floor(this.data / strumlineSize); }
```

**Codename Engine** —— `ChartMetaData` 里只有 `name` 是必填（= 歌曲文件夹名），其余可选。`color` 写 `"#FFFFFF"` 或整数都吃。

**Psych Engine** —— section 同时写 `sectionBeats`（0.7.x）和 `lengthInSteps`（CodenameEngine 的 legacy 解析器还在读这个），两边都不得罪。`mustHitSection` 由该小节玩家/对手音符数自动决定，再按规则给对手轨的 `data` 加 4。

---

## 源码结构

```
charter.html        成品 —— 所有 JS 内联，一个文件就是整个程序
src/index.html      骨架 + CSS（第 225-226 行是 <script> 占位符）
src/_js1.js         常量 / DOM / 状态 S / 音频引擎
src/_js2.js         canvas 尺寸 / 渲染主循环
src/_js3.js         编辑器：敲击、长按、橡皮、撤销重做、键盘
src/_js4.js         三种格式导出 + 迷你 ZIP（store 模式，自己写 CRC32）
src/_js5.js         UI 绑定 / 自动校准 / 工程存档 / 看原文 / 屏幕常亮
src/build.py        把 5 段 JS 拼进 index.html 的占位符
```

改完源码重新拼装：

```bash
cd src
python3 build.py            # 生成 敲谱机.html
mv 敲谱机.html ../charter.html
```

没装 node 也能跑，纯 Python 标准库。

### 自测（没浏览器也能验）

```bash
node --check <(sed -n '/<script>/,/<\/script>/p' charter.html | sed '1d;$d')
```

更完整的验证思路：抽 DOM/AudioContext 桩，用 `vm.runInThisContext(src + ';globalThis.__X={...}')` 把顶层函数导出来直接调，跑一遍导出器比对 JSON。`getElementById` 桩永远返回非 null，所以 id 拼错测不出来——得另做静态交叉核对。

---

## 已知限制

- 敲音符**没有音效**，只有视觉闪光
- 整首歌只能一个 BPM，不支持变速
- 只有 4K，不支持扩展键
- 长按的音符画成一条尾巴，不区分「拖拽」和「长按」
- 触屏延迟靠校准补偿，机型差异大
- 没有波形图
- **人声轨不写进谱面文件**（仅编辑器里播放同步，导出 PE/CNE/V-Slice 时只写音符与元数据）

---

## License

MIT
