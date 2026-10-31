// render.js — 共用渲染邏輯（K 線 / MACD / RSI / 量價 / 結論卡 / setVal / cls）
// 供 index.html / sell.html / ui.html 共用，改這裡一處即可多端同步。
// 以 IIFE 掛到 window 頂層，各頁沿用原本呼叫方式。
(function (g) {
  "use strict";

function cls(s){ return s>=0.05?"pos":s<=-0.05?"neg":"neu"; }

function setVal(id, v, c, desc){
  const el=document.getElementById(id);
  el.textContent = Number.isFinite(v)?v.toFixed(2):'—';
  el.className='val '+c;
  // 分數值下方放一句白話說明(同框,讓「分數」自己看得到「這是什麼意思」)
  const box=el.closest('.score-box');
  let d=box?box.querySelector('.val-desc'):null;
  if(desc!=null && box){
    if(!d){ d=document.createElement('div'); d.className='val-desc'; d.style.cssText='font-size:11px;color:var(--muted);margin-top:4px;font-weight:400;line-height:1.4'; box.appendChild(d); }
    d.textContent=desc; d.style.display='block';
  } else if(d){ d.style.display='none'; }
}

function drawChart(rows, IND){
  const cv=document.getElementById('chart');
  const dpr=window.devicePixelRatio||1;
  let W=cv.clientWidth||cv.parentElement?.clientWidth||800;
  if(W<=0) W=800;
  const H=300;
  cv.width=W*dpr; cv.height=H*dpr; cv.style.height=H+'px';
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);

  // #3 1年/2年 密集處理：最多顯示近 120 根（折線全範圍，K 線取近 120）
  const MAX=120;
  const showRows = rows.length>MAX ? rows.slice(-MAX) : rows;
  const off = rows.length - showRows.length; // 全域 offset（供 IND 陣列對齊）
  const n=showRows.length, pad={l:44,r:50,t:14,b:24};
  const plotW=W-pad.l-pad.r, plotH=H-pad.t-pad.b;
  let hi=-Infinity,lo=Infinity;
  showRows.forEach(r=>{hi=Math.max(hi,r.high);lo=Math.min(lo,r.low);});
  // #6 止損止盈納入 Y 軸範圍
  const slTp = window._slTp || null;
  if (slTp && slTp.sl != null) { lo = Math.min(lo, slTp.sl); hi = Math.max(hi, slTp.tp1 || 0, slTp.sl); if (slTp.slMid != null) lo = Math.min(lo, slTp.slMid); }
  const y=v=>pad.t+(hi-v)/(hi-lo)*plotH;
  const x=i=>pad.l+i*(plotW/n);

  // 水平網格
  ctx.strokeStyle='#2a3441';ctx.fillStyle='#94a3b8';ctx.font='11px sans-serif';ctx.textAlign='right';
  for(let g=0;g<=4;g++){const v=lo+(hi-lo)*g/4;const yy=y(v);ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(W-pad.r,yy);ctx.stroke();ctx.fillText(v.toFixed(0),pad.l-6,yy+3);}

  // K 線（漲紅跌綠：依「紅多綠空」慣例，上漲用紅、下跌用綠）
  const bw=Math.max(1,plotW/n*0.6);
  showRows.forEach((r,i)=>{
    const up=r.close>=r.open;
    ctx.strokeStyle=ctx.fillStyle=up?'#ef4444':'#22c55e';
    const cx=x(i);
    ctx.beginPath();ctx.moveTo(cx,y(r.high));ctx.lineTo(cx,y(r.low));ctx.stroke();
    const top=y(Math.max(r.open,r.close)),bot=y(Math.min(r.open,r.close));
    ctx.fillRect(cx-bw/2,top,bw,Math.max(1,bot-top));
  });

  // 均線（5日紅、20日黃、60日藍，跟電腦版一致；對齊 offset）
  const smaLine=(arr,color,lw)=>{ctx.strokeStyle=color;ctx.lineWidth=lw||1.2;ctx.beginPath();let started=false;
    showRows.forEach((r,i)=>{const v=arr[off+i];if(v==null)return;const xx=x(i),yy=y(v);if(!started){ctx.moveTo(xx,yy);started=true;}else ctx.lineTo(xx,yy);});ctx.stroke();};
  smaLine(IND.SMA5,'#ef4444',1.2);  // 5日 紅
  smaLine(IND.SMA20,'#f59e0b',1.2); // 20日 黃
  smaLine(IND.SMA60,'#38bdf8',1.2);// 60日 藍
  // #1 均線圖例改色塊（色塊+文字，不重疊、靠右上角）
  ctx.textAlign='left';ctx.font='11px sans-serif';
  const legend=[['5日','#ef4444'],['20日','#f59e0b'],['60日','#38bdf8']];
  let lx=W-pad.r-110;
  legend.forEach(([lb,colr])=>{
    ctx.fillStyle=colr;ctx.fillRect(lx,pad.t+2,10,10);
    ctx.fillStyle='var(--text)';ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text')||'#e2e8f0';
    ctx.fillText(lb,lx+14,pad.t+11);
    lx+=42;
  });

  // 布林通道 BOLL(20, 2)：中線（20日均價）已畫成「20日」黃線，故只補上軌/下軌
  const bollColor = 'rgba(168,85,247,0.85)'; // 紫色
  ctx.strokeStyle = bollColor; ctx.lineWidth = 1; ctx.setLineDash([6,3]);
  ['upper','lower'].forEach(kk => {
    const arr = IND.BOLL ? IND.BOLL[kk] : null;
    if (!arr) return;
    ctx.beginPath(); let started=false;
    showRows.forEach((r,i)=>{
      const v = arr[off+i]; if (v==null) return;
      const xx=x(i), yy=y(v);
      if(!started){ctx.moveTo(xx,yy);started=true;} else ctx.lineTo(xx,yy);
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);
  // 布林通道色塊圖例
  ctx.fillStyle = bollColor; ctx.fillRect(lx, pad.t+2, 10, 10);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text') || '#e2e8f0';
  ctx.fillText('BOLL', lx+14, pad.t+11);
  lx += 52;

  // #6 止損/止盈水平線（短線止損綠虛線、止盈紅實線；中期止損用橘色點線區分）
  if (slTp) {
    if (slTp.sl != null) {
      ctx.strokeStyle='rgba(34,197,94,0.8)';ctx.setLineDash([4,4]);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(pad.l,y(slTp.sl));ctx.lineTo(W-pad.r,y(slTp.sl));ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#22c55e';ctx.font='10px sans-serif';ctx.textAlign='right';
      ctx.fillText('短線止損 '+slTp.sl.toFixed(0),W-pad.r-4,y(slTp.sl)-3);
    }
    if (slTp.tp1 != null) {
      ctx.strokeStyle='rgba(239,68,68,0.8)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(pad.l,y(slTp.tp1));ctx.lineTo(W-pad.r,y(slTp.tp1));ctx.stroke();
      ctx.fillStyle='#ef4444';ctx.font='10px sans-serif';ctx.textAlign='right';
      ctx.fillText('止盈 '+slTp.tp1.toFixed(0),W-pad.r-4,y(slTp.tp1)-3);
    }
    // 中期止損（4×ATR，橘色點線，跟短線區分）
    if (slTp.slMid != null) {
      ctx.strokeStyle='rgba(245,158,11,0.9)';ctx.setLineDash([2,3]);ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(pad.l,y(slTp.slMid));ctx.lineTo(W-pad.r,y(slTp.slMid));ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#f59e0b';ctx.font='10px sans-serif';ctx.textAlign='right';
      ctx.fillText('中期止損 '+slTp.slMid.toFixed(0),W-pad.r-4,y(slTp.slMid)+12);
    }
  }

  // 買賣點三角標記（最近 60 日，對齊 offset）
  const events = window._lastEvents || [];
  const dateToIdx = {};
  showRows.forEach((r,ri)=>{ dateToIdx[r.date]=ri; });
  events.forEach(ev=>{
    const idx = dateToIdx[ev.date];
    if (idx==null) return;
    const cx = x(idx);
    const isBuy = ev.type==='buy';
    const price = isBuy ? (showRows[idx].low) : (showRows[idx].high);
    const ty = y(price) + (isBuy ? 12 : -12);
    ctx.fillStyle = isBuy ? '#ef4444' : '#22c55e';
    ctx.beginPath();
    if (isBuy) { // 買點：K 線下方紅三角朝上
      ctx.moveTo(cx, ty); ctx.lineTo(cx-5, ty+8); ctx.lineTo(cx+5, ty+8);
    } else { // 賣點：K 線上方綠三角朝下
      ctx.moveTo(cx, ty); ctx.lineTo(cx-5, ty-8); ctx.lineTo(cx+5, ty-8);
    }
    ctx.closePath(); ctx.fill();
  });

  // #4 收盤價標記（最後一根 K 線右側）
  const last = showRows[n-1];
  if (last) {
    const ly = y(last.close);
    ctx.fillStyle='#38bdf8';ctx.font='bold 11px sans-serif';ctx.textAlign='left';
    ctx.fillText('收盤 '+last.close.toFixed(0), W-pad.r+2, ly+4);
    ctx.strokeStyle='#38bdf8';ctx.lineWidth=0.5;ctx.setLineDash([2,2]);
    ctx.beginPath();ctx.moveTo(pad.l,ly);ctx.lineTo(W-pad.r,ly);ctx.stroke();ctx.setLineDash([]);
  }

  // X 軸日期刻度（電腦版有：在 K 線區間底部 4~5 個刻度）
  ctx.textAlign='center'; ctx.fillStyle='#94a3b8'; ctx.font='10px sans-serif';
  const step=Math.max(1,Math.floor(n/5));
  for(let i=0;i<n;i+=step){
    const d=showRows[i].date; if(!d) continue;
    const cx=x(i);
    ctx.fillText(d.slice(5), cx, H-8); // MM-DD
  }
}

function drawMACD(rows, IND){
  const cv = document.getElementById('macdChart');
  if (!cv || !IND || !IND.MACD) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || cv.parentElement.clientWidth || 800;
  const cssH = parseInt(window.getComputedStyle(cv).height) || 120;
  const H = cssH;
  if (W <= 0) return;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // #5 對齊 K 線「近 120 根」：折線取近 120 根（不足全取），讓 X 軸日期刻度與 K 線對齊
  const N = Math.min(120, rows.length);
  const start = rows.length - N;
  const line = IND.MACD.line.slice(start), sig = IND.MACD.signal.slice(start);
  const vals = [...line, ...sig].filter(v => v != null);
  let lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
  if (hi === lo) { lo = -1; hi = 1; }
  const pad = { l: 30, r: 50, t: 8, b: 20 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const X = i => pad.l + (i / Math.max(1, N - 1)) * pw;
  const Y = v => pad.t + (hi - v) / (hi - lo) * ph;

  // 零軸
  ctx.strokeStyle = '#3a4a5a'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke();

  // MACD 柱（正綠、負紅）
  for (let i = 0; i < N; i++) {
    const v = line[i] || 0;
    const barW = Math.max(1, pw / N * 0.55);
    ctx.fillStyle = v >= 0 ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)';
    const y0 = Y(0), y1 = Y(v);
    ctx.fillRect(X(i) - barW / 2, Math.min(y0, y1), barW, Math.abs(y1 - y0) || 1);
  }

  // 訊號線（黃）
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.4; ctx.beginPath();
  sig.forEach((v, i) => { if (v != null) i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)); });
  ctx.stroke();

  // MACD 線（藍）
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.4; ctx.beginPath();
  line.forEach((v, i) => { if (v != null) i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v)); });
  ctx.stroke();

  // 圖例＋數值標籤
  ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = '#38bdf8'; ctx.fillText('MACD', pad.l + 4, pad.t + 8);
  ctx.fillStyle = '#f59e0b'; ctx.fillText('訊號', pad.l + 38, pad.t + 8);
  ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
  ctx.fillText(hi.toFixed(1), W - pad.r - 4, Y(hi) + 8);
  ctx.fillText(lo.toFixed(1), W - pad.r - 4, Y(lo) + 4);
}

