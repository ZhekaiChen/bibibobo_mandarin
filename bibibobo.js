// bibibobo —— 把一句话变成「哔哔啵啵」的小人说话声。零依赖，浏览器和 Node 都能用。
// 做法只有五步：一条锯齿波 → 两个带通滤波器捏出口型 → 一个字一声（按字算出音高和口型）→ 每个角色一组音阶 → 标点管语气。
// 出自《路墨小剧场》（哈基科技 / Lumoswitch）每期配乐脚本里的同一段代码。MIT 协议。

const TAU = Math.PI * 2;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12); // MIDI 音高 → 频率

/** 五种口型：每种只是两个共振峰频率（Hz）。 */
export const VOWELS = [[800, 1200], [400, 2200], [350, 800], [600, 1700], [300, 2600]];

/** 声线：音阶（MIDI 音高）、共振峰倍率、每个字的时长上限、字头小滑音、默认语速。 */
export const VOICES = {
  fish: {scale: [76, 79, 81, 83, 84], formant: 1.25, maxDur: 0.13, hold: 0.8, chirp: 1.5, fall: 0, gain: 0.16, step: 0.13}, // 大肥鱼：E5 G5 A5 B5 C6
  lumo: {scale: [62, 64, 67, 69], formant: 0.9, maxDur: 0.2, hold: 0.7, chirp: 0, fall: -2, gain: 0.17, step: 0.16}, // 路墨：D4 E4 G4 A4
};

/** 同一个字永远得到同一个数，所以同一个字永远是同一声。 */
export const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 9973, 7);

/** 一个汉字算一声，一串英文或数字算一声。 */
export const syllables = (s) => s.match(/[A-Za-z_\/.0-9]+|[\u4e00-\u9fff]/g) ?? [];

// 抗混叠锯齿波（polyBLEP）
function saw(sampleRate) {
  let ph = 0;
  return (f) => {
    const dt = f / sampleRate;
    ph += dt; if (ph >= 1) ph -= 1;
    let v = 2 * ph - 1;
    if (ph < dt) { const t = ph / dt; v -= t + t - t * t - 1; }
    else if (ph > 1 - dt) { const t = (ph - 1) / dt; v -= t * t + t + t + 1; }
    return v;
  };
}
// 状态变量滤波器，取带通输出
function bandpass(sampleRate) {
  let lp = 0, bp = 0;
  return (x, fc, q) => {
    const f = 2 * Math.sin((Math.PI * Math.min(fc, sampleRate / 6)) / sampleRate);
    const hp = x - lp - bp / q;
    bp += f * hp; lp += f * bp;
    return bp;
  };
}

/** 把一声写进 out：音高 m，时长 dur 秒，glide 是结尾滑多少个半音，vowel 选口型。
 *  contour 是字内音高拐点（MIDI 音高数组，字内线性插值），给了它就按它走，忽略 m 和 glide —— 声调驱动走这条路。
 *  gainScale 把这声调小（括号里的悄悄话用）。 */
export function voice(out, sampleRate, t, m, dur, v, glide = 0, vowel = 0, contour = null, gainScale = 1) {
  const osc = saw(sampleRate), f1 = bandpass(sampleRate), f2 = bandpass(sampleRate);
  const [a, b] = VOWELS[vowel % VOWELS.length];
  const start = Math.floor(t * sampleRate), n = Math.floor(dur * sampleRate);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const x = i / sampleRate, u = x / dur;
    let bend = m + glide * u;
    if (contour) { // 字内多拐点：一声 [5,5] 平，二声 [3,5] 升，四声 [5,1] 降，三声 [2,1,4] 拐弯
      const p = u * (contour.length - 1), k = Math.min(contour.length - 2, Math.floor(p));
      bend = contour[k] + (contour[k + 1] - contour[k]) * (p - k);
    }
    const pitch = mtof(bend + v.chirp * Math.exp(-x * 30)) * (1 + 0.012 * Math.sin(TAU * 6 * x)); // 滑音 + 字头小滑音 + 一点颤音
    const s = osc(pitch);
    const env = Math.min(1, x * 200) * Math.min(1, (dur - x) * 40); // 5 毫秒起音，25 毫秒收尾
    out[start + i] += (f1(s, a * v.formant, 4) + 0.7 * f2(s, b * v.formant, 5)) * env * v.gain * gainScale;
  }
}

