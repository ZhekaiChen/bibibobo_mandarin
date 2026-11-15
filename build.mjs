// 把 bibibobo.js 原样嵌进 index.html（去掉 export），让网页不依赖别的文件，双击就能打开。改了 bibibobo.js 之后运行：node build.mjs
import {readFileSync, writeFileSync} from 'node:fs';
const lib = readFileSync(new URL('./bibibobo.js', import.meta.url), 'utf8').replace(/^export /gm, '').trimEnd();
const file = new URL('./index.html', import.meta.url), html = readFileSync(file, 'utf8');
const out = html.replace(/\/\* bibibobo:begin \*\/[\s\S]*?\/\* bibibobo:end \*\//, () => `/* bibibobo:begin */\n${lib}\n  /* bibibobo:end */`);
if (out === html && !html.includes(lib)) throw new Error('index.html 里没找到 bibibobo:begin / bibibobo:end 标记');
writeFileSync(file, out);
console.log('index.html 已更新');
