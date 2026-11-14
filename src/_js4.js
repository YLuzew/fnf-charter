
// =========================================================================
//  导出器
// =========================================================================
const r3 = (x) => Math.round(x * 1000) / 1000;
const songId = () => (S.meta.song || 'song').toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '') || 'song';

function cleanNotes() {
  return S.notes.map(n => ({ t: n.t, dir: n.dir, len: n.len || 0, side: n.side }));
}

// ---- Psych Engine 0.6.x / 0.7.x ----
function buildPsych() {
  const ns = cleanNotes();
  const bm = beatMs();
  const SECTION_BEATS = 4;
  const sectionMs = bm * SECTION_BEATS;
  const lastT = ns.length ? ns[ns.length - 1].t : 0;
  const count = Math.max(1, Math.floor(lastT / sectionMs) + 1);

  const sections = [];
  for (let i = 0; i < count; i++) {
    sections.push({
      sectionNotes: [],
      lengthInSteps: Math.round(SECTION_BEATS * 4),
      sectionBeats: SECTION_BEATS,
      mustHitSection: true,
      gfSection: false,
      bpm: S.bpm,
      changeBPM: false,
      altAnim: false,
    });
  }

  // 先按"这一小节谁的音符多"决定镜头归属
  const tally = sections.map(() => [0, 0]);
  for (const n of ns) {
    const si = clamp(Math.floor(n.t / sectionMs), 0, count - 1);
    tally[si][n.side]++;
  }
  for (let i = 0; i < count; i++) sections[i].mustHitSection = tally[i][0] >= tally[i][1];

  // 再按 mustHitSection 换算 data：0-3 归 mustHit 那方，4-7 归另一方
  for (const n of ns) {
    const si = clamp(Math.floor(n.t / sectionMs), 0, count - 1);
    const sec = sections[si];
    let data = n.dir;
    if (sec.mustHitSection) { if (n.side === 1) data += 4; }
    else { if (n.side === 0) data += 4; }
    sec.sectionNotes.push([r3(n.t), data, r3(n.len), null]);
  }

  return {
    song: {
      song: S.meta.song || 'My Song',
      notes: sections,
      events: [],
      bpm: S.bpm,
      needsVoices: true,
      speed: S.gameSpeed || 2.0,
      player1: S.meta.p1 || 'bf',
      player2: S.meta.p2 || 'dad',
      gfVersion: S.meta.p3 || 'gf',
      stage: S.meta.stage || 'stage',
      arrowSkin: null,
      splashSkin: null,
      disableNoteRGB: false,
      validScore: true,
    },
  };
}

// ---- Codename Engine 原生 ----
function buildCneChart() {
  const ns = cleanNotes();
  const mk = (side) => ns.filter(n => n.side === side)
    .map(n => ({ time: r3(n.t), id: n.dir, type: 0, sLen: r3(n.len) }));
  return {
    codenameChart: true,
    chartVersion: '1.6.0',
    scrollSpeed: S.gameSpeed || 2.0,
    stage: S.meta.stage || 'stage',
    noteTypes: [],
    strumLines: [
      {
        characters: [S.meta.p2 || 'dad'], type: 0, position: 'dad',
        notes: mk(1), visible: true, keyCount: 4,
        strumPos: [0, 0], strumScale: 1, strumSpacing: 1,
        strumLinePos: 0.25, vocalsSuffix: '',
      },
      {
        characters: [S.meta.p1 || 'bf'], type: 1, position: 'boyfriend',
        notes: mk(0), visible: true, keyCount: 4,
        strumPos: [0, 0], strumScale: 1, strumSpacing: 1,
        strumLinePos: 0.75, vocalsSuffix: '',
      },
      {
        characters: [S.meta.p3 || 'gf'], type: 2, position: 'girlfriend',
        notes: [], visible: false, keyCount: 4,
        strumPos: [0, 0], strumScale: 1, strumSpacing: 1,
        vocalsSuffix: '',
      },
    ],
    events: [],
  };
}

