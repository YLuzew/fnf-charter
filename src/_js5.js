
// =========================================================================
//  UI 绑定
// =========================================================================
S.gameSpeed = 2.0;

// --- 打开音频 ---
$('pickBtn').onclick = () => $('file').click();
$('file').onchange = async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try { await loadAudio(f); toast('载入好了，按 ▶ 开始'); }
  catch (err) { console.error(err); }
  e.target.value = '';
};
// 拖放
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) { try { await loadAudio(f); } catch (err) {} }
});

// --- 播放 / 导航 ---
$('playBtn').onclick = () => { ensureCtx(); if (S.actx.state === 'suspended') S.actx.resume(); togglePlay(); };
$('undoBtn').onclick = undo;
$('redoBtn').onclick = redo;
$('clearBtn').onclick = () => {
  if (!S.notes.length) return toast('本来就是空的');
  if (confirm(`清空 ${S.notes.length} 个音符？（能撤销）`)) clearAll();
};

// --- 底栏开关 ---
$('metBtn').onclick = (e) => { S.metronome = !S.metronome; e.currentTarget.classList.toggle('on', S.metronome); };
$('snapBtn').onclick = (e) => { S.snap = !S.snap; e.currentTarget.classList.toggle('on', S.snap); updateSnapUI(); };
$('sideBtn').onclick = (e) => {
  S.writeSide = S.writeSide === 0 ? 1 : 0;
  e.currentTarget.textContent = S.writeSide === 0 ? '我' : '对手';
  e.currentTarget.classList.toggle('on', S.writeSide === 1);
  toast(S.writeSide === 0 ? '现在写：玩家轨' : '现在写：对手轨（导出时自动换色）');
};
function setErase(v) {
  S.erase = v;
  const b = $('eraseBtn');
  if (b) b.classList.toggle('on', v);
  toast(v ? '橡皮：点音符删掉它' : '回到写谱');
}
const eraseBtnEl = $('eraseBtn');
if (eraseBtnEl) eraseBtnEl.onclick = () => setErase(!S.erase);
function updateSnapUI() {
  const b = $('snapBtn');
  b.classList.toggle('on', S.snap);
  b.textContent = S.snap ? '🧲' : '🪶';
}

// --- 抽屉 ---
function openPanel(v) {
  S.panelOpen = v;
  elPanel.classList.toggle('show', v);
}
$('menuBtn').onclick = () => openPanel(!S.panelOpen);
$('closePanel').onclick = () => openPanel(false);

// --- 参数输入 ---
function bindText(id, key) {
  const el = $(id);
  el.value = S.meta[key];
  el.oninput = () => { S.meta[key] = el.value; };
}
bindText('fSong', 'song');
bindText('fDiff', 'diff');
bindText('fArtist', 'artist');
bindText('fCharter', 'charter');
bindText('fP1', 'p1');
bindText('fP2', 'p2');
bindText('fP3', 'p3');
bindText('fStage', 'stage');

const fBpm = $('fBpm');
fBpm.oninput = () => { const v = parseFloat(fBpm.value); if (v >= 20 && v <= 400) S.bpm = v; };
fBpm.onchange = () => { const v = clamp(parseFloat(fBpm.value) || 150, 20, 400); S.bpm = v; fBpm.value = v; };

const fScroll = $('fScroll');
fScroll.oninput = () => { S.scrollPx = +fScroll.value; $('scrollVal').textContent = S.scrollPx; };

$('subdivSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  S.subdiv = +b.dataset.v;
  [...$('subdivSeg').children].forEach(x => x.classList.toggle('on', x === b));
});

const fOffset = $('fOffset');
function setOffset(ms) {
  S.userOffsetMs = Math.round(ms);
  fOffset.value = S.userOffsetMs;
}
fOffset.oninput = () => { S.userOffsetMs = parseFloat(fOffset.value) || 0; };
$('offMinus5').onclick = () => setOffset(S.userOffsetMs - 5);
$('offMinus1').onclick = () => setOffset(S.userOffsetMs - 1);
$('offPlus1').onclick = () => setOffset(S.userOffsetMs + 1);
$('offPlus5').onclick = () => setOffset(S.userOffsetMs + 5);

const fSpeed = $('fSpeed');
if (fSpeed) {
  fSpeed.value = S.gameSpeed;
  fSpeed.oninput = () => { const v = parseFloat(fSpeed.value); if (v > 0.1 && v < 10) S.gameSpeed = v; };
}

// --- 整体平移 ---
document.querySelectorAll('[data-shift]').forEach(btn => {
  btn.onclick = () => {
    const ms = +btn.dataset.shift;
    if (!S.notes.length) return toast('还没有音符');
    beginGesture();
    for (const n of S.notes) n.t = Math.max(0, n.t + ms);
    sortNotes();
    endGesture();
    toast(`全部音符 ${ms > 0 ? '+' : ''}${ms}ms`);
  };
});

