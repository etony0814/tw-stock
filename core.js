/*
 * core.js — 台股五方綜合決策 共用核心
 * 電腦版(server.py) 與 GitHub Pages 純前端版(deploy/index.html) 共用
 * 含：技術指標、訊號引擎、五方綜合、籌碼面、盤面、大盤、消息面(情緒)
 *
 * 所有函式純 JS、無外部依賴；資料由 callData() 一次抓齊後喂給 computeAll()。
 */
(function (global) {
  "use strict";

  // ─────────────────────────────────────────────────────────
  // 技術指標
  // ─────────────────────────────────────────────────────────
  function sma(arr, n) {
    const out = new Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= n) sum -= arr[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  function ema(arr, n) {
    const out = new Array(arr.length).fill(null);
    const k = 2 / (n + 1);
    let prev = null;
    for (let i = 0; i < arr.length; i++) {
      if (i === 0) { prev = arr[0]; }
      else { prev = arr[i] * k + prev * (1 - k); }
      if (i >= n - 1) out[i] = prev;
    }
    return out;
  }

  function macd(closes, fast, slow, sig) {
    const ef = ema(closes, fast);
    const es = ema(closes, slow);
    const line = ef.map((v, i) => (v == null || es[i] == null ? null : v - es[i]));
    // 訊號線用 MACD 線裡非 null 部分算 EMA
    const validLine = line.map(v => v == null ? 0 : v);
    const sigLine = ema(validLine, sig);
    const sigAdj = line.map((v, i) => (v == null ? null : sigLine[i]));
    const hist = line.map((v, i) => (v == null || sigAdj[i] == null ? null : v - sigAdj[i]));
    return { line, signal: sigAdj, hist };
  }

  function rsi(closes, n) {
    const out = new Array(closes.length).fill(null);
    let gains = 0, losses = 0;
    for (let i = 1; i <= n; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    let ag = gains / n, al = losses / n;
    out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = n + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
      ag = (ag * (n - 1) + g) / n;
      al = (al * (n - 1) + l) / n;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  }

  function kdj(o, h, l, c, n) {
    n = n || 9;
    const K = new Array(c.length).fill(null);
    const D = new Array(c.length).fill(null);
    const J = new Array(c.length).fill(null);
    let pk = 50, pd = 50;
    for (let i = 0; i < c.length; i++) {
      if (i < n - 1) { K[i] = null; D[i] = null; J[i] = null; continue; }
      let hh = -Infinity, ll = Infinity;
      for (let j = i - n + 1; j <= i; j++) {
        hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]);
      }
      const rsv = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
      pk = (2 / 3) * pk + (1 / 3) * rsv;
      pd = (2 / 3) * pd + (1 / 3) * pk;
      K[i] = pk; D[i] = pd; J[i] = 3 * pk - 2 * pd;
    }
    return { K, D, J };
  }

  function boll(closes, n, mult) {
    n = n || 20; mult = mult || 2;
    const mid = sma(closes, n);
    const upper = mid.map((m, i) => {
      if (m == null) return null;
      let sum = 0;
      for (let j = i - n + 1; j <= i; j++) sum += (closes[j] - m) ** 2;
      return m + mult * Math.sqrt(sum / n);
    });
    const lower = mid.map((m, i) => {
      if (m == null) return null;
      let sum = 0;
      for (let j = i - n + 1; j <= i; j++) sum += (closes[j] - m) ** 2;
      return m - mult * Math.sqrt(sum / n);
    });
    return { mid, upper, lower };
  }

  function atr(h, l, c, n) {
    n = n || 14;
    const out = new Array(c.length).fill(null);
    let trArr = new Array(c.length).fill(0);
    for (let i = 1; i < c.length; i++) {
      trArr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    }
    let sum = 0;
    for (let i = 1; i <= n; i++) sum += trArr[i];
    let a = sum / n;
    out[n] = a;
    for (let i = n + 1; i < c.length; i++) {
      a = (a * (n - 1) + trArr[i]) / n;
      out[i] = a;
    }
    return out;
  }

  function obv(c, v) {
    const out = new Array(c.length).fill(0);
    let o = 0;
    for (let i = 0; i < c.length; i++) {
      if (i > 0) {
        if (c[i] > c[i - 1]) o += v[i];
        else if (c[i] < c[i - 1]) o -= v[i];
      }
      out[i] = o;
    }
    return out;
  }

  function computeIndicators(rows) {
    // rows: [{date, open, high, low, close, volume}] 依時間舊→新
    const o = rows.map(r => r.open), h = rows.map(r => r.high);
    const l = rows.map(r => r.low), c = rows.map(r => r.close);
    const v = rows.map(r => r.volume);
    const res = { rows, SMA5: sma(c, 5), SMA20: sma(c, 20), SMA60: sma(c, 60) };
    res.MACD = macd(c, 12, 26, 9);
    res.RSI = rsi(c, 14);
    res.KDJ = kdj(o, h, l, c, 9);
    res.BOLL = boll(c, 20, 2);
    res.ATR14 = atr(h, l, c, 14);
    res.OBV = obv(c, v);
    res.VROC5 = v.map((x, i) => (i >= 5 ? (x - v[i - 5]) / v[i - 5] * 100 : null));
    // VROC20：20日量比（與電腦版 stock_analysis.py 一致）
    res.VROC20 = v.map((x, i) => (i >= 20 ? (x - v[i - 20]) / v[i - 20] * 100 : null));
    // BIAS20
    res.BIAS20 = c.map((x, i) => {
      const m = res.SMA20[i];
      return m == null ? null : (x - m) / m * 100;
    });
    return res;
  }

  // 歷史 5 日勝率：對「截至該日收盤」重放 tech 分數，看偏多/偏空訊號觸發後 5 日是否照做。
  // 回傳 { up:{n,win,rate}, down:{n,win,rate}, up_label, down_label, overall_label }
  function hist5(rows, IND, lookback) {
    lookback = lookback || 120;
    const closes = rows.map(r => r.close);
    const n = closes.length;
    const start = Math.max(60, n - lookback);
    let upN = 0, upW = 0, dnN = 0, dnW = 0;
    for (let i = start; i < n - 5; i++) {
      // 只用「截至 i 日收盤」的指標（與線上 detectSignals(IND,i) 邏輯一致）
      let comp;
      try {
        comp = compositeSignal(detectSignals(IND, i));
      } catch (e) { continue; }
      const score = comp ? comp.tech_score : 0;
      const future = closes[i + 5];
      if (future == null) continue;
      if (score >= 0.2) { upN++; if (future > closes[i]) upW++; }
      else if (score <= -0.2) { dnN++; if (future < closes[i]) dnW++; }
    }
    const upRate = upN ? upW / upN : null;
    const dnRate = dnN ? dnW / dnN : null;
    const up5 = upRate != null ? Math.round(upRate * 1000) / 10 : null;
    const dn5 = dnRate != null ? Math.round(dnRate * 1000) / 10 : null;
    const upLabel = up5 == null ? "資料不足"
      : up5 >= 60 ? "訊號可信，偏多時 5 日內常漲"
      : up5 >= 50 ? "偏多訊號有一定參考價值"
      : "偏多訊號雜音大，別全倉追";
    const downLabel = dn5 == null ? "資料不足"
      : dn5 >= 60 ? "訊號可信，偏空時 5 日內常跌（該減碼就減）"
      : dn5 >= 50 ? "偏空訊號有一定參考價值"
      : "偏空訊號雜音大，減碼要配合止損";
    const overall = (up5 == null && dn5 == null) ? "資料不足，無法估該股訊號準確度"
      : ((up5 || 0) >= 60 || (dn5 || 0) >= 60)
        ? "該股訊號準確度較好，可配合操作"
        : "該股訊號雜音大，務必配合止損、勿全倉";
    return { up_n: upN, up_win: upW, up_rate: up5,
      down_n: dnN, down_win: dnW, down_rate: dn5,
      up_label: upLabel, down_label: downLabel, overall_label: overall };
  }

  // ─────────────────────────────────────────────────────────
  // 訊號引擎（白話名）
  // ─────────────────────────────────────────────────────────
  function detectSignals(IND, i) {
    // i = 最後一根索引
    const r = IND.rows[i];
    const c = r.close;
    const s = [];
    const add = (name, state, detail, weight, value) => s.push({ name, state, detail, weight: weight || 1, value: value != null ? value : undefined });

    // SMA 排列
    const s5 = IND.SMA5[i], s20 = IND.SMA20[i], s60 = IND.SMA60[i];
    if (s5 && s20 && s60) {
      if (s5 > s20 && s20 > s60) add("均線多頭排列（短長全翻上）", "buy", "短、中、長期均線全朝上，多頭格局。", 2, s5);
      else if (s5 < s20 && s20 < s60) add("均線空頭排列（短長全朝下）", "sell", "短、中、長期均線全朝下，空頭格局。", 2, s5);
      else add("均線交纏", "neutral", "短、中、長期均線沒有明確排列。", 0, s5);
    }

    // MACD 交叉（含「持續偏多/偏空」降權：連續 ≥5 日同方向時，權重 2→1，避免趨勢段過度放大）
    const ml = IND.MACD.line, ms = IND.MACD.signal;
    if (i > 0 && ml[i] != null && ms[i] != null && ml[i - 1] != null && ms[i - 1] != null) {
      // 計算 MACD 同方向連續天數（看 ml 相對零軸）
      const sameDir = ml[i] > 0 ? "up" : "down";
      let consecDays = 0;
      for (let k = i; k >= 0 && k > i - 10; k--) {
        if (ml[k] == null) break;
        const dir = ml[k] > 0 ? "up" : "down";
        if (dir === sameDir) consecDays++;
        else break;
      }
      if (ms[i - 1] <= ml[i - 1] && ms[i] > ml[i]) add("MACD 金叉（買盤轉強）", "buy", "MACD 從下方翻上訊號線，動能轉強。", 2, ml[i]);
      else if (ms[i - 1] >= ml[i - 1] && ms[i] < ml[i]) add("MACD 死叉（賣壓轉重）", "sell", "MACD 從上方跌破訊號線，動能轉弱。", 2, ml[i]);
      else {
        const pos = ml[i] > 0;
        const w = consecDays >= 5 ? 1 : 2; // 同方向 ≥5 日：視為「已反映在排列」，降權
        add("MACD 偏" + (pos ? "多" : "空") + (consecDays >= 5 ? "（連續 " + consecDays + " 日）" : ""), pos ? "buy" : "sell",
          pos ? "MACD 在零軸上方，買盤稍強於賣盤。" : "MACD 在零軸下方，賣壓稍強於買盤。",
          w, ml[i]);
      }
    }

    // RSI（含中場訊號 + 斜率）
    const rsi = IND.RSI[i];
    let rsiSlope = 0;
    if (rsi != null && i >= 3) {
      const rsi3 = IND.RSI[i-3];
      if (rsi3 != null) rsiSlope = rsi - rsi3;
    }
    if (rsi != null) {
      if (rsi >= 70) {
        add("短線偏熱（RSI " + rsi.toFixed(0) + "）", "sell", "漲太多，短線留意回檔。", 2, rsi);
      } else if (rsi <= 30) {
        add("短線偏冷（RSI " + rsi.toFixed(0) + "）", "buy", "跌太多，短線留意反彈。", 2, rsi);
      } else if (rsi >= 50 && rsi < 70) {
        // 中場偏多（RSI 50-70 是多頭區）
        add("RSI 中場偏多（" + rsi.toFixed(0) + "）", "buy", "RSI 處於 50-70 多頭區，短線偏強。", 1, rsi);
        if (rsiSlope > 5) add("RSI 近 3 日上升（+" + rsiSlope.toFixed(1) + "）", "buy", "RSI 持續上升，動能正在轉強。", 1, rsiSlope);
      } else if (rsi <= 50 && rsi > 30) {
        // 中場偏空（RSI 30-50 是空頭區）
        add("RSI 中場偏空（" + rsi.toFixed(0) + "）", "sell", "RSI 處於 30-50 空頭區，短線偏弱。", 1, rsi);
        if (rsiSlope < -5) add("RSI 近 3 日下降（" + rsiSlope.toFixed(1) + "）", "sell", "RSI 持續下降，動能正在轉弱。", 1, rsiSlope);
      } else {
        add("短線不熱不冷（RSI " + rsi.toFixed(0) + "）", "neutral", "沒有明顯超買超賣。", 0, rsi);
      }
    }

    // KDJ
    const k = IND.KDJ.K[i], d = IND.KDJ.D[i], j = IND.KDJ.J[i];
    if (j != null && j < 0) add("KDJ 極冷（J " + j.toFixed(0) + "）", "buy", "J 值跌破 0，極短線可能反彈。", 1, j);
    else if (j != null && j > 100) add("KDJ 極熱（J " + j.toFixed(0) + "）", "sell", "J 值衝上 100，極短線可能回調。", 1, j);
    else if (k != null && d != null && k < d && i > 0 && IND.KDJ.K[i - 1] >= IND.KDJ.D[i - 1]) add("KDJ 死叉", "sell", "K 值從上跌破 D 值，短線偏弱。", 1, k);
    else if (k != null && d != null && k > d && i > 0 && IND.KDJ.K[i - 1] <= IND.KDJ.D[i - 1]) add("KDJ 金叉", "buy", "K 值從下翻上 D 值，短線偏強。", 1, k);
    else if (k != null && d != null) add("KDJ 中性", "neutral", "K=" + k.toFixed(1) + "、D=" + d.toFixed(1) + "，短線無明顯偏多偏空。", 0, k);

    // BOLL
    const bu = IND.BOLL.upper[i], bl = IND.BOLL.lower[i];
    if (bu != null && bl != null) {
      if (c > bu) add("收盤站上壓力線（布林上軌）", "buy", "收盤站上布林上軌（" + bu.toFixed(2) + "），短線強勢。", 1, bu);
      else if (c < bl) add("收盤跌破支撐線（布林下軌）", "sell", "收盤跌破布林下軌（" + bl.toFixed(2) + "），短線偏弱。", 1, bl);
      else add("收盤在通道內（布林上下軌之間）", "neutral", "收盤在壓力線（上軌 " + bu.toFixed(2) + "）與支撐線（下軌 " + bl.toFixed(2) + "）之間。", 0, c);
    }

    // BIAS
    const bias = IND.BIAS20[i];
    if (bias != null) {
      if (bias > 10) add("價格高於 20 日均價 +" + bias.toFixed(1) + "%", "sell", "價格比 20 日均價高 " + bias.toFixed(1) + "%，可能有回檔壓力。", 1, bias);
      else if (bias < -10) add("價格低於 20 日均價 " + bias.toFixed(1) + "%", "buy", "價格比 20 日均價低 " + Math.abs(bias).toFixed(1) + "%，可能有回補機會。", 1, bias);
      else add("價格與 20 日均價乖離正常（" + (bias >= 0 ? "+" : "") + bias.toFixed(1) + "%）", "neutral", "價格與 20 日均價距離幅度正常。", 0, bias);
    }

    // 成交量（VROC20：20日量比）
    const vroc = IND.VROC20 ? IND.VROC20[i] : null;
    if (vroc != null) {
      if (vroc > 30) {
        const isUp = c >= (i > 0 ? IND.rows[i-1].close : c);
        add("成交量明顯放大（比 20 日前 +" + vroc.toFixed(0) + "%）",
          isUp ? "buy" : "sell",
          isUp ? "量縮後放量且收漲，買盤活躍。" : "量縮後放量且收跌，賣壓明顯。", 1, vroc);
      } else if (vroc < -30) {
        add("成交量明顯萎縮（比 20 日前 " + vroc.toFixed(0) + "%）", "neutral",
          "成交明顯清淡，市場觀望。", 1, vroc);
      } else {
        add("成交量正常（量比 " + (vroc >= 0 ? "+" : "") + vroc.toFixed(0) + "%）", "neutral",
          "成交量與 20 日前相比沒有明顯變化。", 0, vroc);
      }
    }

    // 波動幅度（ATR）：#38 不進 sigList（永遠 neutral、權重 0 容易誤解偏多/偏空數），
    // 改放 statGrid「日平均擺動」與綜合卡「止損/止盈參考價」（index.html 端計算）。

    return s;
  }

  // #26 相關性降權：MACD 與 SMA 排列、KDJ 與 SMA5 翻上 高度相關，
  // 同時出現時降權，避免 double-count 放大方向。
  function applyCorrelationDiscount(signals) {
    const dir = x => x.state === "buy" || x.state === "sell";
    const hasMacd = signals.some(x => x.name.indexOf("MACD") === 0 && dir(x));
    const hasSma = signals.some(x => x.name.indexOf("均線") >= 0 && dir(x));
    const hasKdjCross = signals.some(x => /KDJ (金叉|死叉)/.test(x.name) && dir(x));
    const hasSma5Flip = signals.some(x => x.name.indexOf("5日") >= 0 && dir(x));
    if (hasMacd && hasSma) {
      for (const x of signals) {
        if (x.name.indexOf("均線") >= 0 && dir(x)) x.weight = Math.min(x.weight, 1);
      }
    }
    if (hasKdjCross && hasSma5Flip) {
      for (const x of signals) {
        if (/KDJ (金叉|死叉)/.test(x.name) && dir(x)) x.weight = Math.max(0.5, x.weight * 0.5);
      }
    }
    return signals;
  }

  // 技術面分數重設：訊號加「強度」，改 Σ(weight × dir) / Σ(weight)
  // - 分數分布不再被壓扁（舊版 net/max(8,...) 範圍被壓縮）
  // - 強度由 weight 直接表達（極端訊號 weight=2、中場 weight=1、中性 0）
  function compositeSignal(signals) {
    let buy = 0, sell = 0;
    for (const x of signals) {
      if (x.state === "buy") buy += x.weight;
      else if (x.state === "sell") sell += x.weight;
    }
    const total = buy + sell;
    const net = buy - sell;
    let tech_score;
    if (total === 0) tech_score = 0;
    else tech_score = Math.max(-1, Math.min(1, net / total));
    let advice;
    if (tech_score >= 0.5) advice = "目前偏多，適合逢低布局。";
    else if (tech_score >= 0.15) advice = "目前略偏多，可以小量試買。";
    else if (tech_score <= -0.5) advice = "目前偏空，建議降低風險。";
    else if (tech_score <= -0.15) advice = "目前略偏空，建議觀望或減碼。";
    else advice = "方向不明確，建議先觀望。";
    return { buy_score: Math.round(buy*10)/10, sell_score: Math.round(sell*10)/10,
      net: Math.round(net*10)/10, advice, tech_score: Math.round(tech_score*1000)/1000 };
  }

  // ─────────────────────────────────────────────────────────
  // 籌碼面（TWSE T86 三大法人）
  // ─────────────────────────────────────────────────────────
  // 跨域代理：非 https 來源（本地測試）直抓會被 CORS 擋，fallback 用
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";

  async function fetchTextSmart(url) {
    try {
      const r = await fetch(url);
      return await r.text();
    } catch (e) {
      const rr = await fetch(CORS_PROXY + encodeURIComponent(url));
      return await rr.text();
    }
  }

  async function fetchJsonSmart(url) {
    try {
      const r = await fetch(url);
      return await r.json();
    } catch (e) {
      const rr = await fetch(CORS_PROXY + encodeURIComponent(url));
      return await rr.json();
    }
  }

  async function fetchFundFlow() {
    try {
      const data = await fetchJsonSmart(
        "https://www.twse.com.tw/rwd/zh/fund/t86?step=1&response=json"
      );
      const rows = data.data || [];
      const fields = data.fields || [];
      const intOf = v => { const s = String(v).replace(",", "").trim(); return s === "-" || s === "" ? 0 : parseInt(s, 10) || 0; };
      const iT = fields.findIndex(f => f.includes("三大法人買賣超股數"));
      const iF = fields.findIndex(f => f.includes("外陸資買賣超股數"));
      const list = rows.map(row => ({
        ticker: String(row[0]).trim(), name: String(row[1]).trim(),
        total_net: intOf(row[iT]), foreign_net: intOf(row[iF])
      }));
      let buy = 0, sell = 0, sum = 0;
      for (const x of list) { if (x.total_net > 0) buy++; else if (x.total_net < 0) sell++; sum += x.total_net; }
      const total = buy + sell || 1;
      const ratio = buy / total;
      let score = (ratio - 0.5) * 2;
      if (sum > 0 && score > 0) score = Math.min(1, score + 0.1);
      else if (sum < 0 && score < 0) score = Math.max(-1, score - 0.1);
      score = Math.round(Math.max(-1, Math.min(1, score)) * 1000) / 1000;
      const label = score >= 0.25 ? "法人偏多" : score <= -0.25 ? "法人偏空" : "法人中性";
      return { ok: true, date: data.date, top_count: list.length,
        net_buy_count: buy, net_sell_count: sell, total_net_sum: sum,
        rows: list, score, label };
    } catch (e) { return { ok: false, err: String(e), score: 0, label: "取不到" }; }
  }

  // 籌碼面多日統計：抓最近 days 個交易日的 T86，統計全場法人「偏多/偏空」的天數與合計
  async function fetchFundFlowMulti(ticker, days) {
    days = days || 5;
    // 用加權指數交易歷史上推回交易日的 YYYYMMDD
    const dates = await fetchTradingDates(days);
    const results = [];
    for (const d of dates) {
      const ff = await fetchFundFlowDate(d);
      if (ff && ff.ok) {
        results.push(ff);
        const hit = ff.rows.find(r => r.ticker === String(ticker).padStart(6, "0"));
        ff.on_list = !!hit; ff.ticker_net = hit ? hit.total_net : null;
      }
    }
    if (!results.length) return { ok: false, days: 0 };
    const upDays = results.filter(r => r.total_net_sum > 0).length;
    const dnDays = results.filter(r => r.total_net_sum < 0).length;
    const avgTone = results.reduce((a, r) => a + r.score, 0) / results.length;
    // 個別股當榜次數
    const onListDays = results.filter(r => r.on_list).length;
    const tickerNetSum = results.reduce((a, r) => a + (r.ticker_net || 0), 0);
    // 外資連續淨買/淨賣天數（從最近一日往回数，依本股 ticker_net 方向連續）
    const tickerNets = results.map(r => r.ticker_net);
    let consec = 0;
    const lastDir = tickerNets[tickerNets.length - 1];
    if (lastDir != null) {
      const dirSign = lastDir > 0 ? 1 : -1;
      for (let k = tickerNets.length - 1; k >= 0; k--) {
        const v = tickerNets[k];
        if (v == null) continue;
        if (v * dirSign > 0) consec++;
        else break;
      }
    }
    const consecLabel = consec >= 5 ? "外資連續 " + consec + " 日淨買/賣（動能強）"
      : consec >= 3 ? "外資連續 " + consec + " 日同向操作"
      : consec >= 2 ? "外資連續 " + consec + " 日同向操作"
      : "外資未形成連續操作";
    const label = avgTone >= 0.2 ? "近期法人持續偏多"
      : avgTone <= -0.2 ? "近期法人持續偏空" : "近期法人多空交織";
    return {
      ok: true, days: results.length, up_days: upDays, down_days: dnDays,
      avg_tone: Math.round(avgTone * 1000) / 1000, label,
      ticker_on_list_days: onListDays, ticker_net_sum: tickerNetSum,
      ticker_consec: consec, ticker_consec_label: consecLabel,
      history: results.map(r => ({ date: r.date, total_net_sum: r.total_net_sum,
        ticker_net: r.ticker_net, label: r.label })),
      daily: results
    };
  }

  // 取最近 days 個交易日的 YYYYMMDD（用加權指數日K）
  async function fetchTradingDates(n) {
    let rows = null;
    // 優先用中繼抓 ^TWII（瀏覽器不噴 CORS 紅字）
    try {
      const rj = await fetchQuoteViaRelay("%5ETWII", "5d");
      if (rj && rj.chart) rows = rj;
    } catch (e) { rows = null; }
    // 中繼失敗才 fallback 直抓 / allorigins
    if (!rows) {
      try {
        rows = await fetchJsonSmart("https://query2.finance.yahoo.com/v8/finance/chart/%5ETWII?range=5d&interval=1d");
      } catch (e) { rows = null; }
    }
    if (!rows) return [];
    const res = rows.chart && rows.chart.result && rows.chart.result[0];
    if (!res) return [];
    return res.timestamp.slice(0, n).map(ts => {
      const d = new Date(ts * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return y + m + dd; // T86 要西元年 YYYYMMDD
    });
  }

  // 指定日期的 T86
  async function fetchFundFlowDate(mmdd) {
    try {
      const data = await fetchJsonSmart(
        "https://www.twse.com.tw/rwd/zh/fund/t86?step=1&response=json&date=" + mmdd
      );
      if (!data.data || !data.data.length) return { ok: false };
      const fields = data.fields || [];
      const intOf = v => { const s = String(v).replace(",", "").trim(); return s === "-" || s === "" ? 0 : parseInt(s, 10) || 0; };
      const iT = fields.findIndex(f => f.includes("三大法人買賣超股數"));
      const iF = fields.findIndex(f => f.includes("外陸資買賣超股數"));
      const list = data.data.map(row => ({
        ticker: String(row[0]).trim(), name: String(row[1]).trim(),
        total_net: intOf(row[iT]), foreign_net: intOf(row[iF])
      }));
      let buy = 0, sell = 0, sum = 0;
      for (const x of list) { if (x.total_net > 0) buy++; else if (x.total_net < 0) sell++; sum += x.total_net; }
      const total = buy + sell || 1;
      let score = (buy / total - 0.5) * 2;
      if (sum > 0 && score > 0) score = Math.min(1, score + 0.1);
      else if (sum < 0 && score < 0) score = Math.max(-1, score - 0.1);
      score = Math.round(Math.max(-1, Math.min(1, score)) * 1000) / 1000;
      return { ok: true, date: data.date, total_net_sum: sum, score,
        label: score >= 0.25 ? "偏多" : score <= -0.25 ? "偏空" : "中性", rows: list };
    } catch (e) { return { ok: false }; }
  }

  // 找個股是否當榜
  function tickerInFundFlow(ff, ticker) {
    if (!ff.ok) return { on_list: false, inst: null };
    const t = String(ticker).padStart(6, "0");
    const hit = ff.rows.find(r => r.ticker === t || r.ticker === String(ticker));
    return { on_list: !!hit, inst: hit || null };
  }

  // ─────────────────────────────────────────────────────────
  // 大盤環境（加權指數）
  // ─────────────────────────────────────────────────────────
  function fetchTaiexFromRows(rows) {
    if (!rows || rows.length < 2) return { ok: false, score: 0, direction: "無資料" };
    const today = rows[rows.length - 1].close;
    const prev = rows[rows.length - 2].close;
    const chg = (today - prev) / prev * 100;
    // 近 20 日日收益標準差 → 年化波動度（√252）
    let vol20 = null;
    if (rows.length >= 21) {
      const rets = [];
      for (let k = rows.length - 20; k < rows.length; k++) {
        rets.push((rows[k].close - rows[k - 1].close) / rows[k - 1].close);
      }
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
      vol20 = Math.sqrt(varr * 252) * 100;
    }
    let direction, score, advice;
    if (chg > 0.5) { direction = "大盤偏多"; score = 0.6; advice = "大盤當日明顯上漲，個股訊號較有效，可配合多單。"; }
    else if (chg < -0.5) { direction = "大盤偏空"; score = -0.6; advice = "大盤當日明顯下跌，個股難獨善其身，建議偏保守。"; }
    else if (chg > 0) { direction = "大盤略多"; score = 0.3; advice = "大盤小漲，環境溫和，可維持中性偏多。"; }
    else if (chg < 0) { direction = "大盤略空"; score = -0.3; advice = "大盤小跌，環境稍弱，注意回檔。"; }
    else { direction = "大盤盤整"; score = 0; advice = "大盤大致持平，環境中性，以個股訊號為主。"; }
    // 高波動日：技術面訊號噪音大，建議保守（降多單、加止損）
    if (vol20 != null && vol20 >= 30) advice += " 大盤近 20 日年化波動 " + vol20.toFixed(1) + "%，屬高波動區，訊號噪音較大，建議降低部位、以止損優先。";
    else if (vol20 != null && vol20 < 15) advice += " 大盤近 20 日年化波動 " + vol20.toFixed(1) + "%，屬低波動區，趨勢較明確，可較積極配合訊號。";
    return { ok: true, point: today, chg_pct: Math.round(chg * 100) / 100,
      date: rows[rows.length - 1].date, direction, advice, score,
      vol20: vol20 != null ? Math.round(vol20 * 10) / 10 : null };
  }

  // ─────────────────────────────────────────────────────────
  // 盤面（用日K估即時：現價/開盤/漲跌/量比/均線位置）
  // ─────────────────────────────────────────────────────────
  function intradayFromRows(rows, IND, i) {
    const r = rows[i];
    const last = r.close, open = r.open;
    const prev = i > 0 ? rows[i - 1].close : null;
    const chg = prev ? (last - prev) / prev * 100 : null;
    // 量比
    let vol_ratio = null;
    if (i >= 20) {
      let s = 0;
      for (let k = i - 19; k <= i; k++) s += rows[k].volume;
      const avg20 = s / 20;
      vol_ratio = avg20 > 0 ? Math.round(rows[i].volume / avg20 * 100) / 100 : null;
    }
    const sma20 = IND.SMA20[i], sma60 = IND.SMA60[i];
    const vs20 = sma20 ? (last >= sma20 ? "上方" : "下方") : "未知";
    const vs60 = sma60 ? (last >= sma60 ? "上方" : "下方") : "未知";
    let state = "資料不足";
    if (open && prev) {
      if (open > prev && last < open) state = "開高走低";
      else if (open < prev && last > open) state = "開低走高";
      else if (open > prev && last > open) state = "開高走高（偏強）";
      else if (open < prev && last < open) state = "開低走低（偏弱）";
      else state = "平開震盪";
    }
    let score = 0;
    if (chg != null) score += chg > 0 ? 0.3 : chg < 0 ? -0.3 : 0;
    if (vol_ratio != null) { if (vol_ratio > 1.2) score += 0.2; else if (vol_ratio < 0.7) score -= 0.1; }
    if (vs20 === "上方") score += 0.2; else if (vs20 === "下方") score -= 0.2;
    if (vs60 === "上方") score += 0.1; else if (vs60 === "下方") score -= 0.1;
    score = Math.round(Math.max(-1, Math.min(1, score)) * 1000) / 1000;
    const label = score >= 0.2 ? "盤面偏強" : score <= -0.2 ? "盤面偏弱" : "盤面中性";
    const advice = score >= 0.4 ? "盤面偏強：當天走勢與量能配合，支持持股或逢低布局。"
      : score <= -0.4 ? "盤面偏弱：當天走弱，建議觀望或降低風險。"
      : score >= 0.1 ? "盤面略偏強，量能尚可，可小量試水。"
      : score <= -0.1 ? "盤面略偏弱，建議謹慎。"
      : "盤面方向不明，等盤中確認再動作。";
    return { open, last, prev_close: prev, chg_pct: chg != null ? Math.round(chg * 100) / 100 : null,
      vol_ratio, vs_sma20: vs20, sma20, vs_sma60: vs60, sma60,
      price_state: state, advice, score, label };
  }

  // ─────────────────────────────────────────────────────────
  // 消息面情緒（關鍵字，可對標題陣列算）
  // ─────────────────────────────────────────────────────────
  const POS = ["利多","上線","飆高","成長","獲利","買超","創高","轉強","加碼","樂觀","看漲","上修","回穩","突破","利多","利多","利多","利多"];
  const NEG = ["利空","下跌","崩跌","虧損","賣超","創低","轉弱","悲觀","看跌","下修","回檔","跌破","警訊","減碼","風險"];
  const POS_EN = ["rally","bullish","gain","record high","beat","upgrade","buy","positive","growth","surge","rebound"];
  const NEG_EN = ["drop","bearish","loss","record low","miss","downgrade","sell","negative","decline","plunge","risk","crash"];

  function scoreHeadline(text) {
    const t = String(text).toLowerCase();
    let p = 0, n = 0;
    for (const w of POS) if (t.includes(w)) p++;
    for (const w of NEG) if (t.includes(w)) n++;
    for (const w of POS_EN) if (t.includes(w)) p++;
    for (const w of NEG_EN) if (t.includes(w)) n++;
    return { p, n };
  }

  function newsSentiment(headlines, days, ticker, stockName) {
    // headlines: 可為 string[] 或 {title,link}[]；ticker/stockName 提供時做「相關度過濾」（雜音標題降權）
    days = days || 7;
    let P = 0, N = 0, relevantCount = 0;
    const hasKey = ticker || stockName;
    for (const hRaw of headlines) {
      // 相容：純字串 或 {title,link}
      const h = (typeof hRaw === "string") ? hRaw : (hRaw.title || "");
      const s = scoreHeadline(h);
      // 相關度：標題含代號或名稱才算「相關」，否則降為 0.5 權重（雜音過濾）
      let w = 1;
      if (hasKey) {
        const hay = h.toLowerCase();
        const hasTicker = ticker ? hay.indexOf(String(ticker)) >= 0 : false;
        const hasName = stockName ? hay.indexOf(String(stockName)) >= 0 : false;
        if (!hasTicker && !hasName) { w = 0.5; } else { relevantCount++; }
      }
      P += s.p * w;
      N += s.n * w;
    }
    const total = P + N;
    let score = total === 0 ? 0 : (P - N) / total;
    // 相關新聞少於 3 則 → 情緒分數再打折（避免少數標題扭曲）
    if (hasKey && relevantCount < 3 && total > 0) score *= 0.7;
    score = Math.max(-1, Math.min(1, score));
    const label = score >= 0.25 ? "偏正面" : score <= -0.25 ? "偏負面" : "中性";
    const advice = score >= 0.25 ? "近期相關新聞偏正面，市場情緒較好。"
      : score <= -0.25 ? "近期相關新聞偏負面，注意消息面壓力。"
      : "近期相關新聞多空持平。";
    return { score: Math.round(score * 1000) / 1000, label, advice, days,
      pos: Math.round(P), neg: Math.round(N), count: headlines.length,
      relevant: relevantCount,
      // 保留原始 headlines（物件或字串），讓前端畫成可點擊連結
      headlines: headlines.slice() };
  }

  // 前端直抓 Google News RSS（瀏覽器直抓被 CORS 擋，走代理；多代理 fallback）
  const JINA_RSS = "https://r.jina.ai/";
  const ALLORIGINS = "https://api.allorigins.win/raw?url=";
  const CORSPROXY = "https://corsproxy.io/?url=";
  const THINGPROXY = "https://api.thingproxy.com/?url=";
  // 自家中繼：部署後填上你的 Cloudflare Worker URL（免金鑰、最穩）
  // 例：https://tw-news-relay.你的帳號.workers.dev/?q={encoded_query}&days=7
  // 留空則跳過此層（仍會走下方其他代理）
  const SELF_RELY_URL = "https://tw-news-relay.etonylin.workers.dev";
  // 行情中繼：同一個 Worker 加 ticker 參數抓 Yahoo chart JSON（CORS 已開）
  // 部署 deploy/cf-worker/relay.js 後，填同一個 URL 即可；留空則跳過
  const QUOTE_RELAY_URL = "https://tw-news-relay.etonylin.workers.dev";

  // 用行情中繼抓 Yahoo chart JSON（最穩、無瀏覽器 CORS 紅字）
  async function fetchQuoteViaRelay(code, period) {
    if (!QUOTE_RELAY_URL) return null;
    try {
      const r = await fetch(QUOTE_RELAY_URL + "?ticker=" + encodeURIComponent(code) +
        "&range=" + encodeURIComponent(period) + "&interval=1d");
      if (!r.ok) return null;
      const j = await r.json();
      if (j && j.ok === false) return null;
      if (j && j.chart) return j;   // 成功：回傳原始 chart JSON
      return null;
    } catch (e) { return null; }
  }

  // 代理抓 XML：成功回傳 XML 字串，失敗回傳 null（含重試）
  async function fetchViaProxy(prefix, target, retries) {
    for (let n = 0; n < (retries || 2); n++) {
      try {
        const r = await fetch(prefix + encodeURIComponent(target));
        if (r.ok) {
          const t = await r.text();
          if (t.indexOf("<rss") > 0 || t.indexOf("<item") > 0) return t;
        }
      } catch (e) {}
      if (n < (retries || 2) - 1) await new Promise(res => setTimeout(res, 800));
    }
    return null;
  }

  async function fetchNewsHeadlines(ticker, name, days) {
    days = days || 7;
    const q = encodeURIComponent((name || "") + " " + ticker);
    const url = "https://news.google.com/rss/search?q=" + q + "&hl=zh-TW&gl=TW&ce=zh";
    let text = null;
    // 1) 自家中繼（最穩，需填 SELF_RELY_URL）
    if (SELF_RELY_URL) {
      try {
        const sr = await fetch(SELF_RELY_URL + "?q=" + q + "&days=" + days);
        if (sr.ok) {
          const st = await sr.text();
          if (st.indexOf("<rss") > 0 || st.indexOf("<item") > 0 || st.indexOf('"title"') > 0) text = st;
        }
      } catch (e) {}
    }
    // 2) 直抓（本地 / 允許 CORS 的環境）
    if (!text) {
      try {
        const r = await fetch(url, { mode: "cors" });
        if (r.ok) { text = await r.text(); if (!text || text.indexOf("<rss") < 0) text = null; }
      } catch (e) { text = null; }
    }
    // 3) allorigins 代理（主力，重試 2 次）
    if (!text) text = await fetchViaProxy(ALLORIGINS, url, 2);
    // 4) thingproxy 代理（備援）
    if (!text) text = await fetchViaProxy(THINGPROXY, url, 1);
    // 5) corsproxy.io 代理（備援）
    if (!text) text = await fetchViaProxy(CORSPROXY, url, 1);
    // 6) Jina Reader 代理（最後 fallback，標準 GET）
    if (!text) {
      try {
        const jr = await fetch(JINA_RSS + url);
        if (jr.ok) {
          const jt = await jr.text();
          if (jt.indexOf("<item") > 0 || jt.indexOf("<title") > 0) text = jt;
        }
      } catch (e) {}
    }
    if (!text) {
      // 抓不到：回傳 null，讓 UI 顯示「暫時取不到」而非空白
      return null;
    }
    try {
      const doc = new DOMParser().parseFromString(text, "text/xml");
      const now = Date.now();
      const cutoff = now - (days || 7) * 86400000;
      const items = Array.from(doc.querySelectorAll("item")).map(it => {
        const tEl = it.querySelector("title");
        const title = tEl ? tEl.textContent.trim() : "";
        const lEl = it.querySelector("link");
        const link = lEl ? (lEl.textContent || "").trim() : "";
        const pEl = it.querySelector("pubDate");
        let ts = 0;
        if (pEl && pEl.textContent) ts = Date.parse(pEl.textContent);
        // pubDate 解析失敗（NaN）→ 視為「時間不明」，保留；
        // pubDate 有效 → 只保留近 days 天內的
        const keep = isNaN(ts) ? true : ts >= cutoff;
        return { title, link, ts, keep };
      }).filter(it => it.title && it.keep);
      if (items.length) return items.map(it => ({ title: it.title, link: it.link })).slice(0, 30);
      // fallback：cutoff 太嚴時，全部收（不filter）
      return Array.from(doc.querySelectorAll("item")).map(it => {
        const t = it.querySelector("title");
        const l = it.querySelector("link");
        return { title: t ? t.textContent.trim() : "", link: l ? (l.textContent || "").trim() : "" };
      }).filter(it => it.title).slice(0, 30);
    } catch (e) { return []; }
  }

  // ─────────────────────────────────────────────────────────
  // 交易日時段判定（TWSE 09:30–11:30 / 13:30–15:30，UTC+8）
  // ─────────────────────────────────────────────────────────
  function marketSession() {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const t = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ` +
              `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dow = now.getDay();
    // 簡化：只看 HH:MM 範圍；非交易日也能正常分析，僅標註「休市/未開盤」
    if (dow === 0 || dow === 6) return { code: "closed", label: "休市", t };
    if (t >= "09:00" && t < "09:30") return { code: "pre", label: "開盤前", t };
    if (t >= "09:30" && t < "13:30") return { code: "am", label: "盤中上午", t };
    if (t >= "13:30" && t < "15:30") return { code: "pm", label: "盤中下午", t };
    if (t >= "15:30") return { code: "post", label: "盤後", t };
    return { code: "pre", label: "未開盤", t };
  }

  // ─────────────────────────────────────────────────────────
  // 依分數 + 時段（開盤前/盤中/盤後）給白話行動建議
  // ─────────────────────────────────────────────────────────
  function actionForScore(score, session) {
    const s = Number(score);
    const inDay = session === "am" || session === "pm";
    if (s >= 0.4) {
      if (session === "pre") return "📈 開盤前 · 五方偏多：今天建議開盤觀察 15–30 分鐘，量能与走勢確認後可小量佈局，止損設在 ATR 線下方。";
      if (inDay)  return "📈 盤中 · 五方偏多：可逢低小量試買，注意量比 < 0.7 時先等等；已持股可續抱。";
      if (session === "post") return "📈 盤後 · 五方偏多：今天偏多訊號確認，明日開盤若未大幅跳空可續買或持股觀望。";
      return "📈 五方偏多：可考慮逢低佈局，止損設在 ATR 線下方。";
    }
    if (s >= 0.15) {
      if (session === "pre") return "🙂 開盤前 · 略偏多：今天建議開盤先看，未突破均線前不追價；有持股可續抱。";
      if (inDay)  return "🙂 盤中 · 略偏多：可小量試水，破 20 日均線或量比 < 0.5 先撤。";
      if (session === "post") return "🙂 盤後 · 略偏多：今天偏多未確認，明日開盤再決策，先觀望。";
      return "🙂 略偏多：可小量試買，注意破 20 日均線撤退。";
    }
    if (s > -0.15) {
      if (session === "pre") return "⚖️ 開盤前 · 五方中性：今天無明確方向，建議不動作、等訊號。";
      if (inDay)  return "⚖️ 盤中 · 中性：各面向拉鋸，不追不砍，持股續抱。";
      if (session === "post") return "⚖️ 盤後 · 中性：今日無方向，明日等訊號再決策。";
      return "⚖️ 五方中性：各方訊號拉鋸，建議先觀望、不動作。";
    }
    if (s > -0.4) {
      if (session === "pre") return "🟡 開盤前 · 略偏空：今天建議降低部位、不追價；有持股可部分兌現。";
      if (inDay)  return "🟡 盤中 · 略偏空：建議小量減碼或設止損，破關鍵均線先撤退。";
      if (session === "post") return "🟡 盤後 · 略偏空：今天偏空，明日開盤若未翻多先降低部位。";
      return "🟡 略偏空：建議謹慎、降低風險或減碼。";
    }
    if (session === "pre") return "🔴 開盤前 · 五方偏空：今天建議避險、不進場；有持股考慮減碼或避開開盤。";
    if (inDay)  return "🔴 盤中 · 五方偏空：建議避險或降低部位，不接弱反彈。";
    if (session === "post") return "🔴 盤後 · 五方偏空：今天偏空確認，明日開盤先看能否翻多再決策。";
    return "🔴 五方偏空：建議避險或等待轉強訊號。";
  }

  // ─────────────────────────────────────────────────────────
  // 五方綜合
  // ─────────────────────────────────────────────────────────
  function fiveWayComposite(comp, ff, intra, taiex, news, ctx) {
    ctx = ctx || {};
    const tech = comp.tech_score;
    const fScore = ff.score || 0;
    const newsScore = news ? news.score : 0;
    const iScore = intra.score || 0;
    const tScore = taiex.score || 0;
    // 方案 B 新權重：技術 40 / 籌碼 25 / 消息 10 / 盤面 10 / 大盤 15
    let wT = 0.40, wF = 0.25, wN = 0.10, wI = 0.10, wTa = 0.15;
    let note = "";

    // 籌碼面：外資連續淨買/賣 3 日以上加分（折進 fScore）
    let adjFF = fScore;
    if (ff.ticker_consec >= 3) {
      let boost = ff.ticker_consec >= 5 ? 0.25 : 0.15;
      // #4 金額絕對值加權：看「連續同向」+「當日 vs 5 日均值」
      const hist = (ff.history || []).filter(h => h.ticker_net != null);
      if (hist.length >= 2 && ff.ticker_consec >= 2) {
        const nets = hist.map(h => h.ticker_net);
        const avg5 = nets.reduce((a, b) => a + b, 0) / nets.length;
        const today = nets[nets.length - 1];
        const dirSign = today > 0 ? 1 : -1;
        if (avg5 !== 0 && Math.abs(today) > 0 && avg5 * dirSign > 0) {
          if (Math.abs(today) > Math.abs(avg5)) {
            boost = Math.min(0.4, boost + 0.1);
            note += "籌碼面：外資 " + ff.ticker_consec + " 日同向且當日放量，加權升為 +" + boost.toFixed(2) + "；";
          } else if (Math.abs(today) < Math.abs(avg5) * 0.5) {
            boost = Math.max(0, boost - 0.15);
            note += "籌碼面：外資 " + ff.ticker_consec + " 日同向但當日力道減弱，加權降為 +" + boost.toFixed(2) + "；";
          }
        }
      }
      adjFF = Math.max(1, fScore + boost);
      if (boost > 0) note += "籌碼面加權：分數 +" + boost.toFixed(2) + "；";
    }

    // 消息面：相關度過濾後（news.relevant 少）再降權
    if (news && news.count > 0 && news.relevant != null && news.relevant < 3) {
      wN = 0.05;
      note += "相關新聞少於 3 則，消息面權重降為 5%；";
    }

    // 大盤雙條件：加權 vs SMA20 + 單日漲跌（取代只看單日）
    let adjT = tScore;
    if (ctx.taiexSma20 != null && taiex.point != null) {
      const belowSma20 = taiex.point < ctx.taiexSma20;
      const drop = taiex.chg_pct != null && taiex.chg_pct < -0.5;
      const rise = taiex.chg_pct != null && taiex.chg_pct > 0.5;
      if (belowSma20 && drop) { adjT = Math.max(-1, tScore - 0.15); note += "加權收於 20 日均線下方且當日下跌，大盤分數再降 0.15；"; }
      else if (!belowSma20 && rise) { adjT = Math.min(1, tScore + 0.1); note += "加權收於 20 日均線上方且當日上漲，大盤分數上調 0.1；"; }
    }

    // 情境切換：系統性大跌/大漲日動態調權
    if (taiex.chg_pct != null && taiex.chg_pct <= -2.0) {
      wT = 0.30; wTa = 0.25; wF = 0.20; wN = 0.05; wI = 0.10;
      note += "系統性大跌日：權重 技30/籌20/消5/盤10/大25；";
    } else if (taiex.chg_pct != null && taiex.chg_pct >= 2.0) {
      wT = 0.45; wTa = 0.10; wF = 0.25; wN = 0.05; wI = 0.15;
      note += "系統性大漲日：權重 技45/籌25/消5/盤15/大10；";
    }

    // 盤面量能配速：收漲但量 < 0.5×20 日均量 → 盤面分數降
    let adjI = iScore;
    if (intra.chg_pct != null && intra.chg_pct > 0 && intra.vol_ratio != null && intra.vol_ratio < 0.5) {
      adjI = Math.max(-1, iScore - 0.15);
      note += "收漲但量能偏淡（量比 " + intra.vol_ratio.toFixed(2) + "），盤面分數調降；";
    }

    // 消息面失靈：把它的權重移轉給籌碼面（法人是最可靠訊號）
    if (news && news.failed) { wF = Math.min(1, wF + wN); wN = 0; }

    return _finishComposite(tech, adjFF, newsScore, adjI, adjT, wT, wF, wN, wI, wTa, news, note);
  }

  function _finishComposite(tech, fScore, newsScore, iScore, tScore, wT, wF, wN, wI, wTa, news, notes) {
    // 權重正規化（若 news.failed 移轉後總和可能超過 1）
    const wSum = wT + wF + wN + wI + wTa;
    if (wSum > 0) { wT /= wSum; wF /= wSum; wN /= wSum; wI /= wSum; wTa /= wSum; }
    let combined = Math.max(-1, Math.min(1,
      tech * wT + fScore * wF + newsScore * wN + iScore * wI + tScore * wTa));
    combined = Math.round(combined * 1000) / 1000;
    let final;
    if (combined >= 0.40) final = "五方綜合偏多：技術、籌碼、消息、盤面、大盤多偏向買方，今天可考慮逢低布局。";
    else if (combined >= 0.15) final = "五方綜合略偏多：整體稍有利多，今天可小量試買。";
    else if (combined > -0.15) final = "五方綜合中性：各方訊號互相拉鋸，今天建議先觀望、不動作。";
    else if (combined > -0.40) final = "五方綜合略偏空：整體稍偏空，今天建議謹慎、降低風險。";
    else final = "五方綜合偏空：技術、籌碼、消息、盤面、大盤多偏向賣方，今天建議避險或等待轉強訊號。";
    const ms = marketSession();
    return {
      final_advice: final, combined_score: combined,
      session: ms,
      action: actionForScore(combined, ms.code),
      score_breakdown: { "技術面": tech, "籌碼面": fScore, "消息面": newsScore,
        "盤面": iScore, "大盤": tScore, "綜合": combined },
      weights: { "技術面": wT, "籌碼面": wF, "消息面": wN, "盤面": wI, "大盤": wTa },
      adjustment_notes: notes ? notes : ""
    };
  }

  // ─────────────────────────────────────────────────────────
  // 一鍵整合：傳入個股日K，算出全部
  // ─────────────────────────────────────────────────────────
  async function computeAll(stockRows, opts) {
    opts = opts || {};
    const IND = computeIndicators(stockRows);
    const i = stockRows.length - 1;
    const signals = applyCorrelationDiscount(detectSignals(IND, i));
    const comp = compositeSignal(signals);

    const ff = opts.with_fund !== false ? await fetchFundFlow() : { ok: false, score: 0, label: "未啟用" };
    const tf = tickerInFundFlow(ff, opts.ticker);
    let taiex = { ok: false, score: 0, direction: "未啟用", advice: "" };
    if (opts.taiexRows) taiex = fetchTaiexFromRows(opts.taiexRows);
    const intra = intradayFromRows(stockRows, IND, i);

    // 大盤 SMA20（供綜合評估：加權收於 20 日均線下方時調降大盤分數）
    let taiexSma20 = null;
    if (opts.taiexRows && opts.taiexRows.length >= 20) {
      let s = 0;
      for (let k = opts.taiexRows.length - 20; k < opts.taiexRows.length; k++) s += opts.taiexRows[k].close;
      taiexSma20 = s / 20;
    }

    let news = null;
    if (opts.with_news) {
      const heads = await fetchNewsHeadlines(opts.ticker, opts.name, opts.news_days || 7);
      if (Array.isArray(heads) && heads.length) {
        news = newsSentiment(heads, opts.news_days || 7, opts.ticker, opts.name);
      } else if (heads === null) {
        // 代理失靈、抓不到：標記 news_failed 讓 UI 顯示「暫時取不到」
        news = { score: 0, label: "取不到", advice: "消息面暫時取不到（網路代理失靈），稍後重試。",
                 pos: 0, neg: 0, count: 0, days: (opts.news_days || 7), headlines: [], failed: true };
      }
    }

    const final = fiveWayComposite(comp, ff, intra, taiex, news,
      { taiexSma20 });

    const hist = hist5(stockRows, IND, 120);

    return {
      indicators: IND, signals, composite: comp, fund_flow: { ...ff, ...tf },
      taiex, intraday: intra, news, final, hist5: hist
    };
  }

  // 個股相對大盤強度：近 n 日個股 vs 加權涨跌幅，差值越大越強
  function relativeStrength(stockRows, taiexRows, n) {
    n = n || 20;
    if (!stockRows || !taiexRows || stockRows.length < 6 || taiexRows.length < 6) {
      return { ok: false };
    }
    // 用兩邊較短者為回看天數（至少 5 天），避免資料點數不一時算不出
    n = Math.min(n, stockRows.length, taiexRows.length);
    if (n < 5) return { ok: false };
    const sRet = (stockRows[stockRows.length - 1].close - stockRows[stockRows.length - n].close) /
                 stockRows[stockRows.length - n].close * 100;
    const iRet = (taiexRows[taiexRows.length - 1].close - taiexRows[taiexRows.length - n].close) /
                 taiexRows[taiexRows.length - n].close * 100;
    const diff = sRet - iRet;
    const label = diff > 5 ? "明顯跑贏大盤" : diff > 0 ? "略優於大盤"
      : diff < -5 ? "明顯落後大盤" : diff < 0 ? "略遜於大盤" : "與大盤持平";
    return { ok: true, stock_ret: Math.round(sRet * 100) / 100,
      taiex_ret: Math.round(iRet * 100) / 100,
      diff: Math.round(diff * 100) / 100, label,
      advice: diff > 5 ? "個股強於大盤，有獨強特性，可特別關注。"
        : diff > 0 ? "個股表現稍強於大盤。"
        : diff < -5 ? "個股弱於大盤，注意相對疲軟。"
        : diff < 0 ? "個股稍弱於大盤。" : "個股與大盤表現相當。" };
  }

  // 近期買賣時機：回看 lookback 日內的 KDJ 金/死叉、RSI 極端、5日翻 20日
  function findBuySellPoints(IND, rows, lookback) {
    lookback = lookback || 40;
    const n = rows.length;
    const start = Math.max(1, n - lookback);
    const ev = [];
    const K = IND.KDJ.K, D = IND.KDJ.D, R = IND.RSI;
    const S5 = IND.SMA5, S20 = IND.SMA20;
    for (let i = start; i < n; i++) {
      // KDJ 金叉（K 由下翻上 D）
      if (K[i] != null && D[i] != null && K[i - 1] != null && D[i - 1] != null) {
        if (K[i - 1] <= D[i - 1] && K[i] > D[i]) {
          ev.push({ date: rows[i].date, type: "buy", price: rows[i].close, description: "KDJ 金叉：冷熱指標由下翻上，短線可能反彈" });
        } else if (K[i - 1] >= D[i - 1] && K[i] < D[i]) {
          ev.push({ date: rows[i].date, type: "sell", price: rows[i].close, description: "KDJ 死叉：冷熱指標由上跌破，短線可能回檔" });
        }
      }
      // RSI 極端
      if (R[i] != null) {
        if (R[i] >= 75) ev.push({ date: rows[i].date, type: "sell", price: rows[i].close, description: "RSI=" + R[i].toFixed(0) + " 極度過熱，短線可能回調" });
        else if (R[i] <= 25) ev.push({ date: rows[i].date, type: "buy", price: rows[i].close, description: "RSI=" + R[i].toFixed(0) + " 極度過冷，短線可能反彈" });
      }
      // 5日翻 20日
      if (S5[i] != null && S20[i] != null && S5[i - 1] != null && S20[i - 1] != null) {
        if (S5[i - 1] <= S20[i - 1] && S5[i] > S20[i]) {
          ev.push({ date: rows[i].date, type: "buy", price: rows[i].close, description: "5 日均線翻上 20 日（金叉），中短線轉多" });
        } else if (S5[i - 1] >= S20[i - 1] && S5[i] < S20[i]) {
          ev.push({ date: rows[i].date, type: "sell", price: rows[i].close, description: "5 日均線跌破 20 日（死叉），中短線轉弱" });
        }
      }
    }
    // 新→舊排序
    ev.sort((a, b) => b.date.localeCompare(a.date));
    return ev;
  }

  // 暴露
  global.StockCore = {
    computeIndicators, detectSignals, compositeSignal, applyCorrelationDiscount,
    fetchFundFlow, fetchFundFlowMulti, fetchTradingDates, fetchFundFlowDate,
    tickerInFundFlow, fetchTaiexFromRows,
    intradayFromRows, newsSentiment, fetchNewsHeadlines, fetchQuoteViaRelay,
    relativeStrength, findBuySellPoints, hist5,
    fiveWayComposite, computeAll, scoreHeadline, marketSession, actionForScore
  };
})(typeof window !== "undefined" ? window : globalThis);
