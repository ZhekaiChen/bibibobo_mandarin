#!/usr/bin/env node
// 用法：node cli.mjs "今天吃白饭？" [输出.wav] [--voice fish|lumo] [--step 0.13]
import {writeFileSync} from 'node:fs';
import {synth, toWav} from './bibibobo.js';

const args = process.argv.slice(2), opt = {}, rest = [];
for (let i = 0; i < args.length; i++) (args[i].startsWith('--') ? (opt[args[i].slice(2)] = args[++i]) : rest.push(args[i]));
const [text, file = 'bibibobo.wav'] = rest;
if (!text) { console.error('用法：node cli.mjs "今天吃白饭？" [输出.wav] [--voice fish|lumo] [--step 0.13]'); process.exit(1); }
const samples = synth(text, {voice: opt.voice ?? 'fish', step: opt.step ? +opt.step : undefined});
writeFileSync(file, toWav(samples));
console.log(`${file}：${(samples.length / 44100).toFixed(2)} 秒`);