// --- 自动校准 ---
$('calibBtn').onclick = async () => {
  if (S.calibMode) return;
  ensureCtx();
  if (S.actx.state === 'suspended') await S.actx.resume();
  const BPM = 120, bm = 60000 / BPM, LEAD = 1.4;
  const startAt = S.actx.currentTime + LEAD;
  const clicks = [];
  const mode = { clicks, taps: [] };
  S.calibMode = mode;
  $('calibBtn').textContent = '跟着"哒"声敲…';
  for (let i = 0; i < 8; i++) {
    const when = startAt + i * (bm / 1000);
    clicks.push(when);
    clickSound(when, i % 4 === 0);
  }
  const total = (LEAD + 8 * (bm / 1000) + 0.7) * 1000;
  setTimeout(() => {
    S.calibMode = null;
    $('calibBtn').textContent = '自动校准（跟着鼓点敲 8 下）';
    if (mode.taps.length < 4) return toast(`只敲了 ${mode.taps.length} 下，再来一次`);

    const diffs = [];
    for (const tap of mode.taps) {
      let best = null, bd = Infinity;
      for (const c of clicks) {
        const d = tap.t - c;
        if (Math.abs(d) < Math.abs(bd)) { bd = d; best = d; }
      }
      if (best !== null && Math.abs(best) < (bm / 1000) * 0.45) diffs.push(best * 1000);
    }
    if (diffs.length < 3) return toast('拍子没对上，再试一次');

    diffs.sort((a, b) => a - b);
    const med = diffs[Math.floor(diffs.length / 2)];
    S.calibMs = Math.round(med);
    S.userOffsetMs = 0;
    fOffset.value = 0;
    toast(`设备延迟 ≈ ${Math.round(med)}ms，已记下`, 2600);
  }, total);
};

// --- 导出 ---
function openModal() {
  const n = S.notes.length;
  const dur = S.duration ? fmtTime(S.duration) : '—';
  $('expSummary').innerHTML = `${n} 个音符 · ${S.bpm} BPM · 1/${S.subdiv * 4} 细分 · 时长 ${dur}` +
    (n ? '' : '<br><b style="color:#ff8098">还没有音符，先敲几个</b>');
  elModal.classList.add('show');
  openPanel(false);
}
$('expBtn').onclick = openModal;
$('closeModal').onclick = () => elModal.classList.remove('show');
elModal.addEventListener('click', (e) => { if (e.target === elModal) elModal.classList.remove('show'); });

$('expPsych').onclick = () => {
  const id = songId(), diff = S.meta.diff || 'normal';
  downloadJson(`${id}.json`, buildPsych());
  toast('已下载 Psych 谱面');
  elModal.classList.remove('show');
};

$('expCne').onclick = () => {
  const id = songId(), diff = S.meta.diff || 'normal';
  const files = [
    { name: `songs/${id}/charts/${diff}.json`, text: JSON.stringify(buildCneChart(), null, 2) },
    { name: `songs/${id}/meta.json`, text: JSON.stringify(buildCneMeta(), null, 2) },
    { name: '放法.txt', text:
`Codename Engine — ${S.meta.song}
把 songs/${id}/ 整个目录丢进：

  CodenameEngine/mods/<你的模组>/data/songs/${id}/

结构应当是：
  songs/${id}/meta.json
  songs/${id}/charts/${diff}.json
  songs/${id}/Inst.ogg        ← 音频（自己放，重命名为 Inst）
  songs/${id}/Voices.ogg      ← 人声（没有就省）

注意：CNE 运行时不吃 V-Slice 谱，必须用这个原生格式。` },
  ];
  download(`${id}-cne.zip`, makeZip(files), files);
  toast('已下载 CNE 包（zip）');
  elModal.classList.remove('show');
};

$('expVSlice').onclick = () => {
  const id = songId(), diff = S.meta.diff || 'normal';
  const files = [
    { name: `songs/${id}/metadata.json`, text: JSON.stringify(buildVSliceMeta(), null, 2) },
    { name: `songs/${id}/charts/${diff}.json`, text: JSON.stringify(buildVSliceChart(), null, 2) },
    { name: '放法.txt', text:
`V-Slice（FNF 官方 0.5+）— ${S.meta.song}

把 songs/${id}/ 丢进：

  mods/<你的模组>/songs/${id}/

结构：
  metadata.json
  charts/${diff}.json

注意 V-Slice 的 d：0-3 = 玩家，4-7 = 对手。本工具已按这个规则写好。` },
  ];
  download(`${id}-vslice.zip`, makeZip(files), files);
  toast('已下载 V-Slice 包（zip）');
  elModal.classList.remove('show');
};

