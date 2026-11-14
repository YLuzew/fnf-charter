
// ---------- 编辑历史 ----------
const UNDO_LIMIT = 80;
let gestureBefore = null;

function snapshot() { return JSON.stringify(S.notes); }
function beginGesture() { if (gestureBefore === null) gestureBefore = snapshot(); }
function endGesture() {
  if (gestureBefore === null) return;
  if (gestureBefore !== snapshot()) {
    S.undo.push(gestureBefore);
    if (S.undo.length > UNDO_LIMIT) S.undo.shift();
    S.redo.length = 0;
  }
  gestureBefore = null;
}
function undo() {
  if (!S.undo.length) { toast('没得撤了'); return; }
  S.redo.push(snapshot());
  S.notes = JSON.parse(S.undo.pop());
  sortNotes();
  toast('撤销');
}
function redo() {
  if (!S.redo.length) { toast('没得重做了'); return; }
  S.undo.push(snapshot());
  S.notes = JSON.parse(S.redo.pop());
  sortNotes();
  toast('重做');
}
function sortNotes() { S.notes.sort((a, b) => a.t - b.t || a.dir - b.dir); }

function clearAll() {
  if (!S.notes.length) { toast('本来就是空的'); return; }
  beginGesture();
  S.notes = [];
  endGesture();
  toast('清空了，能撤销');
}

// ---------- 输入 ----------
function addNoteAt(rawT, dir) {
  if (!S.buffer) return null;
  if (rawT < -5 || rawT > S.duration + 5) return null;
  const t = snapTime(rawT);
  // 保护：同一方向同一时刻已有音符就跳过
  const eps = S.snap ? stepMs() * 0.5 : 1;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.dir === dir && Math.abs(n.t - t) < eps) return null;
  }
  const note = { t, dir, len: 0, side: S.writeSide, _tmp: true };
  // 插到合适位置（保持有序）
  const idx = lowerBound(S.notes, t);
  S.notes.splice(idx, 0, note);
  S.hitFlash[dir] = 1;
  return note;
}

function eraseAt(rawT, dir) {
  const tol = Math.max(stepMs() * 0.6, 40);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.dir !== dir) continue;
    const d = Math.abs(n.t - rawT);
    if (d < tol && d < bestD) { bestD = d; best = i; }
  }
  if (best >= 0) {
    S.hitFlash[dir] = 1;
    S.notes.splice(best, 1);
    return true;
  }
  return false;
}

function pickLane(e) {
  const r = cv.getBoundingClientRect();
  return laneFromX(e.clientX - r.left);
}

cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}

  const dir = pickLane(e);
  const raw = tapTime();

  // 校准模式：不需要载入音频，用的是合成"哒"声
  if (S.calibMode) {
    if (S.actx) S.calibMode.taps.push({ t: S.actx.currentTime, dir });
    S.hitFlash[dir] = 1;
    return;
  }

  if (!S.buffer) return;

  beginGesture();

  if (S.erase) {
    const hit = eraseAt(raw, dir);
    S.active.set(e.pointerId, { dir, rawStart: raw, note: null, erased: hit });
    if (!hit) S.hitFlash[dir] = 1;
    return;
  }

  if (raw < -20) return;
  const note = addNoteAt(raw, dir);
  S.active.set(e.pointerId, { dir, rawStart: raw, note });
  if (!note) S.hitFlash[dir] = 1;
}, { passive: false });

cv.addEventListener('pointermove', (e) => {
  const a = S.active.get(e.pointerId);
  if (!a || !a.note) return;
  const raw = tapTime();
  const dur = raw - a.rawStart;
  if (dur > stepMs() * 0.7) {
    a.note.len = Math.max(0, snapTime(a.rawStart + dur) - a.note.t);
  }
}, { passive: false });

function pointerUp(e) {
  const a = S.active.get(e.pointerId);
  if (!a) return;
  S.active.delete(e.pointerId);

  if (S.calibMode) return;

  if (a.note) {
    const raw = tapTime();
    const dur = raw - a.rawStart;
    if (dur > stepMs() * 0.7) {
      const end = snapTime(a.rawStart + dur);
      a.note.len = Math.max(0, end - a.note.t);
    }
    delete a.note._tmp;
    if (a.note.len > 0 && a.note.len < stepMs()) a.note.len = 0;
  }
  if (S.active.size === 0) endGesture();
}
cv.addEventListener('pointerup', pointerUp, { passive: false });
cv.addEventListener('pointercancel', pointerUp, { passive: false });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// 桌面键盘
const keyHeld = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
  if ((e.code === 'KeyZ') && (e.ctrlKey || e.metaKey || true)) {
    // 允许直接 Z，也允许 Ctrl+Z
    if (e.shiftKey) redo(); else undo();
    e.preventDefault(); return;
  }
  if (e.code === 'KeyE') { e.preventDefault(); setErase(!S.erase); return; }
  const d = KEYMAP[e.code];
  if (d !== undefined && !keyHeld.has(e.code)) {
    e.preventDefault();
    keyHeld.add(e.code);
    if (!S.buffer) return;
    const raw = tapTime();
    beginGesture();
    if (S.erase) eraseAt(raw, d); else addNoteAt(raw, d);
  }
});
window.addEventListener('keyup', (e) => {
  if (keyHeld.has(e.code)) {
    keyHeld.delete(e.code);
    if (keyHeld.size === 0) endGesture();
  }
});

// ---------- 进度条 ----------
let seeking = false;
function seekAt(clientX) {
  const r = elSeek.getBoundingClientRect();
  const p = clamp((clientX - r.left) / r.width, 0, 1);
  const pos = p * S.duration;
  if (S.playing) playFrom(pos); else { S.startPos = pos; updateHUD(); }
}
elSeek.addEventListener('pointerdown', (e) => {
  if (!S.buffer) return;
  e.preventDefault();
  seeking = true;
  elSeek.setPointerCapture(e.pointerId);
  seekAt(e.clientX);
});
elSeek.addEventListener('pointermove', (e) => { if (seeking) seekAt(e.clientX); });
elSeek.addEventListener('pointerup', () => { seeking = false; });
elSeek.addEventListener('pointercancel', () => { seeking = false; });
