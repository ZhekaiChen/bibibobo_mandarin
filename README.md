# 哔哔啵啵 · 声调版（bibibobo_mandarin）

**在线试玩：<https://zhekaichen.github.io/bibibobo_mandarin/>**

基于 [hakihakii/bibibobo](https://github.com/hakihakii/bibibobo)（哈基科技《路墨小剧场》，MIT）二次开发。
**基本玩法、合成原理、API 说明都请看原仓库的 README**，这里只写这版新增的东西。

## 新增：声调驱动

原版每个字的音高按哈希出（热闹但不是在「念」）。这版可以按真实普通话读音走：

```js
import {synth, toWav} from './bibibobo.js';
import {mandarin} from './mandarin.js';

const samples = synth('我们什么时候走？', {voice: 'lumo', melody: mandarin});
const wav = toWav(samples);
```

命令行加 `--tone`：

```bash
node cli.mjs "今天吃白饭？" out.wav --tone
```

网页版勾选「按真实声调」（默认开）。

具体做的事：

1. **查声调**：内置声调表（每字一个字符，2 万字共 20 KB，数据来自 [pinyin-data](https://github.com/mozillazg/pinyin-data)，MIT），多音字取最常用读音，`PHRASES` 词表修正常见轻声词和多音词（我们、什么、银行、音乐……）。
2. **变调**：三声相连前字变阳平（你好 → ní hǎo）；句中三声读半三声（只降不升）；「一」去声前变阳平、其他前变去声；「不」去声前变阳平；夹在两个相同的字中间读轻声（看一看）。
3. **五度调值转音高**：阴平 55、阳平 35、上声 214、去声 51、轻声随前字定高低。每条声线把自己音阶的最低音当 1 度、最高音当 5 度，字内线性插值。
4. **句调叠加**：全句缓慢下倾；疑问句整体抬高、尾音再抬；感叹整句抬高；省略号压低、尾音下落。
5. **口型跟韵母走**：字的韵母主元音选共振峰口型（a / i / u / e 四格）。

查不到声调的字（英文、数字、生僻字）自动退回原版的哈希声。

## 新增：更多标点语气

- `～` 结尾：尾音拖长
- 句号类标点（`。！？…～`）后停得久，逗号类（`，、；`）停得短
- `（）` 括号里的内容小声说

以上对哈希模式和声调模式都生效。

## 改动说明（给想读代码的人）

- `synth()` 新增可选 `opts.melody`：给一句的字表和语气，返回每声的 `{contour?, m?, glide?, dur?, vowel?, gain?}`；不传则行为和原版完全一致
- `voice()` 支持字内多拐点音高曲线（`contour`）和单声音量（`gainScale`）
- `mandarin.js` 是声调表 + 变调规则 + 旋律函数；`gen-tones.mjs` 重新生成声调表（需 `pinyin-data.txt`，没有会自动下载）
- `index.html` 仍由 `node build.mjs` 生成（现在嵌入 `bibibobo.js` + `mandarin.js` 两个文件）

## 协议

MIT，同原项目。原版权申明保留在 [LICENSE](LICENSE)。