function buildCneMeta() {
  // CNE 的 ChartMetaData 里 name 是唯一必填字段（歌曲 ID = 文件夹名），漏了歌单里认不出
  return {
    name: songId(),
    customValues: {},
    color: '#FFFFFF',
    opponentModeAllowed: false,
    icon: S.meta.p2 || 'dad',
    difficulties: [S.meta.diff || 'normal'],
    coopAllowed: false,
    stepsPerBeat: 4,
    displayName: S.meta.song || 'My Song',
    needsVoices: true,
    beatsPerMeasure: 4,
    bpm: S.bpm,
  };
}

// ---- V-Slice (FNF 0.5+) ----
function buildVSliceMeta() {
  return {
    version: '2.2.4',
    songName: S.meta.song || 'My Song',
    artist: S.meta.artist || '',
    charter: S.meta.charter || '',
    offsets: {},
    playData: {
      difficulties: [S.meta.diff || 'normal'],
      characters: {
        player: S.meta.p1 || 'bf',
        girlfriend: S.meta.p3 || 'gf',
        opponent: S.meta.p2 || 'dad',
        opponentVocals: [],
        playerVocals: [],
      },
      stage: S.meta.stage || 'stage',
      noteStyle: 'FNF',
      ratings: {},
      album: null,
      previewEnd: 0,
    },
    generatedBy: 'FNF Charter (敲谱机)',
    timeChanges: [{ t: 0, b: 0, bpm: S.bpm, bt: [4, 4, 4, 4] }],
  };
}

function buildVSliceChart() {
  const ns = cleanNotes();
  // 关键：V-Slice 里 d 的 0-3 是玩家、4-7 是对手（跟 Psych 相反）
  const arr = ns.map(n => {
    const o = { t: r3(n.t), d: n.dir + (n.side === 0 ? 0 : 4) };
    if (n.len > 0) o.l = r3(n.len);
    return o;
  });
  arr.sort((a, b) => a.t - b.t);
  const diff = S.meta.diff || 'normal';
  const ss = {}; ss[diff] = S.gameSpeed || 2.0;
  const notes = {}; notes[diff] = arr;
  return {
    version: '2.0.0',
    scrollSpeed: ss,
    events: [],
    notes,
    generatedBy: 'FNF Charter (敲谱机)',
  };
}

// ---- 迷你 ZIP（store，无压缩）----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const centrals = [];
  let offset = 0;

  for (const f of files) {
    const nameB = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const localOffset = offset;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);       // version needed
    lh.setUint16(6, 0x0800, true);   // UTF-8
    lh.setUint16(8, 0, true);        // store
    lh.setUint16(10, 0, true);       // time
    lh.setUint16(12, 0x21, true);    // date 1980-01-01
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true);
    lh.setUint16(28, 0, true);

    const local = new Uint8Array(30 + nameB.length);
    local.set(new Uint8Array(lh.buffer), 0);
    local.set(nameB, 30);
    parts.push(local, data);
    offset += local.length + data.length;

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameB.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, localOffset, true);

    const cen = new Uint8Array(46 + nameB.length);
    cen.set(new Uint8Array(ch.buffer), 0);
    cen.set(nameB, 46);
    centrals.push(cen);
  }

  const cdSize = centrals.reduce((a, b) => a + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);

  return new Blob([...parts, ...centrals, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}

// ---- 下载 ----
// 最后一次导出的纯文本副本，下载被浏览器拦时的兜底
let LAST_EXPORT = null;

function download(name, blob, files) {
  if (files && files.length) LAST_EXPORT = { root: name, files };
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); if (a.remove) a.remove(); }, 1500);
}

function downloadJson(name, obj, files) {
  const text = JSON.stringify(obj, null, 2);
  download(name, new Blob([text], { type: 'application/json' }), files || [{ name, text }]);
}