// --- 兜底：下载被浏览器拦住时直接看原文、手动复制 ---
function showRaw() {
  if (!LAST_EXPORT || !LAST_EXPORT.files.length) { toast('先导出一个'); return; }
  const old = $('rawWrap');
  if (old) old.remove();
  const files = LAST_EXPORT.files;
  let i = 0;

  const wrap = document.createElement('div');
  wrap.id = 'rawWrap';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:99;background:#0b0b10f2;'
    + 'display:flex;flex-direction:column;padding:10px;gap:8px;font-family:system-ui,sans-serif;';

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;align-items:center;';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;'
    + 'white-space:nowrap;font:11px/1.4 monospace;color:#8fa;';

  const mkBtn = (label, fn) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.style.cssText = 'padding:6px 10px;font-size:12px;min-width:0;flex:none;';
    b.textContent = label;
    b.onclick = fn;
    return b;
  };

  const ta = document.createElement('textarea');
  ta.readOnly = true;
  ta.spellcheck = false;
  ta.style.cssText = 'flex:1;width:100%;box-sizing:border-box;background:#11131a;color:#cfd8e3;'
    + 'border:1px solid #2b2b3a;border-radius:8px;font:12px/1.55 monospace;padding:10px;resize:none;';

  const prev = mkBtn('\u25C0', () => { if (i > 0) { i--; show(); } });
  const next = mkBtn('\u25B6', () => { if (i < files.length - 1) { i++; show(); } });
  const sel  = mkBtn('全选', () => { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); });
  const shut = mkBtn('关', () => wrap.remove());

  function show() {
    nameEl.textContent = files[i].name + '  (' + (i + 1) + '/' + files.length + ')';
    ta.value = files[i].text;
    ta.scrollTop = 0;
    prev.disabled = (i === 0);
    next.disabled = (i === files.length - 1);
  }

  bar.appendChild(prev); bar.appendChild(next); bar.appendChild(nameEl);
  bar.appendChild(sel);  bar.appendChild(shut);
  wrap.appendChild(bar); wrap.appendChild(ta);
  document.body.appendChild(wrap);
  show();
}

(function mountRawBtn() {
  const imp = $('impProject');
  if (!imp || !imp.parentNode) return;
  const b = document.createElement('button');
  b.className = 'btn expBtn ghost';
  b.id = 'expRaw';
  b.innerHTML = '看原文（复制用）<small>下载没反应就点这里，全选后手动复制</small>';
  b.onclick = showRaw;
  imp.parentNode.insertBefore(b, imp);
})();

// --- 工程存档 ---
$('expProject').onclick = () => {
  const proj = {
    app: 'fnf-charter', v: 1,
    meta: S.meta, bpm: S.bpm, subdiv: S.subdiv, scrollPx: S.scrollPx,
    gameSpeed: S.gameSpeed, snap: S.snap,
    calibrMs: S.calibMs, userOffsetMs: S.userOffsetMs,
    notes: cleanNotes(),
    audioName: S.fileName, duration: S.duration,
  };
  downloadJson(`${songId()}.charterproj.json`, proj);
  toast('工程已保存');
};
$('impProject').onclick = () => $('projFile').click();
$('projFile').onchange = async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'fnf-charter') return toast('这不是本工具的工程文件');
    S.meta = Object.assign(S.meta, d.meta || {});
    S.bpm = d.bpm || 150; fBpm.value = S.bpm;
    S.subdiv = d.subdiv || 4;
    [...$('subdivSeg').children].forEach(x => x.classList.toggle('on', +x.dataset.v === S.subdiv));
    S.scrollPx = d.scrollPx || 110; fScroll.value = S.scrollPx; $('scrollVal').textContent = S.scrollPx;
    S.gameSpeed = d.gameSpeed || 2.0; if (fSpeed) fSpeed.value = S.gameSpeed;
    S.snap = d.snap !== false; updateSnapUI();
    S.calibMs = d.calibrMs || 0;
    S.userOffsetMs = d.userOffsetMs || 0; fOffset.value = S.userOffsetMs;
    if (!S.buffer && d.duration) { S.duration = d.duration; }
    S.notes = (d.notes || []).map(n => ({ t: n.t, dir: n.dir, len: n.len || 0, side: n.side || 0 }));
    sortNotes();
    S.undo.length = 0; S.redo.length = 0;
    // 回填表单
    for (const k of ['song','diff','artist','charter','p1','p2','p3','stage']) {
      const el = $({song:'fSong',diff:'fDiff',artist:'fArtist',charter:'fCharter',p1:'fP1',p2:'fP2',p3:'fP3',stage:'fStage'}[k]);
      if (el) el.value = S.meta[k];
    }
    elEmpty.classList.add('hide');
    elTitle.textContent = S.meta.song; elTitle.style.display = 'block';
    elModal.classList.remove('show');
    toast(`工程已载入：${S.notes.length} 个音符` + (S.buffer ? '' : ' · 记得重选音频'), 2600);
  } catch (err) {
    console.error(err);
    toast('这个 json 读不动');
  }
};

// --- 页面隐藏时暂停 ---
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.playing) pause();
});

// --- 屏幕常亮 ---
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}

// =========================================================================
//  启动
// =========================================================================
resize();
updateSnapUI();
$('snapBtn').classList.toggle('on', S.snap);
requestAnimationFrame(loop);

// 提示：首次进入时算一下 outputLatency
window.addEventListener('pointerdown', function once() {
  window.removeEventListener('pointerdown', once);
  try {
    ensureCtx().resume();
    const l = ((S.actx.outputLatency || 0) + (S.actx.baseLatency || 0)) * 1000;
    if (l > 0) console.log('[charter] 设备输出延迟 ≈', Math.round(l), 'ms');
  } catch (e) {}
}, { once: true });