function drawRSI(rows, IND){
  const cv = document.getElementById('rsiChart');
  if (!cv || !IND || !IND.RSI) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || cv.parentElement.clientWidth || 800;
  const H = parseInt(window.getComputedStyle(cv).height) || 110;
  if (W <= 0) return;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const N = Math.min(120, rows.length);
  const start = rows.length - N;
  const rsi = IND.RSI.slice(start);
  const pad = { l: 30, r: 40, t: 10, b: 20 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const X = i => pad.l + (i / Math.max(1, N - 1)) * pw;
  const Y = v => pad.t + (100 - v) / 100 * ph;

  // 超買區（70-100）淺紅、超賣區（0-30）淺綠
  ctx.fillStyle = 'rgba(239,68,68,0.08)';
  ctx.fillRect(pad.l, Y(100), pw, Y(70) - Y(100));
  ctx.fillStyle = 'rgba(34,197,94,0.08)';
  ctx.fillRect(pad.l, Y(30), pw, Y(0) - Y(30));
  // 70/30 參考線
  ctx.strokeStyle = 'rgba(239,68,68,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.l, Y(70)); ctx.lineTo(W - pad.r, Y(70)); ctx.stroke();
  ctx.strokeStyle = 'rgba(34,197,94,0.45)';
  ctx.beginPath(); ctx.moveTo(pad.l, Y(30)); ctx.lineTo(W - pad.r, Y(30)); ctx.stroke();
  // 50 中線
  ctx.strokeStyle = '#2a3441'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(pad.l, Y(50)); ctx.lineTo(W - pad.r, Y(50)); ctx.stroke();

  // RSI 折線（紫）
  ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.beginPath();
  let started = false;
  rsi.forEach((v, i) => {
    if (v == null) { started = false; return; }
    if (!started) { ctx.moveTo(X(i), Y(v)); started = true; }
    else ctx.lineTo(X(i), Y(v));
  });
  ctx.stroke();

  // 刻度標籤（右側 100/70/50/30/0）
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'right';
  [100, 70, 50, 30, 0].forEach(v => ctx.fillText(v, W - pad.r - 4, Y(v) + 3));
  // 標題
  ctx.textAlign = 'left'; ctx.fillStyle = '#a78bfa';
  ctx.fillText('冷熱指數', pad.l + 4, pad.t + 8);
}

function drawVolChart(rows, IND){
  const cv = document.getElementById('volChart');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || cv.parentElement.clientWidth || 800;
  const H = parseInt(window.getComputedStyle(cv).height) || 160;
  if (W <= 0) return;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  if (!rows || rows.length < 10) {
    ctx.textAlign='center'; ctx.fillStyle='#94a3b8'; ctx.fillText('暫無資料', W/2, H/2);
    return;
  }
  // #2 量比 baseVol 用固定 60 日窗（不足 60 日再用全部可用資料），跟電腦版「60 日均量」精確對齊
  const N = Math.min(60, rows.length);
  const start = rows.length - N;
  const s = rows.slice(start);
  const window60 = rows.slice(-60); // 固定 60 日窗（不足 60 日用全部）
  const baseVol = window60.reduce((a, r) => a + (r.volume || 0), 0) / window60.length;
  const volRatio = s.map(r => (r.volume || 0) / baseVol);
  let hi = Math.max.apply(null, volRatio.concat([1.5]));
  const pad = { l: 40, r: 12, t: 14, b: 22 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const X = i => pad.l + (i / Math.max(1, N - 1)) * pw;
  const Y = v => pad.t + (hi - v) / hi * ph;
  // 水平網格（0、0.5、1.0、1.5、2.0…依 hi 取整）
  ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  const gridSteps = [];
  for (let g = 0; g <= Math.max(1, Math.ceil(hi)); g += 0.5) gridSteps.push(g);
  gridSteps.forEach(v => {
    if (v > hi) return;
    const y = Y(v);
    const isRef = v === 1;
    ctx.strokeStyle = isRef ? '#f59e0b' : '#1e2a3a';
    ctx.lineWidth = isRef ? 1.2 : 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle = isRef ? '#f59e0b' : '#94a3b8';
    ctx.fillText(v.toFixed(1), pad.l - 4, y + 3);
  });
  // 量比柱（紅＝放量、綠＝萎縮）
  const barW = Math.max(1, pw / N * 0.6);
  volRatio.forEach((v, i) => {
    const isUp = v >= 1;
    ctx.fillStyle = isUp ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)';
    const x0 = X(i), y0 = Y(0), y1 = Y(v);
    ctx.fillRect(x0 - barW / 2, Math.min(y0, y1), barW, Math.abs(y1 - y0) || 1);
  });
  // X 軸日期標籤（首、中、尾）
  ctx.textAlign='center'; ctx.fillStyle='#64748b';
  [0, Math.floor(N/2), N-1].forEach(i => {
    const d = s[i].date || '';
    ctx.fillText(d.slice(5), X(i), H - 4);
  });
  // 圖例
  ctx.textAlign='left'; ctx.font='11px sans-serif';
  ctx.fillStyle='#f59e0b'; ctx.fillText('60日均量=1.0', pad.l, pad.t + 2);
  // 資訊行
  const lastRatio = volRatio[volRatio.length - 1];
  const info = document.getElementById('volInfo');
  if (info) {
    const state = lastRatio >= 1.3 ? '放量' : lastRatio <= 0.7 ? '萎縮' : '正常';
    info.innerHTML = '量比 ' + lastRatio.toFixed(2) + '（' + state + '）。<span style="color:var(--muted)">柱＝每日量／60日均量，紅=放量、綠=萎縮，橙線=1.0 基準。</span>';
  }
}

function render(A, rows, t){
  // 五方綜合
  const f=A.final, c=f.combined_score;
  const ft=document.getElementById('finalText');
  ft.className='final-text '+(c>=0.15?'pos':c<=-0.15?'neg':'neu');
  ft.textContent=f.final_advice;
  // 依時段（開盤前/盤中/盤後）的白話行動建議
  const act=document.getElementById('finalAction');
  if(act){
    const ms = (typeof marketSession !== 'undefined') ? marketSession() : StockCore.marketSession();
    const af = (typeof actionForScore !== 'undefined') ? actionForScore(c, ms.code) : StockCore.actionForScore(c, ms.code);
    act.textContent = af;
    act.style.display = 'block';
    // 填入「中期框」的三個固定容器:行動 / 五方分數 / 止損警報
    const maEl = document.getElementById('midAction');
    const mfEl = document.getElementById('midFiveWay');
    const maAlertEl = document.getElementById('midAlert');
    // 中期行動
    if (maEl) {
      if (A && A.mid_action) { maEl.innerHTML = A.mid_action; maEl.style.display = 'block'; }
      else { maEl.innerHTML = '<span style="color:var(--muted)">無特別中期動作</span>'; maEl.style.display = 'block'; }
    }
    // 中期五方分數
    if (mfEl) {
      if (A && A.mid_five_way) {
        const mv = A.mid_five_way;
        const mcls = mv.score >= 0.15 ? 'var(--bull)' : mv.score <= -0.15 ? 'var(--bear)' : 'var(--muted)';
        mfEl.innerHTML = '<span style="font-size:11px;color:var(--muted)">中期五方分數： </span><b style="color:' + mcls + '">' + mv.label + '（' + (mv.score >= 0 ? '+' : '') + mv.score.toFixed(2) + '）</b>';
        mfEl.style.display = 'block';
      } else { mfEl.style.display = 'none'; }
    }
    // 中期止損警報
    if (maAlertEl) {
      const alert = A && A.mid && A.mid.mid_bear_alert;
      if (alert) {
        const strong = alert.level === 'strong';
        maAlertEl.style.background = strong ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)';
        maAlertEl.style.border = '1px solid ' + (strong ? 'var(--bear)' : 'var(--yellow)');
        maAlertEl.style.color = 'var(--text)';
        maAlertEl.innerHTML = alert.text;
        maAlertEl.style.display = 'block';
      } else { maAlertEl.style.display = 'none'; }
    }
  }
  // 時段標記（顯示在綜合評語旁）
  const ms = (typeof marketSession !== 'undefined') ? marketSession() : StockCore.marketSession();
  const ss=document.getElementById('sessionTag');
  if(ss){
    // hhmm 是 4 位數字(如 930),轉成 9:30 顯示
    const hhmm = ms.hhmm != null ? ms.hhmm : null;
    const hhmmStr = hhmm != null ? Math.floor(hhmm/100) + ':' + String(hhmm%100).padStart(2,'0') : '';
    ss.textContent = hhmmStr ? (ms.label + ' ' + hhmmStr) : ms.label;
    ss.style.display = 'inline-block';
  }
  // 資料時效提示（#2：盤中使用時提醒收盤靜態資料）
  const df = document.getElementById('dataFreshness');
  if (df && ms) {
    const lastDate = rows[rows.length-1] ? rows[rows.length-1].date : '';
    if (ms.code === 'am' || ms.code === 'pm') {
      df.textContent = '📅 盤中：數據依收盤（' + lastDate + '）估算，非即時';
    } else if (ms.code === 'after') {
      df.textContent = '📅 盤後：收盤定案資料（' + lastDate + '）';
    } else if (ms.code === 'pre' || ms.code === 'lunch') {
      df.textContent = '📅 開盤前：昨日收盤（' + lastDate + '）';
    } else {
      df.textContent = '📅 休市：最近收盤（' + lastDate + '）';
    }
    df.style.display = 'inline-block';
  }

  // #9 分享資料（供「分享結果」按鈕複製）
  const indShare = A.indicators;
  const lastRow2 = rows[rows.length-1];
  const atrV = indShare && indShare.ATR14 ? indShare.ATR14[indShare.ATR14.length-1] : null;
  const slVal = (lastRow2 && atrV!=null) ? lastRow2.close - 1.5*atrV : null;
  const tpVal = (lastRow2 && atrV!=null) ? lastRow2.close + atrV : null;
  window._shareData = {
    ticker: t, name: WNAMES[t] || '',
    advice: f.final_advice,
    tech: f.score_breakdown['技術面']!=null?f.score_breakdown['技術面'].toFixed(2):'—',
    fund: f.score_breakdown['籌碼面']!=null?f.score_breakdown['籌碼面'].toFixed(2):'—',
    news: f.score_breakdown['消息面']!=null?f.score_breakdown['消息面'].toFixed(2):'—',
    intra: f.score_breakdown['盤面']!=null?f.score_breakdown['盤面'].toFixed(2):'—',
    taiex: f.score_breakdown['大盤']!=null?f.score_breakdown['大盤'].toFixed(2):'—',
    combined: c.toFixed(2),
          sl: slVal!=null?slVal.toFixed(0):'—', tp: tpVal!=null?tpVal.toFixed(0):'—',
      // 中期：止損警報 + 40/60 日偏多勝率 + 中期行動
      midAlert: (A && A.mid && A.mid.mid_bear_alert) ? A.mid.mid_bear_alert : null,
      mid40: (A && A.hist_mid40 && A.hist_mid40.up_rate!=null) ? A.hist_mid40.up_rate : null,
      mid60: (A && A.hist_mid60 && A.hist_mid60.up_rate!=null) ? A.hist_mid60.up_rate : null,
      midAction: (A && A.mid_action) ? A.mid_action : null,
    };
  const shareBtn=document.getElementById('shareBtn');
  if(shareBtn) shareBtn.style.display='';
  const portBtn=document.getElementById('portBtn');
  if(portBtn) portBtn.style.display='';
  document.getElementById('resultTitle').style.display='block';

  // 技術面摘要（看多/看空理由數 + 各面 note）
  const comp = A.composite;
  const sigs = A.signals || [];
  const buyCount = sigs.filter(s=>s.state==='buy').length;
  const sellCount = sigs.filter(s=>s.state==='sell').length;
  const adviceSummaryEl = document.getElementById('adviceSummary');
  if (adviceSummaryEl) {
    let sumHtml = `技術面訊號：${comp.advice||''}（看多訊號 ${buyCount} 個、看空訊號 ${sellCount} 個）。`;
    if (A.fund_flow && A.fund_flow.ok) {
      sumHtml += `<br><span style="color:var(--accent)">💰 籌碼面：${A.fund_flow.label}（當日全場法人方向分數 ${(A.fund_flow.score||0).toFixed(2)}）。${A.fund_flow.on_list ? '本股當榜。' : '本股未進當日榜單。'}</span>`;
    }
    if (A.news && A.news.count > 0) {
      sumHtml += `<br><span style="color:var(--accent)">📰 消息面：近 ${A.news.count} 則新聞，${A.news.label}（分數 ${(A.news.score||0).toFixed(2)}）。${A.news.advice||''}</span>`;
    }
    if (A.intraday && A.intraday.advice) {
      sumHtml += `<br><span style="color:var(--accent)">⏰ 盤面：${A.intraday.advice}</span>`;
    }
    if (A.taiex && A.taiex.advice) {
      sumHtml += `<br><span style="color:var(--accent)">🏛 大盤：${A.taiex.advice}</span>`;
    }
    adviceSummaryEl.innerHTML = sumHtml;
  }

  // 歷史 5 日勝率（白話，讓使用者知道「該股訊號可信度」）
  const histEl = document.getElementById('hist5');
  if (histEl && A.hist5) {
    const h5 = A.hist5;
    const up = h5.up_rate != null ? h5.up_rate + '%' : '—';
    const dn = h5.down_rate != null ? h5.down_rate + '%' : '—';
    const upN = h5.up_n || 0, dnN = h5.down_n || 0;
    const m40 = A.hist_mid40, m60 = A.hist_mid60;
    const mUp40 = m40 && m40.up_rate != null ? m40.up_rate + '%' : '—';
    const mDn40 = m40 && m40.down_rate != null ? m40.down_rate + '%' : '—';
    const mUp60 = m60 && m60.up_rate != null ? m60.up_rate + '%' : '—';
    const mDn60 = m60 && m60.down_rate != null ? m60.down_rate + '%' : '—';
    const midSig = A.mid;
    const midScore = midSig ? midSig.mid_score : null;
    const filterNote = midSig && midSig.mid_filter ? midSig.mid_filter : '';
    const midChip = midScore == null ? '' :
      (midScore >= 0.2 ? '<span style="background:var(--bull);color:#0f1419;font-weight:700;padding:2px 8px;border-radius:10px;font-size:11px">中期偏多 ' + Math.round(midScore*100) + '</span>'
      : midScore <= -0.2 ? '<span style="background:var(--bear);color:#0f1419;font-weight:700;padding:2px 8px;border-radius:10px;font-size:11px">中期偏空 ' + Math.round(Math.abs(midScore)*100) + '</span>'
      : '<span style="background:var(--card2);color:var(--muted);font-weight:700;padding:2px 8px;border-radius:10px;font-size:11px;border:1px solid var(--border)">中期中性</span>');
    // 中期 40/60 日勝率長條視覺化
    const midWinBar = function(label, upRate, dnRate){
      const any = upRate != null || dnRate != null;
      const upW = upRate != null ? Math.min(100, Math.max(0, upRate)) : null;
      const dnW = dnRate != null ? Math.min(100, Math.max(0, dnRate)) : null;
      let html = '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">' +
        '<span style="color:var(--text);font-weight:700">' + label + '</span>' +
        '<span style="color:var(--muted);font-size:10px">' + (any ? ('看多 ' + (upRate != null ? upRate + '%' : '—') + ' / 看空 ' + (dnRate != null ? dnRate + '%' : '—')) : '資料不足') + '</span>' +
        '</div>';
      if (!any) {
        html += '<div style="height:12px;background:var(--card2);border:1px dashed var(--border);border-radius:5px"></div>';
      } else {
        html += '<div style="height:14px;background:var(--card2);border:1px solid var(--border);border-radius:5px;position:relative;overflow:hidden">' +
        '<div style="position:absolute;left:0;top:0;bottom:0;width:' + (dnW != null ? dnW : 0) + '%;background:var(--bear);opacity:.85"></div>' +
        '<div style="position:absolute;right:0;top:0;bottom:0;width:' + (upW != null ? upW : 0) + '%;background:var(--bull);opacity:.85"></div>' +
        '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border);z-index:2"></div>' +
        (upRate != null ? '<div style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:700;color:#0f1419;z-index:3">' + upRate + '%↑</div>' : '') +
        (dnRate != null ? '<div style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:700;color:#0f1419;z-index:3">' + dnRate + '%↓</div>' : '') +
        '</div>';
      }
      html += '</div>';
      return html;
    };
    const m40w = A.hist_mid40, m60w = A.hist_mid60;
    const midWinHtml =
      '<div style="font-weight:700;color:var(--text);margin:6px 0 4px;font-size:12px">📊 中期勝率長條（訊號觸發後是否照做）</div>' +
      midWinBar('持有 40 日', m40w ? m40w.up_rate : null, m40w ? m40w.down_rate : null) +
      midWinBar('持有 60 日', m60w ? m60w.up_rate : null, m60w ? m60w.down_rate : null) +
      '<div style="font-size:10px;color:var(--muted);margin-top:4px">右側紅＝看多勝率、左側綠＝看空勝率，中線 50%。勝率越高該方向越可信。</div>';
    histEl.innerHTML =
      '<div style="font-weight:700;color:var(--text);margin-bottom:4px">📊 歷史訊號準確度（訊號觸發後是否照做）</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:3px">短線視角（5 日）：</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' +
        '<span style="background:var(--bull);color:#0f1419;font-weight:700;padding:2px 8px;border-radius:10px;font-size:11px">偏多 5 日漲 ' + up + '（' + upN + ' 次）</span>' +
        '<span style="background:var(--bear);color:#0f1419;font-weight:700;padding:2px 8px;border-radius:10px;font-size:11px">偏空 5 日跌 ' + dn + '（' + dnN + ' 次）</span>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:3px">中期視角（2–3 個月持有）：</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' +
        midChip +
      '</div>' +
             midWinHtml +
(filterNote ? '<div style="font-size:11px;color:var(--muted);margin-bottom:4px">🔍 趨勢濾網：' + filterNote + '</div>' : '') +
      (midSig && midSig.mid_bear_alert ? '<div style="font-size:12px;line-height:1.6;margin-bottom:6px;padding:8px 10px;border-radius:8px;background:' + (midSig.mid_bear_alert.level === 'strong' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)') + ';border:1px solid ' + (midSig.mid_bear_alert.level === 'strong' ? 'var(--bear)' : 'var(--yellow)') + ';color:var(--text)">' + midSig.mid_bear_alert.text + '</div>' : '') +
      '<div style="color:var(--text)">' + h5.overall_label + '。</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">白話：偏多訊號勝率越超過 50%、「看到偏多就買」贏面越大；中期視角是給拿 2–3 個月的，40/60 日勝率越高、持有越可放心。</div>';
    histEl.style.display = 'block';
    document.getElementById('histSec').style.display = 'block';
  }

  // 五方分數明細（progress bar 長條：紅多、綠空）
  document.getElementById('finalBd').innerHTML =
    '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">五方分數長條（紅＝看多、綠＝看空，中間為中性）：</div>' +
    (function(){
      const keys = Object.keys(f.score_breakdown).filter(k => k !== "綜合");
      let html = '<div style="display:flex;flex-direction:column;gap:7px">';
      keys.forEach(k => {
        const v = f.score_breakdown[k];
        const w = (f.weights && f.weights[k] != null) ? f.weights[k] : null;
        // 長條：0 在中間，正往右（紅）、負往左（綠）
        const posPct = Math.abs(v) * 50; // 0.5 → 50%
        const isPos = v >= 0;
        const wLabel = w != null ? ` <span style="font-size:10px;color:var(--muted)">權${Math.round(w*100)}%</span>` : '';
        html += '<div>' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:var(--text)">' + k + wLabel + '</span>' +
            '<span style="color:var(--muted)">' + v.toFixed(2) + '</span></div>' +
          '<div style="height:8px;background:var(--card2);border-radius:4px;overflow:hidden;position:relative">' +
            '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border)"></div>' +
            (isPos
              ? '<div style="position:absolute;left:50%;top:0;bottom:0;width:' + posPct + '%;background:var(--bull);border-radius:0 4px 4px 0"></div>'
              : '<div style="position:absolute;right:50%;top:0;bottom:0;width:' + posPct + '%;background:var(--bear);border-radius:4px 0 0 4px"></div>') +
          '</div></div>';
      });
      // 綜合分數長條
      const cv = f.score_breakdown["綜合"] != null ? f.score_breakdown["綜合"] : 0;
      const cp = Math.abs(cv) * 50;
      const cIsPos = cv >= 0;
      html += '<div style="margin-top:6px;padding-top:8px;border-top:1px solid var(--border)">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
          '<span style="color:var(--text);font-weight:700">綜合分數</span>' +
          '<span style="font-weight:700;color:' + (cIsPos ? 'var(--bull)' : 'var(--bear)') + '">' + cv.toFixed(2) + '</span></div>' +
        '<div style="height:10px;background:var(--card2);border-radius:5px;overflow:hidden;position:relative">' +
          '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border)"></div>' +
          (cIsPos
            ? '<div style="position:absolute;left:50%;top:0;bottom:0;width:' + cp + '%;background:var(--bull);border-radius:0 5px 5px 0"></div>'
            : '<div style="position:absolute;right:50%;top:0;bottom:0;width:' + cp + '%;background:var(--bear);border-radius:5px 0 0 5px"></div>') +
        '</div></div>';
      html += '</div>';
      return html;
    })();

  // 綜合分數拆解（關連到下方各面向：貢獻值 ＝ 分數 × 權重，點一下跳到對應區塊）
  const compBreakEl = document.getElementById('compBreak');
  if (compBreakEl && f.score_breakdown) {
    const sb = f.score_breakdown;
    const wt = f.weights || {};
    const rowsDef = [
      { key: '技術面', sec: 'secTech', desc: '均線/MACD/RSI/KDJ/布林/BIAS/量比 8 條訊號', icon: '🎯' },
      { key: '籌碼面', sec: 'secFund', desc: '外資三大法人淨買賣方向與榜單', icon: '💰' },
      { key: '消息面', sec: 'secNews', desc: '近 7 天相關新聞情緒', icon: '📰' },
      { key: '盤面', sec: 'secIntra', desc: '當天漲跌、量比、開盤型態', icon: '⏰' },
      { key: '大盤', sec: 'secTaiex', desc: '加權指數當天與 20 日方向', icon: '🏛' },
    ];
    const combined = sb['綜合'] != null ? sb['綜合'] : 0;
    let totalContrib = 0;
    let html = '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px">🔗 綜合分數怎麼算的（貢獻值 ＝ 分數 × 權重，點一下跳到對應區塊）</div>';
    html += '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">綜合 ' + combined.toFixed(2) + ' ＝ 各面向貢獻值加總。點各面向可跳轉下方對應分析。</div>';
    html += '<div style="display:flex;flex-direction:column;gap:5px">';
    rowsDef.forEach(r => {
      const v = sb[r.key] != null ? sb[r.key] : null;
      const w = wt[r.key] != null ? wt[r.key] : 0;
      if (v == null) return;
      const contrib = v * w;
      totalContrib += contrib;
      const sign = contrib >= 0 ? '+' : '';
      const color = contrib >= 0.02 ? 'var(--bull)' : (contrib <= -0.02 ? 'var(--bear)' : 'var(--muted)');
      html += '<a href="#' + r.sec + '" style="text-decoration:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;background:var(--card2);border:1px solid var(--border);border-radius:8px;color:var(--text)">';
      html += '<div style="display:flex;align-items:center;gap:6px;min-width:0">';
      html += '<span style="font-size:12px">' + r.icon + '</span>';
      html += '<div style="min-width:0"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.key + '（權 ' + Math.round(w * 100) + '%）</div><div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.desc + '</div></div>';
      html += '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">';
      html += '<span style="font-size:12px;font-weight:700">' + v.toFixed(2) + '</span>';
      html += '<span style="font-size:11px;color:var(--muted)">→</span>';
      html += '<span style="font-size:12px;font-weight:700;color:' + color + '">' + sign + contrib.toFixed(3) + '</span>';
      html += '</div></a>';
    });
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--muted);margin-top:6px">Σ 貢獻值 ≈ ' + totalContrib.toFixed(3) + '（加權後約等於綜合 ' + combined.toFixed(2) + '）</div>';
    compBreakEl.innerHTML = html;
    compBreakEl.style.display = 'block';
  }

  // 關鍵指標快覽
  const lastRowForStat = rows[rows.length-1];
  const ind = A.indicators;
  const setStat = (id, val, colorClass) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = val;
    el.className = 'sm-val' + (colorClass ? ' '+colorClass : '');
  };
  setStat('statClose', lastRowForStat ? lastRowForStat.close.toLocaleString() : '—');
  setStat('statDate', lastRowForStat ? lastRowForStat.date : '—');
  const rsiVal = ind && ind.RSI ? ind.RSI[ind.RSI.length-1] : null;
  setStat('statRsi', rsiVal!=null ? rsiVal.toFixed(1) : '—', rsiVal>=70?'neg':rsiVal<=30?'pos':'');
  const macdVal = ind && ind.MACD ? ind.MACD.line[ind.MACD.line.length-1] : null;
  setStat('statMacd', macdVal!=null ? macdVal.toFixed(3) : '—', macdVal>0?'pos':macdVal<0?'neg':'');
  // 新增 statGrid：ATR、5日/20日報酬、量比
  const atrVal = ind && ind.ATR14 ? ind.ATR14[ind.ATR14.length-1] : null;
  setStat('statAtr', atrVal!=null ? atrVal.toFixed(2) : '—');
  const retN = n => {
    if (!rows || rows.length <= n) return null;
    const base = rows[rows.length-1-n].close, now = rows[rows.length-1].close;
    if (!base || now == null) return null;
    return (now - base) / base * 100;
  };
  const r5 = retN(5), r20 = retN(20);
  setStat('statRet5', r5!=null ? (r5>=0?'+':'')+r5.toFixed(1)+'%' : '—', r5!=null?(r5>0?'pos':r5<0?'neg':''):'');
  setStat('statRet20', r20!=null ? (r20>=0?'+':'')+r20.toFixed(1)+'%' : '—', r20!=null?(r20>0?'pos':r20<0?'neg':''):'');
  const volRatio = ind && ind.VROC20 ? ind.VROC20[ind.VROC20.length-1] : null;
  setStat('statVol', volRatio!=null ? (volRatio>=0?'+':'')+volRatio.toFixed(0)+'%' : '—', volRatio!=null?(volRatio>30?'pos':volRatio<-30?'neg':''):'');

  // 止損 / 止盈參考價（ATR 估算）
  const slTpEl = document.getElementById('slTp');
  const slTpContent = document.getElementById('slTpContent');
  const riskSec = document.getElementById('riskSec');
  const slTpLastRow = rows[rows.length-1];
  if (slTpEl && slTpContent && slTpLastRow && atrVal != null && atrVal > 0) {
    const close = slTpLastRow.close;
    const fmt = x => (x == null ? '—' : Number(x).toLocaleString(undefined, {maximumFractionDigits:2}));
    // 持有期連動止損：短線 1.5×ATR、中期(40日) 4×ATR、中期(60日) 5×ATR
    const S = StockCore.slTpForHorizon(close, atrVal, "short");
    const M40 = StockCore.slTpForHorizon(close, atrVal, "mid40");
    const M60 = StockCore.slTpForHorizon(close, atrVal, "mid60");
    slTpEl.style.display = 'block';
    if (riskSec) riskSec.style.display = 'block';
    slTpContent.innerHTML =
      '<div style="font-weight:700;color:var(--text);margin-bottom:4px">持有期連動止損 / 止盈</div>' +
      '<div style="margin-bottom:4px">短線(5日)：止損 <b style="color:var(--bear)">' + fmt(S.sl) + '</b>（−1.5×ATR）｜止盈 <b style="color:var(--bull)">' + fmt(S.tp1) + '</b>／' + fmt(S.tp2) + '</div>' +
      '<div style="margin-bottom:4px">中期(2個月)：止損 <b style="color:var(--bear)">' + fmt(M40.sl) + '</b>（−4×ATR）｜止盈 <b style="color:var(--bull)">' + fmt(M40.tp1) + '</b>／' + fmt(M40.tp2) + '</div>' +
      '<div>中期(3個月)：止損 <b style="color:var(--bear)">' + fmt(M60.sl) + '</b>（−5×ATR）｜止盈 <b style="color:var(--bull)">' + fmt(M60.tp1) + '</b>／' + fmt(M60.tp2) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:6px">白話：持有期越長、止損放寬（ATR 倍數變大），避免被短線震盪洗出場；跌破對應止損才減碼。</div>';
  } else if (slTpEl) { slTpEl.style.display = 'none'; if (riskSec) riskSec.style.display = 'none'; }

  // 五方分數白話一句話（plainRead）
  const plainEl = document.getElementById('plainRead');
  if (plainEl && f && f.score_breakdown) {
    const sb = f.score_breakdown;
    const phrase = (v) => v>=0.25?'偏多':v<=-0.25?'偏空':Math.abs(v)<0.05?'幾乎中性':'略偏'+(v>0?'多':'空');
    const order = ['技術面','籌碼面','消息面','盤面','大盤'];
    const parts = order.filter(k => sb[k]!=null).map(k => `${k}${phrase(sb[k])}`);
    if (parts.length) {
      plainEl.style.display = 'block';
      plainEl.textContent = '白話說：' + parts.join('、') + '。' +
        (c >= 0.2 ? ' 整體偏多，可留意逢低布局。' : c <= -0.2 ? ' 整體偏空，建議觀望或減碼。' : ' 整體中性，方向不明確可先觀望。');
    } else plainEl.style.display = 'none';
  } else if (plainEl) { plainEl.style.display = 'none'; }

  // 看多 / 看空理由（跟電腦版一致：從各面訊號全列出來，不只名稱含詳情）
  const bullEl = document.getElementById('bullReasons');
  const bearEl = document.getElementById('bearReasons');
  const bullBox = document.getElementById('bullBox');
  const bearBox = document.getElementById('bearBox');
  // 技術面：把 buy/sell 訊號全列（含 detail）
  const techBull = sigs.filter(s => s.state === 'buy');
  const techBear = sigs.filter(s => s.state === 'sell');
  const bullList = [], bearList = [];
  if (techBull.length) bullList.push('【技術面】' + techBull.map(s => s.name + '（' + (s.detail||'') + '）').join('；'));
  if (techBear.length) bearList.push('【技術面】' + techBear.map(s => s.name + '（' + (s.detail||'') + '）').join('；'));
  // 籌碼面
  if (A.fund_flow && A.fund_flow.ok) {
    if (A.fund_flow.score >= 0.25) bullList.push('【籌碼面】三大法人偏多（' + A.fund_flow.label + '），當日全場淨買。');
    else if (A.fund_flow.score <= -0.25) bearList.push('【籌碼面】三大法人偏空（' + A.fund_flow.label + '），當日全場淨賣。');
  }
  // 消息面
  if (A.news && A.news.count > 0) {
    if (A.news.score >= 0.2) bullList.push('【消息面】近期新聞情緒偏正面（分數 ' + A.news.score.toFixed(2) + '）。');
    else if (A.news.score <= -0.2) bearList.push('【消息面】近期新聞情緒偏負面（分數 ' + A.news.score.toFixed(2) + '）。');
  }
  // 盤面
  if (A.intraday && A.intraday.score >= 0.2) bullList.push('【盤面】' + A.intraday.advice);
  else if (A.intraday && A.intraday.score <= -0.2) bearList.push('【盤面】' + A.intraday.advice);
  // 大盤
  if (A.taiex && A.taiex.score >= 0.3) bullList.push('【大盤】' + A.taiex.advice);
  else if (A.taiex && A.taiex.score <= -0.3) bearList.push('【大盤】' + A.taiex.advice);
  if (!bullList.length && !bearList.length) bullList.push('【綜合】各方訊號中性，無明確看多或看空偏斜。');
  bullBox.style.display = bullList.length ? 'block' : 'none';
  const reasonSec = document.getElementById('reasonSec');
  if (reasonSec) reasonSec.style.display = (bullList.length || bearList.length) ? 'block' : 'none';
  bullEl.innerHTML = bullList.map(r => `<li>${r}</li>`).join('');
  // 手風琴：收折時標題數字顯示「目前可見條數」，展開時顯示總數，讓數字與顯示的 li 一致
  const bullCountEl = document.getElementById('bullCount');
  const bullToggleEl = document.getElementById('bullToggle');
  const bullCollapsed = bullList.length > 3;
  if (bullCollapsed) bullEl.classList.add('collapsed'); else bullEl.classList.remove('collapsed');
  if (bullCountEl) bullCountEl.textContent = bullCollapsed ? `3／${bullList.length}` : bullList.length;
  if (bullToggleEl) {
    bullToggleEl.style.display = bullCollapsed ? '' : 'none';
    bullToggleEl.textContent = bullCollapsed ? '展開全部 ▾' : '收折 ▴';
  }
  bearBox.style.display = bearList.length ? 'block' : 'none';
  bearEl.innerHTML = bearList.map(r => `<li>${r}</li>`).join('');
  const bearCountEl = document.getElementById('bearCount');
  const bearToggleEl = document.getElementById('bearToggle');
  const bearCollapsed = bearList.length > 3;
  if (bearCollapsed) bearEl.classList.add('collapsed'); else bearEl.classList.remove('collapsed');
  if (bearCountEl) bearCountEl.textContent = bearCollapsed ? `3／${bearList.length}` : bearList.length;
  if (bearToggleEl) {
    bearToggleEl.style.display = bearCollapsed ? '' : 'none';
    bearToggleEl.textContent = bearCollapsed ? '展開全部 ▾' : '收折 ▴';
  }

  // 盤面
  const it=A.intraday;
  setVal('iScore', it.score, cls(it.score), it.score>=0.2?'偏多，當天偏強、可留意多頭訊號':it.score<=-0.2?'偏空，當天偏弱、留意減碼':'中性，盤面方向不明、先觀望');
  document.getElementById('iInfo').innerHTML =
    `現價 <b>${it.last!=null?it.last.toLocaleString():'—'}</b>、開盤 ${it.open!=null?it.open.toLocaleString():'—'}、`+
    `漲跌 ${it.chg_pct!=null?(it.chg_pct>0?'+':'')+it.chg_pct+'%':'—'}、量比 ${it.vol_ratio!=null?it.vol_ratio:'—'}；<br>`+
    `<span style="font-size:12px;color:var(--muted)">${it.price_state}；20日均線${it.vs_sma20}、60日${it.vs_sma60}。${it.advice}</span>`;

  // 當日行情醒目橫條（現價、開盤、漲跌幅、漲跌價差）
  const tk = document.getElementById('todayTicker');
  if (tk && it) {
    tk.style.display = 'block';
    const nowEl = document.getElementById('tkNow');
    const openEl = document.getElementById('tkOpen');
    const chgEl = document.getElementById('tkChg');
    const chgAmtEl = document.getElementById('tkChgAmt');
    const dirEl = document.getElementById('tkDir');
    const noteEl = document.getElementById('tkNote');
    // 顏色：漲紅、跌綠、平灰（台股慣例）
    let chgColor = 'var(--muted)', chgTxt = '—', chgAmtTxt = '', dirTxt = '', dirBg = 'var(--card2)';
    // 漲跌價差：現價 − 前收（intradayFromRows 提供 prev_close）
    if (it.last != null && isFinite(it.last) && it.prev_close != null && isFinite(it.prev_close)) {
      const diff = it.last - it.prev_close;
      chgAmtTxt = (diff > 0 ? '+' : diff < 0 ? '' : '') + diff.toFixed(2);
      chgColor = diff > 0 ? 'var(--bull)' : diff < 0 ? 'var(--bear)' : 'var(--muted)';
    }
    if (it.chg_pct != null && isFinite(it.chg_pct)) {
      const c = it.chg_pct;
      if (chgColor === 'var(--muted)') chgColor = c > 0 ? 'var(--bull)' : c < 0 ? 'var(--bear)' : 'var(--muted)';
      chgTxt = (c > 0 ? '+' : '') + c.toFixed(2) + '%';
      if (c > 0) { dirTxt = '▲ 上漲'; dirBg = 'rgba(239,68,68,.15)'; }
      else if (c < 0) { dirTxt = '▼ 下跌'; dirBg = 'rgba(34,197,94,.15)'; }
      else { dirTxt = '◆ 盤整'; }
    }
    if (nowEl) nowEl.textContent = (it.last != null && isFinite(it.last)) ? Number(it.last).toLocaleString() : '—';
    if (openEl) openEl.textContent = (it.open != null && isFinite(it.open)) ? Number(it.open).toLocaleString() : '—';
    if (chgEl) { chgEl.textContent = chgTxt; chgEl.style.color = chgColor; }
    if (chgAmtEl) { chgAmtEl.textContent = chgAmtTxt ? '（' + chgAmtTxt + ' 元）' : ''; chgAmtEl.style.color = chgColor; }
    if (dirEl) {
      if (dirTxt) { dirEl.textContent = dirTxt; dirEl.style.display = 'inline-block'; dirEl.style.background = dirBg; dirEl.style.color = chgColor; }
      else dirEl.style.display = 'none';
    }
    if (noteEl) noteEl.textContent = '⚠️ 僅供參考，不構成投資建議。盤中數據為收盤估算，即時價請以券商或 Yahoo 金融為準。';
  }

  // 大盤
  const tx=A.taiex;
  setVal('tScore', tx.score, cls(tx.score), tx.ok? (tx.score>=0.2?'大盤偏多，環境友善':tx.score<=-0.2?'大盤偏空，環境偏壓制':'大盤中性，未明顯加碼/減碼'):'大盤資料未取得，15% 未計入、以個股訊號為主');
  document.getElementById('tInfo').innerHTML = tx.ok
    ? `加權 <b>${tx.point.toLocaleString()}</b>、${tx.chg_pct>0?'+':''}${tx.chg_pct}%、${tx.direction}${tx.vol20!=null?'、近20日年化波動 '+tx.vol20+'%':''}。<br><span style="font-size:12px;color:var(--muted)">${tx.advice}</span>`
    : `<span style="color:var(--muted)">大盤資料未取得(Yahoo 大盤符號 ^TWII 查無資料);大盤那 15% 未計入,本頁以個股訊號為主。</span>`;

  // 籌碼
  const ff=A.fund_flow;
  setVal('fScore', ff.score||0, cls(ff.score||0), ff.ok? (ff.score>=0.2?'法人偏多，當日機構買盤較強':ff.score<=-0.2?'法人偏空，當日機構賣壓較重':'法人中性，機構多空交織'):'籌碼面未取得，暫以中性計');
  document.getElementById('fInfo').innerHTML = ff.ok
    ? `${ff.label}（當日榜單 ${ff.net_buy_count} 家淨買／${ff.net_sell_count} 家淨賣）。`+
      (ff.on_list&&ff.inst?`<br><span style="font-size:12px;color:var(--muted)">本股當榜：三大法人 ${ff.inst.total_net>=0?'+':''}${ff.inst.total_net.toLocaleString()} 股、外資 ${ff.inst.foreign_net>=0?'+':''}${ff.inst.foreign_net.toLocaleString()} 股。</span>`
      :`<br><span style="font-size:12px;color:var(--muted)">本股未進當日全場法人榜單，法人淨額相對不大。</span>`)
    : `<span style="color:var(--muted)">籌碼面未取得（${ff.err||''}）。</span>`;
  // 籌碼多日統計
  const fm = A.fund_multi;
  document.getElementById('fMulti').innerHTML = fm && fm.ok
    ? `近 ${fm.days} 日：全場法人偏多 <b>${fm.up_days}</b> 天／偏空 <b>${fm.down_days}</b> 天，整體「${fm.label}」。` +
      (fm.ticker_on_list_days>0 ? ` 本股當榜 <b>${fm.ticker_on_list_days}</b> 天、合計 ${fm.ticker_net_sum>=0?'+':''}${fm.ticker_net_sum.toLocaleString()} 股。`
      : ` 本股近期未進全場法人榜單。`) +
      (fm.ticker_consec_label ? `<br><span style="color:var(--accent);font-size:12px">📊 外資連續操作：${fm.ticker_consec_label}。</span>` : '')
    : `<span style="color:var(--muted)">籌碼多日統計未取得。</span>`;
  // 籌碼榜單清單（三大法人淨買／淨賣 Top 5，本股當榜高亮）
  const ffList = ff.ok && ff.rows ? ff.rows : null;
  const fFlowEl = document.getElementById('fFlowList');
  if (ffList && ffList.length) {
    fFlowEl.style.display = 'block';
    const tKey = String(t).padStart(6, '0');
    const onList = ffList.find(r => r.ticker === tKey || r.ticker === t);
    let html = '';
    if (onList) {
      const nn = (onList.net != null ? onList.net : onList.total_net) || 0;
      const nCls = nn >= 0 ? 'pos' : 'neg';
      html += `<div style="background:rgba(56,189,248,.08);border:1px solid var(--accent);border-radius:8px;padding:8px;margin-bottom:8px">` +
        `<div style="font-size:11px;color:var(--accent);font-weight:700;margin-bottom:4px">📌 本股當日當榜</div>` +
        `<div class="flow-item" style="border:none;padding:0"><span class="fn"><b>${onList.name || tKey}</b></span>` +
        `<span class="fv ${nCls}">${nn >= 0 ? '+' : ''}${nn.toLocaleString()} 股</span></div></div>`;
    }
    html += `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:700">當日三大法人淨額 Top 5</div>` +
      ffList.slice(0, 5).map(item => {
        const n = (item.net != null ? item.net : item.total_net) || 0;
        const cls2 = n >= 0 ? 'pos' : 'neg';
        const nm = item.name || item.ticker || '';
        const isSelf = item.ticker === tKey || item.ticker === t;
        return `<div class="flow-item" ${isSelf ? 'style="background:rgba(56,189,248,.08);border-radius:6px;padding:6px"' : ''}>` +
          `<span class="fn">${isSelf ? '📌 ' : ''}${nm}</span>` +
          `<span class="fv ${cls2}">${n >= 0 ? '+' : ''}${n.toLocaleString()} 股</span>` +
          `</div>`;
      }).join('');
    fFlowEl.innerHTML = html;
  } else { fFlowEl.style.display = 'none'; }

  // 相對大盤強度（僅文字顯示，圖表已移除）
  const rs = A.relative;
  if (rs && rs.ok) {
    const rsEl = document.getElementById('rsInfo');
    if (rsEl) rsEl.innerHTML = `個股近20日 <b>${rs.stock_ret>0?'+':''}${rs.stock_ret}%</b>、大盤 <b>${rs.taiex_ret>0?'+':''}${rs.taiex_ret}%</b>，<b>${rs.label}</b>（差 ${rs.diff>0?'+':''}${rs.diff}%）。<br>${rs.advice}`;
  }

  // 消息
  const nw=A.news;
  setVal('nScore', nw?nw.score:0, cls(nw?nw.score:0), nw? (nw.failed?'⚠ '+nw.label+'：'+nw.advice:(nw.score>=0.2?'新聞情緒偏正面，消息面利多':nw.score<=-0.2?'新聞情緒偏負面，消息面利空':'新聞情緒中性，消息面未明顯助漲/助跌')):'沒有抓到相關新聞，消息面未計入');
  document.getElementById('nInfo').innerHTML = nw
    ? (nw.failed
        ? `<span style="color:var(--yellow)">⚠ ${nw.label}：${nw.advice}</span>`
        : `${nw.label}（近 ${nw.days} 天、共 ${nw.count} 則新聞，利多 ${nw.pos}／利空 ${nw.neg}）。<br><span style="font-size:12px;color:var(--muted)">${nw.advice}</span>`)
    : `<span style="color:var(--muted)">目前沒有抓到相關新聞。</span>`;
  // 新聞清單（newsSentiment 回傳的 headlines 欄位）
  const newsListEl = document.getElementById('newsList');
  const newsItems = nw ? (nw.headlines || nw.items || []) : [];
  if (newsItems.length) {
    newsListEl.style.display = 'block';
    const dayLabel = nw ? nw.days : 7;
    newsListEl.innerHTML =
      `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:700">近期相關新聞（近 ${dayLabel} 天、${newsItems.length} 則，新→舊）</div>` +
      newsItems.slice(0, 10).map(item => {
        // 相容：純字串 或 {title, link}
        const title = (typeof item === "string") ? item : (item.title || "");
        const link = (typeof item === "string") ? "" : (item.link || "");
        const esc = title.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
        if (link) {
          const href = link.startsWith("http") ? link : "https://news.google.com" + link;
          return `<div class="news-item"><a class="nt" href="${href.replace(/"/g,"&quot;")}" target="_blank" rel="noopener noreferrer" style="color:var(--text);text-decoration:none;display:block;cursor:pointer" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text)'">${esc}</a></div>`;
        }
        return `<div class="news-item"><div class="nt">${esc}</div></div>`;
      }).join('');
  } else { newsListEl.style.display = 'none'; }

  // 訊號：依「權重/重要性 + 新到舊」排列（偏多偏空在前、中性靠後）
  const order = { buy: 0, sell: 0, neutral: 1 };
  const sortedSigs = [...A.signals].sort((a, b) => {
    const wa = order[a.state] ?? 1, wb = order[b.state] ?? 1;
    if (wa !== wb) return wa - wb;                 // 偏多/偏空優先
    return (b.weight || 0) - (a.weight || 0);        // 同組內依權重
  });
  document.getElementById('sigList').innerHTML = sortedSigs.map(s=>{
    const b = s.state==='buy'?'buy':s.state==='sell'?'sell':'neutral';
    const txt = s.state==='buy'?'偏多':s.state==='sell'?'偏空':'中性';
    const val = s.value != null ? Number.isFinite(s.value) ? s.value.toFixed(2) : '' : '';
    const valHtml = val ? `<div style="min-width:50px;text-align:right;font-size:13px;font-weight:700;color:var(--text);flex-shrink:0">${val}</div>` : '';
    return `<div class="sig" style="flex-wrap:nowrap">
      <span class="badge ${b}" style="flex-shrink:0">${txt}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${s.name}</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.4;margin-top:2px">${s.detail||''}</div>
      </div>
      ${valHtml}
    </div>`;
  }).join('');

  // 近期買賣時機（新→舊，表格格式）
  const evs = StockCore.findBuySellPoints(A.indicators, A._stockRows || [], 60);
  document.getElementById('evList').innerHTML = evs.length
    ? `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">` +
      `<thead><tr style="border-bottom:2px solid var(--border);text-align:left">` +
      `<th style="padding:8px 6px;font-size:11px;color:var(--muted)">日期</th>` +
      `<th style="padding:8px 6px;font-size:11px;color:var(--muted)">類型</th>` +
      `<th style="padding:8px 6px;font-size:11px;color:var(--muted);text-align:right">價格</th>` +
      `<th style="padding:8px 6px;font-size:11px;color:var(--muted)">原因</th>` +
      `</tr></thead><tbody>` +
      evs.slice(0, 12).map(e =>
        `<tr style="border-bottom:1px solid var(--border)">` +
        `<td style="padding:7px 6px;color:var(--muted);font-size:12px">${e.date}</td>` +
        `<td style="padding:7px 6px"><span class="badge ${e.type==='buy'?'buy':'sell'}">${e.type==='buy'?'▲ 買入':'▼ 賣出'}</span></td>` +
        `<td style="padding:7px 6px;text-align:right;font-weight:700;color:var(--text)">${e.price.toLocaleString()}</td>` +
        `<td style="padding:7px 6px;font-size:12px;color:var(--muted)">${e.description}</td>` +
        `</tr>`
      ).join('') +
      `</tbody></table></div>`
    : '<span style="color:var(--muted)">近期沒有特別明顯的買賣時機</span>';

  window._lastEvents = evs;
  // #6 止損/止盈納入 K 線圖水平線（依 ATR 算，跟綜合卡一致）
  const lastRow = rows[rows.length-1];
  const ATR = A.indicators.ATR14 ? A.indicators.ATR14[A.indicators.ATR14.length-1] : null;
  if (lastRow && ATR != null) {
    const m40 = A.slTp ? A.slTp.mid40 : null;
    window._slTp = { sl: lastRow.close - 1.5*ATR, tp1: lastRow.close + ATR, tp2: lastRow.close + 2*ATR, slMid: m40 ? m40.sl : null };
  } else { window._slTp = null; }
  drawChart(rows, A.indicators);
  drawMACD(rows, A.indicators);
  drawRSI(rows, A.indicators);
  drawVolChart(rows, A.indicators);
  window._lastRows = rows;
  window._lastIND = A.indicators;
}

  g.cls = cls;
  g.setVal = setVal;
  g.drawChart = drawChart;
  g.drawMACD = drawMACD;
  g.drawRSI = drawRSI;
  g.drawVolChart = drawVolChart;
  g.render = render;
})(typeof window !== "undefined" ? window : globalThis);
