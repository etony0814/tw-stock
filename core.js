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
    // BIAS20
    res.BIAS20 = c.map((x, i) => {
      const m = res.SMA20[i];
      return m == null ? null : (x - m) / m * 100;
    });
    return res;
  }

  // ─────────────────────────────────────────────────────────
  // 訊號引擎（白話名）
  // ─────────────────────────────────────────────────────────
  function detectSignals(IND, i) {
    // i = 最後一根索引
    const r = IND.rows[i];
    const c = r.close;
    const s = [];
    const add = (name, state, detail, weight, value) => s.push({ name, state, detail, weight: weight || 1, value: value != null ? value : null });

    // SMA 排列
    const s5 = IND.SMA5[i], s20 = IND.SMA20[i], s60 = IND.SMA60[i];
    if (s5 != null && s20 != null && s60 != null) {
      if (s5 > s20 && s20 > s60) add("5日均線翻上20日再翻上60日（強多排列）", "buy", "短期、中期、長期均線全翻紅，多頭排列。", 2, +s5.toFixed(2));
      else if (s5 < s20 && s20 < s60) add("5日、20日、60日均線全朝下（強空排列）", "sell", "均線全朝下，空頭排列。", 2, +s5.toFixed(2));
      else add("均線交纏", "neutral", "5日、20日、60日均線沒有明確排列。", 0, +s5.toFixed(2));
    }

    // MACD 交叉
    const ml = IND.MACD.line, ms = IND.MACD.signal;
    const macdV = ml[i] != null ? ml[i] : null;
    if (i > 0 && ml[i] != null && ms[i] != null && ml[i - 1] != null && ms[i - 1] != null) {
      if (ms[i - 1] <= ml[i - 1] && ms[i] > ml[i]) add("MACD金叉", "buy", "動能指標剛翻正，代表近期買盤增加。", 2, +macdV.toFixed(3));
      else if (ms[i - 1] >= ml[i - 1] && ms[i] < ml[i]) add("MACD死叉", "sell", "動能指標剛轉負，代表近期賣壓增加。", 2, +macdV.toFixed(3));
      else add("MACD 動能狀態", ml[i] > 0 ? "buy" : "sell", "動能指標為" + (ml[i] > 0 ? "正，代表近期偏多" : "負，代表近期偏空") + "。", 1, +macdV.toFixed(3));
    }

    // RSI
    const rsi = IND.RSI[i];
    if (rsi != null) {
      if (rsi >= 70) add("冷熱指數過熱（RSI ≥ 70）", "sell", "RSI=" + rsi.toFixed(1) + "，近期漲太快，短期可能調整。", 1, +rsi.toFixed(1));
      else if (rsi <= 30) add("冷熱指數過冷（RSI ≤ 30）", "buy", "RSI=" + rsi.toFixed(1) + "，近期跌太多，短期可能反彈。", 1, +rsi.toFixed(1));
      else add("冷熱指數中性", "neutral", "RSI=" + rsi.toFixed(1) + "，目前沒有明顯偏多或偏空。", 0, +rsi.toFixed(1));
    }

    // KDJ
    const kk = IND.KDJ.K[i], dd = IND.KDJ.D[i], jj = IND.KDJ.J[i];
    const kPrev = i > 0 ? IND.KDJ.K[i - 1] : null, dPrev = i > 0 ? IND.KDJ.D[i - 1] : null;
    if (jj != null && kk != null && dd != null) {
      if (jj < 0) add("KDJ極度過冷（J<0）", "buy", "J=" + jj.toFixed(1) + " 低於 0，短期跌得太凶，留意反彈機會。", 1, +jj.toFixed(1));
      else if (jj > 100) add("KDJ極度過熱（J>100）", "sell", "J=" + jj.toFixed(1) + " 高於 100，短期漲得太快，留意回檔風險。", 1, +jj.toFixed(1));
      else if (kPrev != null && dPrev != null && kPrev <= dPrev && kk > dd) add("KDJ金叉", "buy", "K 線翻越 D 線，短期偏多。", 1, +kk.toFixed(1));
      else if (kPrev != null && dPrev != null && kPrev >= dPrev && kk < dd) add("KDJ死叉", "sell", "K 線跌破 D 線，短期偏空。", 1, +kk.toFixed(1));
      else add("KDJ中性", "neutral", "K=" + kk.toFixed(1) + "、D=" + dd.toFixed(1) + "、J=" + jj.toFixed(1) + "。", 0, +jj.toFixed(1));
    }

    // BOLL
    const bu = IND.BOLL.upper[i], bl = IND.BOLL.lower[i];
    if (bu != null && bl != null) {
      if (c <= bl) add("跌破布林通道下軌", "buy", "收盤 " + c.toFixed(2) + " 低於下軌 " + bl.toFixed(2) + "，短期偏弱，留意反彈。", 1, +bl.toFixed(2));
      else if (c >= bu) add("突破布林通道上軌", "sell", "收盤 " + c.toFixed(2) + " 高於上軌 " + bu.toFixed(2) + "，短期偏強，留意回檔。", 1, +bu.toFixed(2));
      else {
        const widthPct = (bu - bl) > 0 ? ((bu - bl) / c * 100) : 0;
        add("布林通道位置", "neutral", "收盤 " + c.toFixed(2) + " 在通道內，通道寬度 " + widthPct.toFixed(1) + "%。", 0, +c.toFixed(2));
      }
    }

    // BIAS
    const bias = IND.BIAS20[i];
    if (bias != null) {
      if (bias > 10) add("偏離20日均價過大", "sell", "目前價格比 20 日均價 " + bias.toFixed(1) + "%，有回檔修正壓力。", 1, +bias.toFixed(1));
      else if (bias < -10) add("偏離20日均價過低", "buy", "目前價格比 20 日均價 " + bias.toFixed(1) + "%，有反彈修復需求。", 1, +bias.toFixed(1));
      else add("價格乖離正常", "neutral", "目前價格比 20 日均價 " + bias.toFixed(1) + "%。", 0, +bias.toFixed(1));
    }

    // 成交量（量比 20 日 VROC）
    if (i >= 20) {
      let v20 = 0;
      for (let kk2 = i - 20; kk2 < i; kk2++) v20 += IND.rows[kk2].volume;
      v20 /= 20;
      if (v20 > 0) {
        const prevVol = IND.rows[i - 1].volume;
        const vroc = ((IND.rows[i].volume - prevVol) / v20) * 100; // 簡化：量比 %
        const ratioPct = Math.round((IND.rows[i].volume / v20) * 100);
        if (ratioPct > 300) add("成交量明顯放大", "buy", "量比 20 日前放大了 " + (ratioPct - 100) + "%。", 1, +ratioPct);
        else if (ratioPct < 50) add("成交量明顯萎縮", "buy", "量比 20 日前萎縮了 " + (100 - ratioPct) + "%，市場觀望情緒重。", 1, +ratioPct);
      }
    }

    // 近期波動幅度（ATR）
    if (IND.ATR && IND.ATR[i] != null && c > 0) {
      const atr = IND.ATR[i];
      add("近期波動幅度", "neutral", "平均每日價差約 " + atr.toFixed(2) + "（約 " + (atr / c * 100).toFixed(1) + "%）。", 0, +atr.toFixed(2));
    }

    return s;
  }

  function compositeSignal(signals) {
    let buy = 0, sell = 0;
    for (const x of signals) {
      if (x.state === "buy") buy += x.weight;
      else if (x.state === "sell") sell += x.weight;
    }
    const net = buy - sell;
    let advice;
    if (net >= 4) advice = "目前偏多，適合逢低布局。";
    else if (net >= 1) advice = "目前略偏多，可以小量試買。";
    else if (net <= -4) advice = "目前偏空，建議降低風險。";
    else if (net <= -1) advice = "目前略偏空，建議觀望或減碼。";
    else advice = "方向不明確，建議先觀望。";
    return { buy_score: buy, sell_score: sell, net, advice,
      tech_score: net === 0 ? 0 : Math.max(-1, Math.min(1, net / Math.max(8, buy + sell))) };
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
    const label = avgTone >= 0.2 ? "近期法人持續偏多"
      : avgTone <= -0.2 ? "近期法人持續偏空" : "近期法人多空交織";
    return {
      ok: true, days: results.length, up_days: upDays, down_days: dnDays,
      avg_tone: Math.round(avgTone * 1000) / 1000, label,
      ticker_on_list_days: onListDays, ticker_net_sum: tickerNetSum,
      history: results.map(r => ({ date: r.date, total_net_sum: r.total_net_sum,
        ticker_net: r.ticker_net, label: r.label })),
      daily: results
    };
  }

  // 取最近 days 個交易日的 YYYYMMDD（用加權指數日K）
  async function fetchTradingDates(n) {
    try {
      const rows = await fetchJsonSmart(STOCK_URLS ? "https://query2.finance.yahoo.com/v8/finance/chart/%5ETWII?range=5d&interval=1d" : "https://query2.finance.yahoo.com/v8/finance/chart/%5ETWII?range=5d&interval=1d");
      const res = rows.chart && rows.chart.result && rows.chart.result[0];
      if (!res) return [];
      return res.timestamp.slice(0, n).map(ts => {
        const d = new Date(ts * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return y + m + dd; // T86 要西元年 YYYYMMDD
      });
    } catch (e) { return []; }
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
    // rows 為加權指數日K，最後一根=當日
    if (!rows || rows.length < 2) return { ok: false, score: 0, direction: "無資料" };
    const today = rows[rows.length - 1].close;
    const prev = rows[rows.length - 2].close;
    const chg = (today - prev) / prev * 100;
    let direction, score, advice;
    if (chg > 0.5) { direction = "大盤偏多"; score = 0.6; advice = "大盤當日明顯上漲，個股訊號較有效，可配合多單。"; }
    else if (chg < -0.5) { direction = "大盤偏空"; score = -0.6; advice = "大盤當日明顯下跌，個股難獨善其身，建議偏保守。"; }
    else if (chg > 0) { direction = "大盤略多"; score = 0.3; advice = "大盤小漲，環境溫和，可維持中性偏多。"; }
    else if (chg < 0) { direction = "大盤略空"; score = -0.3; advice = "大盤小跌，環境稍弱，注意回檔。"; }
    else { direction = "大盤盤整"; score = 0; advice = "大盤大致持平，環境中性，以個股訊號為主。"; }
    return { ok: true, point: today, chg_pct: Math.round(chg * 100) / 100,
      date: rows[rows.length - 1].date, direction, advice, score };
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

  function newsSentiment(headlines) {
    // headlines: string[]
    let P = 0, N = 0;
    for (const h of headlines) { const s = scoreHeadline(h); P += s.p; N += s.n; }
    const total = P + N;
    const score = total === 0 ? 0 : (P - N) / total;
    const label = score >= 0.25 ? "偏正面" : score <= -0.25 ? "偏負面" : "中性";
    const advice = score >= 0.25 ? "近期新聞偏正面，市場情緒較好。"
      : score <= -0.25 ? "近期新聞偏負面，注意消息面壓力。"
      : "近期新聞多空持平。";
    return { score: Math.round(score * 1000) / 1000, label, advice,
      pos: P, neg: N, count: headlines.length,
      headlines: headlines.slice(0, 15) };
  }

  // 前端直抓新聞:優先走 relay 的「新聞路由」(https://tw-news-relay.etonylin.workers.dev/?news=代號 回 Bing 新聞 RSS,可跨站),
  // 回退 Google News RSS 直抓(瀏覽器可跨站抓 XML);都抓不到回傳空陣列。
  async function fetchNewsHeadlines(ticker, name, days) {
    const q = encodeURIComponent((name || "") + " " + ticker);
    const gurl = "https://news.google.com/rss/search?q=" + q + "&hl=zh-TW&gl=TW&ce=zh";
    const parseRss = (text) => {
      const doc = new DOMParser().parseFromString(text, "text/xml");
      const titles = Array.from(doc.querySelectorAll("item"))
        .map(it => it.querySelector("title") ? it.querySelector("title").textContent.trim() : "");
      const now = Date.now();
      const cutoff = now - (days || 7) * 86400000;
      const dated = Array.from(doc.querySelectorAll("item")).map(it => ({
        title: it.querySelector("title") ? it.querySelector("title").textContent.trim() : "",
        ts: it.querySelector("pubDate") ? Date.parse(it.querySelector("pubDate").textContent) : 0
      })).filter(it => it.ts >= cutoff || it.ts === 0);
      const pick = dated.length ? dated.map(it => it.title) : titles;
      // 過濾掉「代號」「2330 - Bing新聞」這類非標題雜訊
      return pick.filter(t => t && t.length > 6 && t !== ticker && !/^- Bing新聞$/.test(t)).slice(0, 30);
    };
    try {
      // 1) relay 新聞路由(能跨站、穩定;?news=代號)
      const relay = "https://tw-news-relay.etonylin.workers.dev/?news=" + encodeURIComponent(ticker);
      const text = await fetchTextSmart(relay);
      const got = parseRss(text);
      if (got.length) return got;
      // 2) 回退 Google News RSS 直抓
      if (gurl) {
        try { const t2 = await fetchTextSmart(gurl); const g2 = parseRss(t2); if (g2.length) return g2; } catch (e) {}
      }
      return [];
    } catch (e) { return []; }
  }

  // ─────────────────────────────────────────────────────────
  // 五方綜合
  // ─────────────────────────────────────────────────────────
  function fiveWayComposite(comp, ff, intra, taiex, news, signals) {
    const tech = comp.tech_score;
    const fScore = ff.score || 0;
    const newsScore = news ? news.score : 0;
    const iScore = intra.score || 0;
    const tScore = taiex.score || 0;
    let combined = Math.max(-1, Math.min(1,
      tech * 0.4 + fScore * 0.15 + newsScore * 0.15 + iScore * 0.15 + tScore * 0.15));
    combined = Math.round(combined * 1000) / 1000;
    let final;
    if (combined >= 0.40) final = "五方綜合偏多：技術、籌碼、消息、盤面、大盤多偏向買方，今天可考慮逢低布局。";
    else if (combined >= 0.15) final = "五方綜合略偏多：整體稍有利多，今天可小量試買。";
    else if (combined > -0.15) final = "五方綜合中性：各方訊號互相拉鋸，今天建議先觀望、不動作。";
    else if (combined > -0.40) final = "五方綜合略偏空：整體稍偏空，今天建議謹慎、降低風險。";
    else final = "五方綜合偏空：技術、籌碼、消息、盤面、大盤多偏向賣方，今天建議避險或等待轉強訊號。";

    // 從五個面向各自萃取看多/看空理由
    const bull = [], bear = [];
    const techBull = signals ? signals.filter(s => s.state === "buy") : [];
    const techBear = signals ? signals.filter(s => s.state === "sell") : [];
    if (techBull.length) bull.push("【技術面】" + techBull.map(s => s.name).join("；"));
    if (techBear.length) bear.push("【技術面】" + techBear.map(s => s.name).join("；"));
    if (fScore >= 0.25) bull.push("【籌碼面】三大法人偏多（" + ff.label + "），當日全場淨買。");
    else if (fScore <= -0.25) bear.push("【籌碼面】三大法人偏空（" + ff.label + "），當日全場淨賣。");
    if (news && newsScore >= 0.2) bull.push("【消息面】近期新聞情緒偏正面（分數 " + newsScore.toFixed(2) + "）。");
    else if (news && newsScore <= -0.2) bear.push("【消息面】近期新聞情緒偏負面（分數 " + newsScore.toFixed(2) + "）。");
    if (iScore >= 0.2) bull.push("【盤面】" + intra.advice);
    else if (iScore <= -0.2) bear.push("【盤面】" + intra.advice);
    if (tScore >= 0.3) bull.push("【大盤】" + taiex.advice);
    else if (tScore <= -0.3) bear.push("【大盤】" + taiex.advice);
    if (!bull.length && !bear.length) bull.push("【綜合】各方訊號中性，無明確看多或看空偏斜。");

    return {
      final_advice: final, combined_score: combined,
      score_breakdown: { "技術面": tech, "籌碼面": fScore, "消息面": newsScore,
        "盤面": iScore, "大盤": tScore, "綜合": combined },
      weights: { "技術面": 0.4, "籌碼面": 0.15, "消息面": 0.15, "盤面": 0.15, "大盤": 0.15 },
      bull_reasons: bull, bear_reasons: bear
    };
  }

  // ─────────────────────────────────────────────────────────
  // 一鍵整合：傳入個股日K，算出全部
  // ─────────────────────────────────────────────────────────
  async function computeAll(stockRows, opts) {
    opts = opts || {};
    const IND = computeIndicators(stockRows);
    const i = stockRows.length - 1;
    const signals = detectSignals(IND, i);
    const comp = compositeSignal(signals);

    // 若呼叫端已「並行抓好」籌碼全場榜單 / 新聞,就直接用,不重抓(省時間)
    let ff;
    if (opts.prec_fund != null) ff = opts.prec_fund;
    else ff = opts.with_fund !== false ? await fetchFundFlow() : { ok: false, score: 0, label: "未啟用" };
    const tf = tickerInFundFlow(ff, opts.ticker);
    let taiex = { ok: false, score: 0, direction: "未啟用", advice: "" };
    if (opts.taiexRows) taiex = fetchTaiexFromRows(opts.taiexRows);
    const intra = intradayFromRows(stockRows, IND, i);

    let news = null;
    if (opts.prec_news != null) {
      news = opts.prec_news; // 呼叫端已並行抓好 + 算好 sentiment
    } else if (opts.with_news) {
      const heads = await fetchNewsHeadlines(opts.ticker, opts.name, opts.news_days || 7);
      if (heads.length) news = newsSentiment(heads);
    }

    const final = fiveWayComposite(comp, ff, intra, taiex, news, signals);

    return {
      indicators: IND, signals, composite: comp, fund_flow: { ...ff, ...tf },
      taiex, intraday: intra, news, final
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


  // ─────────────────────────────────────────────────────────
  // 缺失補全:marketSession / actionForScore / slTp / hist5 / 中期引擎
  // ─────────────────────────────────────────────────────────
  function marketSession() {
    // 台股交易時段
    const now = new Date();
    // 台北時間(UTC+8):取本地小時 + 分鐘,但若系統設成 UTC 則需補 9 小時偏移
    // 直接用 Intl API 取台北時間,避免跨時區誤判
    let hhmm = 0;
    try {
      const parts = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
      const h = parseInt(parts.find(p => p.type === 'hour').value, 10) || 0;
      const mi = parseInt(parts.find(p => p.type === 'minute').value, 10) || 0;
      hhmm = h * 100 + mi;
    } catch (e) {
      hhmm = now.getUTCHours() * 100 + now.getUTCMinutes();
    }
    let code = 'closed', label = '收盤';
    if (hhmm >= 900 && hhmm < 930) { code = 'pre'; label = '盤前'; }
    else if (hhmm >= 930 && hhmm < 1130) { code = 'am'; label = '上午盤'; }
    else if (hhmm >= 1130 && hhmm < 1300) { code = 'lunch'; label = '午休'; }
    else if (hhmm >= 1300 && hhmm < 1430) { code = 'pm'; label = '下午盤'; }
    else if (hhmm >= 1430 && hhmm < 1500) { code = 'after'; label = '盤後'; }
    else { code = 'closed'; label = '收盤'; }
    return { code: code, label: label, hhmm: hhmm };
  }

  function actionForScore(techScore, sessionCode) {
    // 短線白話行動建議
    const s = techScore == null ? 0 : techScore;
    if (s >= 0.5) return '短線偏多,可逢低布局。';
    if (s >= 0.2) return '短線略偏多,可小量試進。';
    if (s <= -0.5) return '短線偏空,建議減碼或觀望。';
    if (s <= -0.2) return '短線略偏空,建議觀望。';
    return '短線方向不明,建議觀望。';
  }

  function slTp(close, atr) {
    // 短線止損 / 獲利目標(1.5 × ATR)
    if (close == null || atr == null) return null;
    return { stop: +(close - 1.5 * atr).toFixed(2), target: +(close + 1.5 * atr).toFixed(2), atr: +atr.toFixed(2) };
  }

  function slTpForHorizon(close, atr, horizon) {
    const mult = { short: 1.5, mid40: 4, mid60: 5 };
    const m = mult[horizon] != null ? mult[horizon] : 1.5;
    if (close == null || atr == null) return null;
    // sl=止損、tp1/tp2=兩檔止盈;保留 stop/target 供 server 端相容
return {
  horizon: horizon, mult: m,
  sl: +(close - m * atr).toFixed(2),
  tp1: +(close + m * atr).toFixed(2),
  tp2: +(close + 2 * m * atr).toFixed(2),
  stop: +(close - m * atr).toFixed(2),
  target: +(close + m * atr).toFixed(2)
};
  }

  function hist5(rows, IND, lookback) {
    // 5 日勝率
    lookback = lookback || 60;
    const closes = rows.map(r => r.close);
    const n = closes.length;
    const start = Math.max(5, n - lookback);
    let win = 0, tot = 0;
    for (let i = start; i < n - 5; i++) {
      const sigs = detectSignals(IND, i);
      const comp = compositeSignal(sigs);
      if (comp.tech_score >= 0.2 || comp.tech_score <= -0.2) {
        tot++;
        const future = closes[i + 5];
        if (future == null) { tot--; continue; }
        if ((comp.tech_score > 0 && future > closes[i]) || (comp.tech_score < 0 && future < closes[i])) win++;
      }
    }
    const rate = tot ? Math.round(win / tot * 1000) / 10 : null;
    return { up_rate: rate, sample_n: tot };
  }

  function histMid(rows, IND, lookback, winDays) {
    lookback = lookback || 180;
    winDays = winDays || 40;
    const closes = rows.map(r => r.close);
    const n = closes.length;
    // 自適應:回看窗 = min(lookback, n - winDays - 5),讓 1y 資料能算 40/60 日
    // 起點起碼要 winDays+5 根(讓 SMA60 等指標有足夠歷史),不能硬卡 60 根
    const avail = Math.max(0, n - winDays - 5);
    const start = Math.max(winDays + 5, n - Math.min(lookback, avail || lookback));
    let upN = 0, upW = 0, dnN = 0, dnW = 0;
    for (let i = start; i < n - winDays; i++) {
      let mid;
      try { mid = detectMidSignals(IND, i); } catch (e) { continue; }
      const score = mid ? mid.mid_score : 0;
      const future = closes[i + winDays];
      if (future == null) continue;
      if (score >= 0.2) { upN++; if (future > closes[i]) upW++; }
      else if (score <= -0.2) { dnN++; if (future < closes[i]) dnW++; }
    }
    const upRate = upN ? upW / upN : null;
    const dnRate = dnN ? dnW / dnN : null;
    const upPct = upRate != null ? Math.round(upRate * 1000) / 10 : null;
    const dnPct = dnRate != null ? Math.round(dnRate * 1000) / 10 : null;
    const good = (upPct || 0) >= 55 || (dnPct || 0) >= 55;
    return {
      win_days: winDays, up_n: upN, up_win: upW, up_rate: upPct,
      down_n: dnN, down_win: dnW, down_rate: dnPct,
      sample_n: upN + dnN, ok: good
    };
  }

  function volConfirm(IND, i) {
    const v = IND.rows.map(r => r.volume);
    if (i < 20) return null;
    let v5 = 0, v20 = 0;
    for (let k = i - 4; k <= i; k++) v5 += v[k];
    v5 /= 5;
    for (let k = i - 19; k <= i; k++) v20 += v[k];
    v20 /= 20;
    return v20 > 0 ? v5 / v20 : null;
  }

  function midClassify(techScore, close, sma60, vcf) {
    const above = sma60 == null ? null : close >= sma60;
    const bull = techScore >= 0.2;
    const bear = techScore <= -0.2;
    const volOk = vcf == null || vcf >= 0.8;
    if (above === true && bull) return volOk ? 'multi' : 'dip';
    if (above === false && bear) return 'weak';
    if (above === false && bull) return 'bear_rebound';
    return 'neutral';
  }

  function detectMidSignals(IND, i) {
    const r = IND.rows[i];
    const close = r.close;
    const s = [];
    const sma60 = IND.SMA60[i];
    const vcf = volConfirm(IND, i);
    let techScore = 0;
    const sigs = detectSignals(IND, i);
    for (const x of sigs) {
      let w = x.weight;
      if (x.state === 'sell') w = w * 0.6;
      techScore += x.state === 'buy' ? w : (x.state === 'sell' ? -w : 0);
    }
    techScore = Math.max(-1, Math.min(1, techScore / 8));
    const aboveSma60 = sma60 == null ? null : close >= sma60;
    let midScore = techScore;
    let midFilter = 'none';
    if (aboveSma60 === false && techScore > 0) { midScore = techScore * 0.6; midFilter = 'below_sma60_discount'; }
    if (vcf != null && vcf < 0.8 && techScore > 0) { midScore = midScore * 0.8; midFilter = 'low_volume_discount'; }
    const midClass = midClassify(techScore, close, sma60, vcf);
    let midBearAlert = null;
    if (aboveSma60 === false && techScore <= -0.2) {
      midBearAlert = { level: 'strong', text: '收盤低於 60 日均線且技術面偏空,中期趨勢偏弱,建議降低部位。' };
    } else if (aboveSma60 === true && techScore > 0 && vcf != null && vcf < 0.8) {
      midBearAlert = { level: 'weak', text: '量能不足,多頭訊號未確認,建議不追高。' };
    }
    const advice = midActionForScore(midScore, midClass);
    return { signals: s, tech_score: +techScore.toFixed(3), mid_score: +midScore.toFixed(3), mid_filter: midFilter, mid_class: midClass, mid_bear_alert: midBearAlert, sma60: sma60 != null ? +sma60.toFixed(2) : null, vol_ratio5_20: vcf != null ? +vcf.toFixed(2) : null, above_sma60: aboveSma60, advice: advice };
  }

  function midActionForScore(score, midClass) {
    if (score >= 0.5) return '中期偏多,適合逢低分批布局,持有 2-3 個月。';
    if (score >= 0.2) return '中期略偏多,可小量試進,留意量能不追高。';
    if (score <= -0.5) return '中期偏空,建議先減碼或觀望,不適合進場。';
    if (score <= -0.2) return '中期略偏空,建議觀望或降低部位。';
    if (midClass === 'multi') return '多頭排列確認,可持股,止損設於 60 日均線下方。';
    if (midClass === 'dip') return '回檔到 60 日均線附近,留意止跌訊號再進。';
    if (midClass === 'weak') return '空頭排列,中期偏空,避免接刀。';
    if (midClass === 'bear_rebound') return '空頭反彈,僅適合短線,不建議持有 2-3 個月。';
    return '方向不明確,建議先觀望,等量價與均線確認。';
  }

  function midFiveWayComposite(tech, fund, taiex, news, intra) {
    const clamp = v => v == null ? 0 : Math.max(-1, Math.min(1, v));
    const t = clamp(tech), f = clamp(fund), e = clamp(taiex), n = clamp(news), i = clamp(intra);
    const score = t * 0.40 + f * 0.25 + e * 0.20 + n * 0.10 + i * 0.05;
    let label;
    if (score >= 0.4) label = '中期強多';
    else if (score >= 0.15) label = '中期偏多';
    else if (score <= -0.4) label = '中期強空';
    else if (score <= -0.15) label = '中期偏空';
    else label = '中期中性';
    return { tech: t, fund: f, taiex: e, news: n, intra: i, score: +score.toFixed(3), label: label };
  }

  // 暴露
  global.StockCore = {
    computeIndicators, detectSignals, compositeSignal,
    fetchFundFlow, fetchFundFlowMulti, fetchTradingDates, fetchFundFlowDate,
    tickerInFundFlow, fetchTaiexFromRows,
    intradayFromRows, newsSentiment, fetchNewsHeadlines,
    relativeStrength, findBuySellPoints,
    fiveWayComposite, computeAll, scoreHeadline,
    marketSession, actionForScore, slTp, slTpForHorizon,
    hist5, histMid, volConfirm, detectMidSignals, midClassify, midFiveWayComposite, midActionForScore
  };
})(typeof window !== "undefined" ? window : globalThis);
