
// ---------- 画布尺寸 ----------
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// ---------- 渲染 ----------
function pxPerMs() { return S.scrollPx / beatMs(); }

function laneFromX(x) { return clamp(Math.floor(x / (W / 4)), 0, 3); }

function draw() {
  const t = songTime();
  const ppm = pxPerMs();
  const judgeY = H * JUDGE_Y;
  const laneW = W / 4;

  // 背景
  ctx2d.fillStyle = '#08080c';
  ctx2d.fillRect(0, 0, W, H);

  // 判定线以下区域（更暗）
  ctx2d.fillStyle = '#0d0d14';
  ctx2d.fillRect(0, judgeY, W, H - judgeY);

  // 四列
  for (let i = 0; i < 4; i++) {
    const x = i * laneW;
    const g = ctx2d.createLinearGradient(0, 0, 0, judgeY);
    const base = DIRCOL[i];
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, hexA(base, 0.030));
    g.addColorStop(1, hexA(base, 0.085));
    ctx2d.fillStyle = g;
    ctx2d.fillRect(x, 0, laneW, judgeY);

    // 敲击闪光
    if (S.hitFlash[i] > 0.01) {
      const f = S.hitFlash[i];
      ctx2d.fillStyle = hexA(base, 0.22 * f);
      ctx2d.fillRect(x, 0, laneW, judgeY);
      ctx2d.fillStyle = hexA(base, 0.5 * f);
      ctx2d.fillRect(x, judgeY - 3, laneW, 3 + (H - judgeY) * 0.35 * f);
    }

    // 分隔线
    ctx2d.fillStyle = 'rgba(255,255,255,0.045)';
    ctx2d.fillRect(x + laneW - 1, 0, 1, H);
  }

  // ---- 拍线 / 小节线 ----
  const bm = beatMs();
  const tTop = t + judgeY / ppm;
  const tBot = t - (H - judgeY) / ppm;

  ctx2d.save();
  const firstBeat = Math.floor(tBot / bm);
  const lastBeat = Math.ceil(tTop / bm);
  for (let b = firstBeat; b <= lastBeat; b++) {
    const y = judgeY - (b * bm - t) * ppm;
    if (y < -2 || y > H + 2) continue;
    const isBar = (b % 4 === 0);
    const dist = Math.abs(y - judgeY) / (judgeY || 1);
    const alpha = isBar ? 0.30 : 0.13;
    ctx2d.fillStyle = `rgba(255,255,255,${alpha * clamp(1 - dist * 0.35, 0.12, 1)})`;
    ctx2d.fillRect(0, y, W, isBar ? 2 : 1);
    if (isBar) {
      ctx2d.fillStyle = 'rgba(255,204,51,0.5)';
      ctx2d.fillRect(0, y, 3.5, 1 + 1);
    }
  }
  ctx2d.restore();

  // ---- 音符 ----
  // 可见区间 [tBot - 一点余量, tTop]
  const notes = S.notes;
  const lo = lowerBound(notes, tBot - 1);
  const hi = lowerBound(notes, tTop + 1);
  for (let i = lo; i < hi; i++) {
    const n = notes[i];
    const x = n.dir * laneW;
    const w = laneW * 0.82;
    const ox = x + (laneW - w) / 2;
    const y = judgeY - (n.t - t) * ppm;
    const col = DIRCOL[n.dir];
    const isPlayer = n.side === 0;

    // 尾巴
    if (n.len > 1) {
      const yEnd = judgeY - (n.t + n.len - t) * ppm;
      const top = Math.min(y, yEnd);
      const hh = Math.abs(yEnd - y);
      ctx2d.fillStyle = hexA(col, 0.30);
      roundRect(ox + w * 0.30, top, w * 0.40, hh, w * 0.20);
      ctx2d.fill();
      ctx2d.fillStyle = hexA(col, 0.55);
      roundRect(ox + w * 0.42, top, w * 0.16, hh, w * 0.08);
      ctx2d.fill();
    }

    // 头
    const hW = w, hH = laneW * 0.30;
    const alpha = isPlayer ? 1 : 0.55;
    ctx2d.globalAlpha = alpha;
    // 外发光
    ctx2d.shadowColor = col;
    ctx2d.shadowBlur = isPlayer ? 14 : 6;
    ctx2d.fillStyle = col;
    roundRect(ox, y - hH / 2, hW, hH, hH * 0.32);
    ctx2d.fill();
    ctx2d.shadowBlur = 0;
    // 内高光
    ctx2d.fillStyle = 'rgba(255,255,255,0.30)';
    roundRect(ox + hW * 0.10, y - hH * 0.34, hW * 0.80, hH * 0.22, hH * 0.11);
    ctx2d.fill();
    // 对手音符加斜纹
    if (!isPlayer) {
      ctx2d.globalAlpha = 0.45;
      ctx2d.strokeStyle = '#000';
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      for (let k = -hH; k < hW; k += 7) {
        ctx2d.moveTo(ox + k, y + hH / 2);
        ctx2d.lineTo(ox + k + hH, y - hH / 2);
      }
      ctx2d.save();
      roundRect(ox, y - hH / 2, hW, hH, hH * 0.32);
      ctx2d.clip();
      ctx2d.stroke();
      ctx2d.restore();
    }
    ctx2d.globalAlpha = 1;
  }

  // ---- 判定线 ----
  const pulse = S.beatPulse;
  ctx2d.fillStyle = `rgba(255,255,255,${0.55 + pulse * 0.45})`;
  ctx2d.fillRect(0, judgeY - 2, W, 4);
  if (pulse > 0.01) {
    ctx2d.fillStyle = `rgba(255,255,255,${0.10 * pulse})`;
    ctx2d.fillRect(0, judgeY - 26 * pulse, W, 52 * pulse);
  }

  // ---- 判定线下的方向字 ----
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const cx = i * laneW + laneW / 2;
    ctx2d.fillStyle = hexA(DIRCOL[i], 0.30 + S.hitFlash[i] * 0.6);
    ctx2d.font = `700 ${Math.round(laneW * 0.28)}px -apple-system,Roboto,sans-serif`;
    ctx2d.fillText(DIRNAME[i], cx, judgeY + (H - judgeY) * 0.36);
  }

  if (!S.buffer) {
    ctx2d.fillStyle = 'rgba(8,8,12,0.82)';
    ctx2d.fillRect(0, 0, W, H);
  }
}

