// 从 pinyin-data 生成 mandarin.js 里的声调表（每字一个字符：声调 * 5 + 口型）。
// 用法：node gen-tones.mjs   （同目录没有 pinyin-data.txt 时会自动下载）
// 数据源：https://github.com/mozillazg/pinyin-data （MIT）
import {readFileSync, writeFileSync, existsSync} from 'node:fs';

const url = 'https://raw.githubusercontent.com/mozillazg/pinyin-data/master/pinyin.txt';
const file = new URL('./pinyin-data.txt', import.meta.url);
if (!existsSync(file)) {
  console.log('下载 pinyin-data …');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败：${res.status}`);
  writeFileSync(file, await res.text());
}

// 带调号元音 → [声调, 基本元音]
const MARKS = {};
'āáǎà,ēéěè,īíǐì,ōóǒò,ūúǔù,ǖǘǚǜ'.split(',').forEach((g) => {
  const base = 'aeiouü'['a e i o u ü'.split(' ').indexOf(g[0].normalize('NFD')[0])] ?? g[0];
  [...g].forEach((c, k) => { MARKS[c] = [k + 1, base]; });
});
MARKS['ḿ'] = [2, 'u']; MARKS['ê'] = [5, 'e'];

// 口型分四格：a→0，i→1，u/ü/o→2，e→3（o 没有合适的共振峰，并进圆唇那格）
const VCLASS = {a: 0, i: 1, u: 2, 'ü': 2, o: 2, e: 3};

// 不带调号时找主元音：a、o、e 优先，iu/ui 取后者，剩下谁在用谁
function mainVowel(py) {
  for (const c of 'aoe') if (py.includes(c)) return c;
  if (py.includes('iu')) return 'u';
  if (py.includes('ui')) return 'i';
  for (const c of py) if ('iuü'.includes(c)) return c;
  return null;
}

const text = readFileSync(file, 'utf8');
const N = 0xa000 - 0x4e00;
const cells = new Uint8Array(N); // 0 = 没查到
let hit = 0;
for (const line of text.split('\n')) {
  const m = line.match(/^U\+([0-9A-F]+):\s*([^\s#]+)/);
  if (!m) continue;
  const cp = parseInt(m[1], 16) - 0x4e00;
  if (cp < 0 || cp >= N) continue;
  const py = m[2].split(',')[0]; // 多音字取第一个（最常用）读音
  let tone = 5, vowel = null;
  for (const c of py) if (MARKS[c]) { [tone, vowel] = MARKS[c]; break; }
  if (!vowel) { vowel = mainVowel(py.normalize('NFD').replace(/[^a-zü]/g, '')) ?? 'e'; tone = 5; }
  if (vowel === 'o') vowel = 'u';
  if (!(vowel in VCLASS)) vowel = 'e';
  cells[cp] = tone * 5 + VCLASS[vowel];
  hit++;
}

const CODE = '0123456789abcdefghijklmnopqrst';
const data = [...cells].map((v) => CODE[v]).join('');
const js = new URL('./mandarin.js', import.meta.url);
const src = readFileSync(js, 'utf8');
const out = src.replace(/\/\* tone-data:begin \*\/[\s\S]*?\/\* tone-data:end \*\//,
  () => `/* tone-data:begin */\nexport const TONE_DATA = "${data}";\n/* tone-data:end */`);
if (out === src) throw new Error('mandarin.js 里没找到 tone-data 标记');
writeFileSync(js, out);
console.log(`已生成声调表：${hit} 个字，${(data.length / 1024).toFixed(1)} KB`);
