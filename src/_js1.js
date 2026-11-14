'use strict';
/* =========================================================================
   敲谱机 — FNF Charter
   音频 → 敲击 → 吸附 → 导出 PE / CNE / V-Slice
   ========================================================================= */

// ---------- 常量 ----------
const DIRNAME = ['左', '下', '上', '右'];
const DIRKEY  = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'];
const DIRCOL  = ['#c24b99', '#00e5ff', '#3dff5a', '#ff3b4e'];
const KEYMAP  = { KeyD:0, KeyF:1, KeyJ:2, KeyK:3 };  // 桌面键盘 DFJK
const JUDGE_Y = 0.72;      // 判定线位置（屏高比例）
const MAX_SAFE_MS = 60 * 60 * 1000;

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx2d = cv.getContext('2d', { alpha: false });
const elEmpty = $('empty'), elPanel = $('panel'), elModal = $('modal'), elToast = $('toast');
const elPlay = $('playBtn'), elSeek = $('seek'), elSeekFill = $('seekFill'), elSeekHead = $('seekHead');
const elTime = $('timeLbl'), elBeat = $('beatLbl'), elTitle = $('title');

// ---------- 状态 ----------
const S = {
  // 音频
  actx: null,
  buffer: null,
  srcNode: null,
  gain: null,
  fileName: '',
  duration: 0,          // ms
  playing: false,
  startCtxTime: 0,      // 播放开始时 actx.currentTime（秒）
  startPos: 0,          // 播放起点（ms）
  rate: 1,

  // 时间
  calibMs: 0,           // 校准出的设备延迟（ms，正值 = 声音比 currentTime 晚这么多）
  userOffsetMs: 0,      // 用户手动微调

  // 谱面设置
  bpm: 150,
  subdiv: 4,
  scrollPx: 110,        // 一拍 = 多少像素
  snap: true,
  writeSide: 0,         // 0 = 玩家(player1)，1 = 对手(player2)
  metronome: false,

  // 元数据
  meta: { song: 'My Song', diff: 'normal', artist: '', charter: '',
          p1: 'bf', p2: 'dad', p3: 'gf', stage: 'stage' },

  // 音符  { t:ms, dir:0..3, len:ms, side:0|1 }
  notes: [],
  undo: [],
  redo: [],

  // 交互
  active: new Map(),    // pointerId -> {dir, rawStart, note}
  erase: false,
  hitFlash: [0, 0, 0, 0],
  beatPulse: 0,
  lastBeatIdx: -1,
  calibMode: null,      // { clicks:[], taps:[] }

  // 视图
  panelOpen: false,
};

// ---------- 工具 ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

function beatMs() { return 60000 / S.bpm; }
function stepMs() { return beatMs() / S.subdiv; }

/** 当前"用户听到的"歌曲位置（ms）。未播放时返回播放头。 */
function songTime() {
  if (!S.playing || !S.actx) return S.startPos;
  return (S.actx.currentTime - S.startCtxTime) * 1000 * S.rate + S.startPos;
}

/** 设备总延迟：音频输出 + 用户微调 */
function latency() {
  let base = S.calibMs;
  if (!base && S.actx) {
    const ol = (S.actx.outputLatency || 0) * 1000;
    const bl = (S.actx.baseLatency || 0) * 1000;
    base = ol + bl;
  }
  return base + S.userOffsetMs;
}

/** 敲击瞬间对应的谱面时间（已消除延迟） */
function tapTime() {
  return songTime() - latency();
}

function snapTime(t) {
  if (!S.snap) return Math.max(0, t);
  const s = stepMs();
  return Math.max(0, Math.round(t / s) * s);
}

function fmtTime(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function beatLabel(ms) {
  const b = ms / beatMs();
  const bar = Math.floor(b / 4) + 1;
  const beat = Math.floor(b % 4) + 1;
  const sub = Math.floor((b % 1) * S.subdiv);
  return `${bar}:${beat}${sub ? '.' + sub : ''}`;
}

let toastTimer = 0;
function toast(msg, ms = 1800) {
  elToast.textContent = msg;
  elToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elToast.classList.remove('show'), ms);
}

// ---------- 音频 ----------
function ensureCtx() {
  if (S.actx) return S.actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  S.actx = new AC({ latencyHint: 'interactive' });
  S.gain = S.actx.createGain();
  S.gain.gain.value = 1;
  S.gain.connect(S.actx.destination);
  return S.actx;
}

async function loadAudio(file) {
  ensureCtx();
  if (S.actx.state === 'suspended') await S.actx.resume();
  const buf = await file.arrayBuffer();
  let decoded;
  try {
    decoded = await S.actx.decodeAudioData(buf);
  } catch (e) {
    toast('这个格式解不开，换 mp3 / ogg / wav 试试');
    throw e;
  }
  S.buffer = decoded;
  S.duration = decoded.duration * 1000;
  S.fileName = file.name || 'audio';
  S.startPos = 0;
  S.playing = false;
  elEmpty.classList.add('hide');
  elTitle.textContent = S.fileName.replace(/\.[^.]+$/, '');
  elTitle.style.display = 'block';
  // 自动用文件名当曲名
  const guess = S.fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (guess && S.meta.song === 'My Song') { S.meta.song = guess; $('fSong').value = guess; }
  updateHUD();
}

function playFrom(posMs) {
  if (!S.buffer) return;
  ensureCtx();
  stopSource();
  posMs = clamp(posMs, 0, Math.max(0, S.duration - 1));
  const when = S.actx.currentTime + 0.03;
  const node = S.actx.createBufferSource();
  node.buffer = S.buffer;
  node.playbackRate.value = S.rate;
  node.connect(S.gain);
  node.start(when, posMs / 1000);
  node.onended = () => { if (S.srcNode === node) { S.playing = false; updateHUD(); } };
  S.srcNode = node;
  S.startCtxTime = when;
  S.startPos = posMs;
  S.playing = true;
  updateHUD();
  if (typeof keepAwake === 'function') keepAwake(true);
}

function stopSource() {
  if (S.srcNode) {
    try { S.srcNode.onended = null; S.srcNode.stop(); } catch (e) {}
    try { S.srcNode.disconnect(); } catch (e) {}
    S.srcNode = null;
  }
}

function pause() {
  if (!S.playing) return;
  S.startPos = songTime();
  S.playing = false;
  stopSource();
  updateHUD();
  if (typeof keepAwake === 'function') keepAwake(false);
}

function togglePlay() {
  if (!S.buffer) { $('file').click(); return; }
  if (S.playing) pause();
  else { ensureCtx(); if (S.actx.state === 'suspended') S.actx.resume(); playFrom(S.startPos >= S.duration - 40 ? 0 : S.startPos); }
}

// 节拍器（用短促的合成音）
function clickSound(when, accent) {
  if (!S.actx) return;
  const o = S.actx.createOscillator();
  const g = S.actx.createGain();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1180;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(accent ? 0.16 : 0.09, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
  o.connect(g); g.connect(S.gain);
  o.start(when); o.stop(when + 0.06);
}
