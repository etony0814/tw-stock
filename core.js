    function histMid(rows, IND, lookback, winDays) {
      lookback = lookback || 180;
      winDays = winDays || 40;
      const closes = rows.map(r => r.close);
      const n = closes.length;
      // 自適應:回看窗 = min(lookback, n - winDays - 60),讓 6mo 資料也能算
      const avail = Math.max(0, n - winDays - 60);
      const start = Math.max(60, n - Math.min(lookback, avail || lookback));
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