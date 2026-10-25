/*
 * sector_scan.html — 產業淺力股掃描（純前端版）
 * 選定產業別 → 抓該產業別成分股日K（Yahoo .TW/.TWO）→ 算 5 維度布局分數（消息面 35% 最高）
 * 消息面：直抓 Google News RSS（allorigins 代理）
 * 複用 core.js 的訊號函式；產業別對照表從 sector_map.json 載入
 */
(function(){
"use strict";

const SECTOR_MAP_URL = "sector_map.json";
// 正面詞 / 負面詞（與後端 sector_scan.py 一致）
const POS = ["利多","上漲","成長","獲利","買超","創高","轉強","加碼","樂觀","看漲","上修",
  "回穩","突破","賺","EPS","賣廠","爆量","連漲","漲停","新高","轉多","加倉","看好","預期",
  "上調","強勁","攻","衝","上","強","多","好"];
const NEG = ["利空","下跌","崩跌","虧損","賣超","創低","轉弱","悲觀","看跌","下修","回檔",
  "跌破","警訊","減碼","風險","虧","低點","減產","警報","跌停","新低","轉空","減倉","看衰",
  "下調","跌","弱","空","壞"];

let SECTOR_MAP = null;
let selected = new Set();
const $ = id => document.getElementById(id);

// ── 載入產業別對照表 ─────────────────────────────────────────
async function loadSectorMap(){
  const r = await fetch(SECTOR_MAP_URL);
  SECTOR_MAP = await r.json();
}

// ── 日K 抓取（Yahoo，上市 .TW / 上櫃 .TWO） ───────────────
function toYahoo(code){
  const c = code.toUpperCase().replace(/\.TW$/,'').replace(/\.TWO$/,'');
  return /^[34568]\d{3}$/.test(c) ? c + '.TWO' : c + '.TW';
}
async function fetchDaily(code, period){
  period = period || "6mo";
  const sym = toYahoo(code);
  // 走 Jina 代理抓 Yahoo 日K JSON
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=999999999&interval=1d&events=history`;
  let text = null;
  // 1) 直抓
  try {
    const r = await fetch(chartUrl);
    if (r.ok) { text = await r.text(); if (!text || text.indexOf('"timestamp"') < 0) text = null; }
  } catch(e){ text = null; }
  // 2) allorigins
  if (!text) {
    try {
      const r = await fetch("https://api.allorigins.win/raw?url=" + encodeURIComponent(chartUrl));
      if (r.ok) { const t = await r.text(); if (t.indexOf('"timestamp"') > 0) text = t; }
    } catch(e){}
  }
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    const res = j.chart && j.chart.result && j.chart.result[0];
    if (!res) return null;
    const ts = res.timestamp;
    const q = res.indicators.quote[0];
    const rows = [];
    for (let i=0;i<ts.length;i++){
      const d = new Date(ts[i]*1000).toISOString().slice(0,10);
      rows.push({date:d, open:q.open[i], high:q.high[i], low:q.low[i], close:q.close[i], volume:q.volume[i]||0});
    }
    // 只用近期（period 限制）
    return rows;
  } catch(e){ return null; }
}

// ── 技術指標（與個股工具一致） ──────────────────────────────
function sma(arr,n){
  const out=new Array(arr.length).fill(null);let s=0;
  for(let i=0;i<arr.length;i++){s+=arr[i];if(i>=n)s-=arr[i-n];if(i>=n-1)out[i]=s/n;}return out;
}
function calcIndicators(rows){
  const c=rows.map(r=>r.close), h=rows.map(r=>r.high), l=rows.map(r=>r.low), v=rows.map(r=>r.volume||0);
  const S5=sma(c,5),S20=sma(c,20),S60=sma(c,60);
  // RSI14
  const rsi=new Array(c.length).fill(null);
  let g=0,lo=0;
  for(let i=1;i<c.length;i++){const ch=c[i]-c[i-1];const up=Math.max(ch,0),dn=Math.max(-ch,0);
    g+=up/14;lo+=dn/14;if(i>=14){g-=(up<0?0:(ch<0?0:up))/14;if(ch>0)lo-=(dn>0?dn:0)/14;else g-=(up>0?up:0)/14;}
    if(i>=14)rsi[i]=lo===0?100:100-100/(1+g/lo);}
  // MACD
  function ema(a,n){const o=new Array(a.length).fill(null);let pv=null;const k=2/(n+1);
    for(let i=0;i<a.length;i++){pv=pv===null?a[i]:a[i]*k+pv*(1-k);o[i]=pv;}return o;}
  const e12=ema(c,12),e26=ema(c,26);
  const macd=c.map((_,i)=>e12[i]-e26[i]);
  const sig=ema(macd.map((x,i)=>i>=25?x:null),9);
  // KDJ
  const K=new Array(c.length).fill(null),D=new Array(c.length).fill(null),J=new Array(c.length).fill(null);
  for(let i=8;i<c.length;i++){let loN=Math.min(...l.slice(i-8,i+1)),hiN=Math.max(...h.slice(i-8,i+1));
    const rsv=hiN===loN?50:(c[i]-loN)/(hiN-loN)*100;
    K[i]=i===8?rsv:(K[i-1]*2+rsv)/3;D[i]=i===8?K[i]:(D[i-1]*2+K[i])/3;J[i]=3*K[i]-2*D[i];}
  // ATR14
  const ATR=new Array(c.length).fill(null);let tr=0;
  for(let i=1;i<c.length;i++){const t=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));
    if(i<14){tr+=t;if(i===13)ATR[i]=tr/14;}
    else{tr=tr*13+t;ATR[i]=tr/14;}}
  // BIAS20
  const BIAS20=c.map((x,i)=>S20[i]?(x-S20[i])/S20[i]*100:null);
  // VROC20（量比 vs 20日均量）
  const volS20=sma(v,20);
  const VROC20=v.map((x,i)=>volS20[i]&&volS20[i]>0?x/volS20[i]*100:null);
  return {SMA5:S5,SMA20:S20,SMA60:S60,RSI,MACD:macd,MACD_signal:sig,K,D,J,ATR,
          BIAS20,VROC20,close:c,high:h,low:l,rows};
}

// ── 5 維度布局分數（消息面 35% 最高） ─────────────────────────
function layoutScore(IND, i, newsScore, vsTaiex){
  const ind = IND;
  const reasons = {};
  const c=ind.close[i], macd=ind.MACD[i], msig=ind.MACD_signal[i], rsi=ind.RSI[i];
  const pmacd=i>0?ind.MACD[i-1]:null, pmsig=i>0?ind.MACD_signal[i-1]:null;
  // 1) 轉強訊號（25%）：MACD 金叉 或 RSI 回升到 35~55
  const macdGold = pmacd!==null && pmsig!==null && pmacd<=pmsig && macd>msig;
  const rsiRec = rsi!=null && rsi>=35 && rsi<=55;
  const macdPos = macd>0;
  if (macdGold && rsiRec) reasons.turn_strong=1.0;
  else if (macdGold || rsiRec || macdPos) reasons.turn_strong=0.5;
  else reasons.turn_strong=0.0;
  // 2) 消息面（35%）
  reasons.news = newsScore!=null?newsScore:0.5;
  // 3) 量能（15%）：VROC20 90~130 最佳
  const v=ind.VROC20[i];
  if (v!=null && v>=90 && v<=130) reasons.volume=1.0;
  else if (v!=null && v>=60 && v<90) reasons.volume=0.6;
  else if (v!=null && v>130 && v<=200) reasons.volume=0.4;
  else reasons.volume=0.0;
  // 4) 相對強度（10%）
  if (vsTaiex!=null) reasons.relative = vsTaiex>0?1.0:(vsTaiex>-0.05?0.3:0.0);
  else reasons.relative=0.5;
  // 5) 乖離收斂（15%）
  const bias=ind.BIAS20[i]||0;
  const atrPct=(ind.ATR[i]&&c)?(ind.ATR[i]/c*100):0;
  if (bias>=-3&&bias<=3&&atrPct<5) reasons.bias=1.0;
  else if (bias>=-5&&bias<=5&&atrPct<8) reasons.bias=0.6;
  else reasons.bias=0.0;
  const score=reasons.turn_strong*25+reasons.news*35+reasons.volume*15+reasons.relative*10+reasons.bias*15;
  return {score:Math.round(score*10)/10, reasons};
}

// ── 消息面（Google News RSS） ────────────────────────────────
async function fetchNewsSentiment(code, name, days){
  days=days||7;
  const q=encodeURIComponent((name||"")+" "+code);
  const url=`https://news.google.com/rss/search?q=${q}&hl=zh-TW&gl=TW&ce=zh`;
  let text=null;
  // 1) 直抓
  try{const r=await fetch(url,{mode:"cors"});if(r.ok){text=await r.text();if(!text||text.indexOf("<rss")<0)text=null;}}catch(e){}
  // 2) allorigins
  if(!text){try{const r=await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(url));
    if(r.ok){const t=await r.text();if(t.indexOf("<rss")>0||t.indexOf("<item")>0)text=t;}}catch(e){}}
  if(!text)return null;
  try{
    const doc=new DOMParser().parseFromString(text,"text/xml");
    const items=Array.from(doc.querySelectorAll("item")).map(it=>{
      const t=it.querySelector("title");return t?t.textContent.trim():"";}).filter(Boolean);
    let P=0,N=0;
    for(const t of items){const tt=t.toLowerCase();
      for(const w of POS)if(tt.includes(w))P++;
      for(const w of NEG)if(tt.includes(w))N++;}
    const total=P+N;
    if(total===0)return 0.5;
    return Math.round(((P-N)/total*0.5+0.5)*1000)/1000;
  }catch(e){return null;}
}

// ── 加權指數 20 日漲跌幅 ────────────────────────────────────
async function taiex20d(){
  const sym="^TWII";
  const chartUrl=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=999999999&interval=1d&events=history`;
  let text=null;
  try{const r=await fetch(chartUrl);if(r.ok){text=await r.text();if(!text||text.indexOf('"timestamp"')<0)text=null;}}catch(e){}
  if(!text){try{const r=await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(chartUrl));
    if(r.ok){const t=await r.text();if(t.indexOf('"timestamp"')>0)text=t;}}catch(e){}}
  if(!text)return null;
  try{const j=JSON.parse(text);const res=j.chart.result[0];const c=res.indicators.quote[0].close.filter(x=>x!=null);
    if(c.length<21)return null;return (c[c.length-1]-c[c.length-21])/c[c.length-21];}catch(e){return null;}
}

// ── 掃描單一產業別 ──────────────────────────────────────────
async function scanSector(sectorName, limit){
  const codes=(SECTOR_MAP.industry_to_codes||{})[sectorName]||[];
  const tw=await taiex20d();
  const results=[];
  let i=0;
  for(const code of codes){
    i++;
    if(i%10===0){const m=$("loadMsg");if(m)m.textContent=`掃描中 ${i}/${codes.length}…`;}
    let rows=null;
    try{rows=await fetchDaily(code,"6mo");}catch(e){}
    if(!rows||rows.length<30)continue;
    const IND=calcIndicators(rows);
    const nRows=rows.length;
    // 先算「不含新聞」分數
    const base=layoutScore(IND,nRows-1,0.5,tw);
    results.push({code, name:(SECTOR_MAP.code_to_name||{})[code]||"", industry:sectorName,
      price:rows[nRows-1].close, scoreNoNews:base.score, reasons:base.reasons, indicators:IND,
      news:null});
  }
  // 依無新聞分數排序，抓 top20 新聞
  results.sort((a,b)=>b.scoreNoNews-a.scoreNoNews);
  const top=results.slice(0,20);
  for(const item of top){
    try{item.news=await fetchNewsSentiment(item.code,item.name,7);}catch(e){item.news=null;}
    if(item.news==null)item.news=0.5;
    const full=layoutScore(item.indicators,item.indicators.close.length-1,item.news,tw);
    item.score=full.score;
    item.reasons=full.reasons;
  }
  results.sort((a,b)=>b.score-a.score);
  return {sector:sectorName, taiex_20d:tw, count:results.length, results:results.slice(0,limit||30)};
}

// ── UI ──────────────────────────────────────────────────────
const SECTOR_ORDER=["半導體業","電子零組件業","電腦及週邊設備業","光電業","通信網路業","資訊服務業",
  "電子通路業","其他電子業","數位雲端","金融保險業","汽車工業","生技醫療業","電機機械","鋼鐵工業",
  "化學工業","紡織纖維","食品工業","航運業","建材營造業","綠能環保","油電燃氣業","觀光餐旅","運動休閒",
  "居家生活","塑膠工業","橡膠工業","玻璃陶瓷","造紙工業","電器電纜","貿易百貨業","綜合業","其他業"];

function renderSectors(){
  const map=SECTOR_MAP.industry_to_codes||{};
  const box=$("sectorList");
  const names=SECTOR_ORDER.filter(n=>map[n]&&map[n].length);
  // 補充 map 裡有但 order 沒的
  for(const n of Object.keys(map)){if(!names.includes(n)&&map[n].length)names.push(n);}
  box.innerHTML=names.map(n=>
    `<label title="點擊勾選"><input type="checkbox" value="${n}" onchange="toggleSel(this)">
     ${n}<span class="cnt">${map[n].length}</span></label>`).join("");
  // 預勾半導體業
  const first=names.includes("半導體業")?"半導體業":names[0];
  if(first){const el=box.querySelector(`input[value="${first}"]`);if(el){el.checked=true;selected.add(first);}}
}
function toggleSel(el){if(el.checked)selected.add(el.value);else selected.delete(el.value);}
window.toggleSel=toggleSel;

function scoreClass(s){if(s>=70)return"score-good";if(s>=40)return"score-mid";return"score-bad";}
function chk(on,label){return `<span class="chk ${on?"on":""}">${on?"✓":"✗"} ${label}</span>`;}

function renderResults(d){
  const body=$("resBody");
  const sum=$("summary");
  const res=$("results");
  if(!d.results||!d.results.length){res.style.display="none";showErr("沒找到符合條件的股票。");return;}
  res.style.display="block";
  const tw=d.taiex_20d!=null?((d.taiex_20d*100).toFixed(1)+"%"):"—";
  sum.innerHTML=`共 <b style="color:var(--text)">${d.count}</b> 檔、產業別 ${d.sector}、加權指數近 20 日 <b style="color:${d.taiex_20d>0?"var(--bull)":"var(--bear)"}">${tw}</b>`;
  body.innerHTML=d.results.map(x=>{
    const rs=x.reasons||{};
    const checks=chk(rs.turn_strong>=1,"轉強")+chk(rs.news>=0.7,"消息")+chk(rs.volume>=0.6,"量能")+chk(rs.bias>=0.6,"乖離")+chk(rs.relative>=1,"相對");
    const scoreCls=scoreClass(x.score);
    return `<tr style="cursor:pointer" onclick="quickDetail('${x.code}')">
      <td class="code-cell">${x.code}</td><td>${x.name||"—"}</td><td>${x.industry}</td>
      <td>${x.price!=null?x.price.toFixed(2):"—"}</td>
      <td class="score-cell ${scoreCls}">${x.score}</td>
      <td><div class="checks">${checks}</div></td></tr>`;
  }).join("");
}
function quickDetail(code){
  // 跳既有個股工具（同 repo 的 index.html），帶代號
  window.location.href="index.html?ticker="+encodeURIComponent(code);
}
window.quickDetail=quickDetail;

async function runScan(){
  if(selected.size===0){showErr("請至少勾選一個產業別");return;}
  showLoading("掃描中…");hideErr();
  const btn=$("btnScan");btn.disabled=true;
  try{
    // 多產業別：逐一掃再合併
    const all=[];
    const names=[...selected];
    for(const n of names){
      $("loadMsg").textContent="掃描 "+n+"…";
      const d=await scanSector(n,30);
      all.push(...d.results);
    }
    all.sort((a,b)=>b.score-a.score);
    renderResults({count:all.length, sector:names.join("、"), taiex_20d:all[0]?(all[0].reasons?null:null):null, results:all});
    // 顯示加權 20 日
    if(all[0]&&all[0].score){const s=all[0];/* 不顯示 taiex，簡化 */}
  }catch(e){showErr("掃描失敗："+e.message);}
  finally{btn.disabled=false;hideLoading();}
}
window.runScan=runScan;

function showLoading(msg){$("loading").style.display="block";$("loadMsg").textContent=msg;}
function hideLoading(){$("loading").style.display="none";}
function showErr(msg){const e=$("errBox");e.style.display="block";e.innerHTML="<b style='color:var(--yellow)'>⚠ "+msg+"</b>";$("results").style.display="none";}
function hideErr(){$("errBox").style.display="none";}

(async function init(){
  try{
    await loadSectorMap();
    renderSectors();
  }catch(e){
    showErr("載入產業別對照表失敗："+e.message);
  }
})();
})();