function lowerBound(arr, t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m + 1; else hi = m; }
  return lo;
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx2d.beginPath();
  ctx2d.moveTo(x + r, y);
  ctx2d.arcTo(x + w, y, x + w, y + h, r);
  ctx2d.arcTo(x + w, y + h, x, y + h, r);
  ctx2d.arcTo(x, y + h, x, y, r);
  ctx2d.arcTo(x, y, x + w, y, r);
  ctx2d.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 主循环 ----------
let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min(now - lastFrame, 100);
  lastFrame = now;

  // 判定线脉冲 & 敲击衰减
  for (let i = 0; i < 4; i++) S.hitFlash[i] = Math.max(0, S.hitFlash[i] - dt / 150);
  S.beatPulse = Math.max(0, S.beatPulse - dt / 220);

  const t = songTime();
  const bi = Math.floor(t / beatMs());
  if (bi !== S.lastBeatIdx) {
    if (bi > S.lastBeatIdx || bi < S.lastBeatIdx - 2) S.beatPulse = 1;
    S.lastBeatIdx = bi;
    if (S.metronome && S.playing) {
      clickSound(S.actx.currentTime + 0.005, bi % 4 === 0);
    }
  }

  // 自动滚到结尾
  if (S.playing && t >= S.duration - 10) { pause(); S.startPos = S.duration; }

  draw();
  updateHUD();
  requestAnimationFrame(loop);
}

function updateHUD() {
  const t = clamp(songTime(), 0, S.duration || 1);
  elTime.textContent = `${fmtTime(t)} / ${fmtTime(S.duration)}`;
  elBeat.textContent = S.buffer ? beatLabel(t) : '—';
  const p = S.duration ? clamp(t / S.duration, 0, 1) : 0;
  elSeekFill.style.width = (p * 100) + '%';
  elSeekHead.style.left = (p * 100) + '%';
  elPlay.textContent = S.playing ? '⏸' : '▶';
}