/**
 * 把一句话合成为单声道采样（Float32Array，范围 -1..1）。
 * @param {string} text 要说的话。问号结尾尾音上扬；带感叹号整句升高；省略号结尾整句压低、尾音下滑；
 *   ～结尾尾音拖长；句号类标点后停得久，逗号类停得短；括号（）里的内容小声说。
 * @param {{voice?: 'fish'|'lumo'|object, step?: number, sampleRate?: number, gap?: number, melody?: function}} [opts]
 *   voice 声线；step 每个字间隔多少秒；gap 句子之间停多少秒。
 *   melody 可选：给一句的字表和语气，返回每声的 {contour?, m?, glide?, dur?, vowel?, gain?}（mandarin.js 的 mandarin() 就是一个，装上即声调驱动）。
 */
export function synth(text, opts = {}) {
  const v = typeof opts.voice === 'object' ? {...VOICES.fish, ...opts.voice} : VOICES[opts.voice ?? 'fish'];
  const sampleRate = opts.sampleRate ?? 44100, step = opts.step ?? v.step, gap = opts.gap ?? 0.22;
  // 按标点切成句子，每句各自套一条语气规则；切句时记下每个字是否在括号里
  const sentences = (text.match(/[^？?！!。.，,、；;…～~\n]+[？?！!。.，,、；;…～~]*/g) ?? []).map((s) => {
    const tk = [], paren = [];
    let depth = 0, pos = 0;
    for (const m of s.matchAll(/[A-Za-z_\/.0-9]+|[\u4e00-\u9fff]/g)) {
      for (const c of s.slice(pos, m.index)) {
        if (c === '（' || c === '(') depth++;
        if (c === '）' || c === ')') depth = Math.max(0, depth - 1);
      }
      tk.push(m[0]); paren.push(depth > 0); pos = m.index + m[0].length;
    }
    return {text: s, tk, paren};
  }).filter((s) => s.tk.length);
  const tail = (s) => s.replace(/[（）()\s]+$/g, ''); // 句尾括号不影响判断语气
  const after = (s) => /[。！？!?…～~]$/.test(tail(s.text)) ? gap * 1.6 : /[，,、；;:：]$/.test(tail(s.text)) ? gap * 0.5 : gap; // 句号类停久一点，逗号类停短一点
  const total = sentences.reduce((n, s) => n + s.tk.length * step + after(s) + (/[～~]$/.test(tail(s.text)) ? step : 0), 0) + 0.4;
  const out = new Float32Array(Math.ceil(total * sampleRate));
  let t = 0.02;
  for (const {text: s, tk, paren} of sentences) {
    const ask = /[？?]$/.test(tail(s)), shout = /[！!]/.test(tail(s)), sad = /(……|\.\.\.|…)$/.test(tail(s)), wave = /[～~]$/.test(tail(s));
    const ms = opts.melody?.(tk, {ask, shout, sad, wave, paren, voice: v, step}); // 声调驱动时，一句的音高一次算好
    tk.forEach((w, i) => {
      const last = i === tk.length - 1;
      const d = ms?.[i] ?? {};
      const m = d.m ?? (v.scale[hash(w) % v.scale.length] + (shout ? 3 : 0) - (sad ? 3 : 0));
      let dur = d.dur ?? (Math.min(step * v.hold, v.maxDur) + (last && (ask || shout || sad) ? 0.1 : 0));
      if (last && wave && d.dur === undefined) dur = dur * 1.6 + 0.08; // ～：尾音拖长
      const glide = d.glide ?? (last && ask ? 5 : last && sad ? -4 : last ? v.fall : 0);
      voice(out, sampleRate, t + i * step, m, dur, v, glide, d.vowel ?? hash(w), d.contour ?? null, d.gain ?? (paren[i] ? 0.45 : 1));
    });
    t += tk.length * step + after({text: s});
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * 2.4); // 软限幅，响一点也不破音
  return out;
}

/** 把采样打包成 16 位单声道 WAV 文件内容（Uint8Array）。 */
export function toWav(samples, sampleRate = 44100) {
  const buf = new ArrayBuffer(44 + samples.length * 2), d = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); d.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ');
  d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, sampleRate, true); d.setUint32(28, sampleRate * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true);
  str(36, 'data'); d.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) d.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(buf);
}
