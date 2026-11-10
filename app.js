(() => {
  'use strict';

  /* =========================================================
     常量与数据模型
     ========================================================= */
  const STORE_KEY = 'xiaozhangben.v1';
  const APP_VERSION = '1.0.2';

  const GROUPS = {
    ai: { key: 'ai', name: 'AI / 开发', color: '#5B5BD6', soft: '#EEF0FF' },
    life: { key: 'life', name: '生活', color: '#0E9F6E', soft: '#E7F7F0' },
  };

  const CATEGORIES = [
    { id: 'ai-tools', group: 'ai', name: 'AI 工具', emoji: '🤖' },
    { id: 'dev-cloud', group: 'ai', name: '开发服务', emoji: '☁️' },
    { id: 'learn', group: 'ai', name: '学习资料', emoji: '📚' },
    { id: 'hardware', group: 'ai', name: '硬件设备', emoji: '💻' },
    { id: 'ai-other', group: 'ai', name: '其他 (AI)', emoji: '🧩' },
    { id: 'food', group: 'life', name: '餐饮', emoji: '🍜' },
    { id: 'transport', group: 'life', name: '交通', emoji: '🚌' },
    { id: 'groceries', group: 'life', name: '买菜日用', emoji: '🛒' },
    { id: 'fun', group: 'life', name: '娱乐', emoji: '🎮' },
    { id: 'home', group: 'life', name: '住房水电', emoji: '🏠' },
    { id: 'health', group: 'life', name: '医疗健康', emoji: '💊' },
    { id: 'shopping', group: 'life', name: '购物', emoji: '🛍️' },
    { id: 'life-other', group: 'life', name: '其他 (生活)', emoji: '📦' },
  ];
  const CAT_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* =========================================================
     小工具
     ========================================================= */
  const pad2 = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayStr = () => dateStr(new Date());
  const currentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  };
  const monthOf = (date) => date.slice(0, 7);

  function parseYMD(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${y}年${m}月`;
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  }

  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  function fmtMoney(value, forceDecimals = false) {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    return n.toLocaleString('zh-CN', forceDecimals
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 2 });
  }

  const fmtPlain = (value) => String(Math.round((Number(value) || 0) * 100) / 100);
  const cents = (value) => Math.round((Number(value) || 0) * 100);
  const fromCents = (value) => value / 100;

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function uid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseAmount(raw) {
    const s = String(raw == null ? '' : raw)
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[¥￥,，\s]/g, '')
      .replace(/[。．]/g, '.');
    if (!s || !/\d/.test(s)) return 0;
    if (!/^\d*(\.\d{0,2})?$/.test(s)) return 0;
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0 || n > 9999999) return 0;
    return Math.round(n * 100) / 100;
  }

  /* =========================================================
     本地存储
     ========================================================= */
  function defaultDB() {
    return {
      version: 1,
      createdAt: Date.now(),
      settings: { aiBudget: 500, lifeBudget: 2000, lastCat: 'ai-tools' },
      txs: [],
    };
  }

  function clampBudget(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(10000000, Math.round(n));
  }

  function normalizeDB(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.txs)) return null;
    const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const settings = {
      aiBudget: clampBudget(rawSettings.aiBudget, 500),
      lifeBudget: clampBudget(rawSettings.lifeBudget, 2000),
      lastCat: CAT_MAP.has(rawSettings.lastCat) ? rawSettings.lastCat : 'ai-tools',
    };
    const txs = [];
    const seenIds = new Set();
    for (const item of raw.txs) {
      if (!item || typeof item !== 'object') continue;
      const amount = Math.round((Number(item.amount) || 0) * 100) / 100;
      if (!(amount > 0) || amount > 9999999) continue;
      if (!parseYMD(item.date)) continue;
      const cat = CAT_MAP.has(item.cat) ? item.cat : (item.group === 'ai' ? 'ai-other' : 'life-other');
      let id = typeof item.id === 'string' && item.id ? item.id : uid();
      if (seenIds.has(id)) id = uid();
      seenIds.add(id);
      txs.push({
        id,
        date: item.date,
        cat,
        amount,
        note: typeof item.note === 'string' ? item.note.slice(0, 50) : '',
        createdAt: Number(item.createdAt) || 0,
      });
    }
    return {
      version: 1,
      createdAt: Number(raw.createdAt) || Date.now(),
      settings,
      txs,
    };
  }

  let loadWarning = '';

  function loadDB() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (err) {
      console.warn('浏览器存储不可用', err);
      loadWarning = '浏览器存储不可用，本次记录可能无法保存';
      return defaultDB();
    }
    if (!raw) return defaultDB();
    try {
      const normalized = normalizeDB(JSON.parse(raw));
      if (!normalized) throw new Error('数据格式不正确');
      return normalized;
    } catch (err) {
      console.warn('读取本地数据失败，已保留原始副本', err);
      let backedUp = false;
      try {
        localStorage.setItem(`${STORE_KEY}.corrupt`, raw);
        backedUp = true;
      } catch (e) {
        console.warn('保留原始副本失败', e);
      }
      loadWarning = backedUp
        ? '本地数据读取异常，原始数据已暂存；请到「设置」导出原始数据后再继续记账'
        : '本地数据读取异常，且原始数据暂存失败；请先不要清理浏览器数据';
      return defaultDB();
    }
  }

  function corruptBackupRaw() {
    try {
      return localStorage.getItem(`${STORE_KEY}.corrupt`);
    } catch (err) {
      return null;
    }
  }

  function saveDB() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
      return true;
    } catch (err) {
      console.warn('写入本地数据失败', err);
      return false;
    }
  }

  const SAVE_FAIL_MSG = '保存失败：浏览器存储空间不足，请先导出备份再试一次';

  /* =========================================================
     运行状态
     ========================================================= */
  let db = loadDB();
  let view = 'home';
  let month = currentMonth();
  let listFilter = 'all';
  let entryCat = db.settings.lastCat || 'ai-tools';
  let editingId = null;
  let editCat = null;
  let confirmResolve = null;
  let toastTimer = null;

  const catOf = (id) => CAT_MAP.get(id) || CAT_MAP.get('life-other');

  /* =========================================================
     数据计算
     ========================================================= */
  function monthTxs(ym) {
    return db.txs.filter((t) => t.date.slice(0, 7) === ym);
  }

  function sumByGroup(txs) {
    let ai = 0;
    let life = 0;
    for (const t of txs) {
      if (catOf(t.cat).group === 'ai') ai += cents(t.amount);
      else life += cents(t.amount);
    }
    return { ai: fromCents(ai), life: fromCents(life), total: fromCents(ai + life) };
  }

  const txSort = (a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);

  function daysLeftInMonth(ym) {
    if (ym !== currentMonth()) return 0;
    return Math.max(0, daysInMonth(ym) - new Date().getDate());
  }

  function defaultEntryDate() {
    if (month === currentMonth()) return todayStr();
    return `${month}-${pad2(daysInMonth(month))}`;
  }

  /* =========================================================
     渲染：公共
     ========================================================= */
  function chipHTML(c) {
    const on = entryCat === c.id;
    return `<button type="button" class="chip${on ? ' is-selected' : ''}" data-cat="${c.id}" data-group="${c.group}" aria-pressed="${on}"><span class="chip-emoji">${c.emoji}</span>${c.name}</button>`;
  }

  function txRowHTML(t) {
    const c = catOf(t.cat);
    const g = GROUPS[c.group];
    const d = parseYMD(t.date);
    const dateText = d ? `${d.getMonth() + 1}月${d.getDate()}日` : t.date;
    const title = t.note ? t.note : c.name;
    const sub = t.note ? `${c.name} · ${dateText}` : dateText;
    return `<button type="button" class="tx-row" data-action="edit-tx" data-id="${escapeHTML(t.id)}" aria-label="编辑 ${escapeHTML(title)}，${fmtMoney(t.amount)} 元">
      <span class="tx-emoji" style="background:${g.soft}">${c.emoji}</span>
      <span class="tx-main"><span class="tx-name">${escapeHTML(title)}</span><span class="tx-sub">${escapeHTML(sub)}</span></span>
      <span class="tx-amount ${c.group}">-¥${fmtMoney(t.amount)}</span>
    </button>`;
  }

  function emptyHTML(emoji, title, sub) {
    return `<div class="empty"><span class="empty-emoji">${emoji}</span><p class="empty-title">${escapeHTML(title)}</p><p class="empty-sub">${escapeHTML(sub)}</p></div>`;
  }

  function budgetCard(key, spent, budget, remainingDays) {
    const g = GROUPS[key];
    const has = Number(budget) > 0;
    const pctNum = has ? (spent / budget) * 100 : 0;
    const pct = Math.round(pctNum);
    const over = has && spent > budget;
    const near = has && !over && pctNum >= 90;
    const barColor = over ? 'var(--danger)' : near ? 'var(--warn)' : g.color;

    let foot;
    if (!has) {
      foot = '还没设置预算，去「设置」里填一个';
    } else if (over) {
      foot = `已超支 ¥${fmtMoney(spent - budget)}`;
    } else {
      const remain = budget - spent;
      foot = `还剩 ¥${fmtMoney(remain)}`;
      if (remainingDays > 0 && key === 'life') foot += ` · 日均可用 ¥${fmtMoney(remain / remainingDays)}`;
      else if (remainingDays > 0) foot += ` · 本月还剩 ${remainingDays} 天`;
    }

    return `<section class="budget-card ${key}${over ? ' is-over' : ''}${near ? ' is-near' : ''}">
      <div class="budget-head"><span class="budget-name"><i class="dot ${key}"></i>${g.name}</span><span class="budget-pct">${has ? `${pct}%` : '—'}</span></div>
      <div class="budget-nums"><strong>¥${fmtMoney(spent)}</strong><span>/ ¥${fmtMoney(budget)}</span></div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, pct)}" aria-label="${g.name}预算使用"><i style="width:${Math.min(100, Math.max(0, pctNum))}%;background:${barColor}"></i></div>
      <p class="budget-foot">${foot}</p>
    </section>`;
  }

  /* =========================================================
     渲染：首页（记账）
     ========================================================= */
  function renderHome() {
    const txs = monthTxs(month);
    const t = sumByGroup(txs);
    const s = db.settings;
    const recent = txs.slice().sort(txSort).slice(0, 3);
    const remainingDays = daysLeftInMonth(month);
    const headHint = month === currentMonth()
      ? `今天 ${new Date().getMonth() + 1}月${new Date().getDate()}日`
      : monthLabel(month);

    document.getElementById('view-home').innerHTML = `
      <section class="hero">
        <div class="hero-head"><span>${monthLabel(month)}总支出</span><span class="hero-count">${txs.length ? `${txs.length} 笔` : '还没有记录'}</span></div>
        <div class="hero-total"><span>¥</span>${fmtMoney(t.total)}</div>
        <div class="hero-split">
          <span class="hero-split-item"><i class="dot ai"></i>AI / 开发 <b>¥${fmtMoney(t.ai)}</b></span>
          <span class="hero-split-item"><i class="dot life"></i>生活 <b>¥${fmtMoney(t.life)}</b></span>
        </div>
      </section>

      <section class="card entry">
        <div class="card-head">
          <h2 class="card-title">记一笔</h2>
          <span class="hint">${headHint}</span>
        </div>
        <div class="amount-row">
          <span class="currency">¥</span>
          <input id="amount" class="amount-input" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0.00" aria-label="金额">
        </div>
        <div class="cat-groups">
          ${['ai', 'life'].map((g) => `
            <div class="cat-group">
              <span class="group-label ${g}">${GROUPS[g].name}</span>
              <div class="chips">${CATEGORIES.filter((c) => c.group === g).map(chipHTML).join('')}</div>
            </div>`).join('')}
        </div>
        <div class="entry-meta">
          <input id="note" class="text-input" type="text" maxlength="50" placeholder="备注（可选）" autocomplete="off" aria-label="备注">
          <input id="entryDate" class="date-input" type="date" value="${defaultEntryDate()}" aria-label="日期">
        </div>
        <button class="primary-btn" data-action="save-tx">记一笔</button>
      </section>

      <div class="budget-grid">
        ${budgetCard('ai', t.ai, s.aiBudget, remainingDays)}
        ${budgetCard('life', t.life, s.lifeBudget, remainingDays)}
      </div>

      <section class="card">
        <div class="card-head">
          <h2 class="card-title">最近记录</h2>
          <button type="button" class="link-btn" data-action="goto-list">全部 ›</button>
        </div>
        ${recent.length ? `<div class="tx-list">${recent.map(txRowHTML).join('')}</div>` : emptyHTML('🧾', '这个月还没有记录', '在上面记一笔，钱花到哪儿就清楚了')}
      </section>`;
  }

  /* =========================================================
     渲染：明细
     ========================================================= */
  const FILTERS = [
    ['all', '全部'],
    ['ai', 'AI / 开发'],
    ['life', '生活'],
  ];

  function renderList() {
    let txs = monthTxs(month);
    if (listFilter !== 'all') txs = txs.filter((t) => catOf(t.cat).group === listFilter);
    txs.sort(txSort);
    const total = sumByGroup(txs).total;

    const groups = new Map();
    for (const t of txs) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    }

    let body = '';
    if (!txs.length) {
      body = emptyHTML('🗂️', '这个月没有记录', listFilter === 'all' ? '换个分类筛选，或者先记一笔' : '看看其他分类，或者先记一笔');
    } else {
      for (const [date, items] of groups) {
        const d = parseYMD(date);
        const dayTotal = sumByGroup(items).total;
        body += `<section class="day-group">
          <div class="day-head"><span>${d.getMonth() + 1}月${d.getDate()}日 <em>${WEEKDAYS[d.getDay()]}</em></span><span>¥${fmtMoney(dayTotal)}</span></div>
          <div class="day-items">${items.map(txRowHTML).join('')}</div>
        </section>`;
      }
    }

    document.getElementById('view-list').innerHTML = `
      <div class="filter-chips">
        ${FILTERS.map(([key, label]) => `<button type="button" class="filter-chip${listFilter === key ? ' is-active' : ''}" data-action="set-filter" data-filter="${key}" aria-pressed="${listFilter === key}">${label}</button>`).join('')}
      </div>
      <p class="list-summary">${monthLabel(month)} · ${txs.length} 笔 · 合计 ¥${fmtMoney(total)}</p>
      ${body}`;
  }

  /* =========================================================
     渲染：统计
     ========================================================= */
  function legendRow(key, amount, pct) {
    const g = GROUPS[key];
    return `<div class="legend-row">
      <div class="legend-head"><span><i class="dot ${key}"></i> ${g.name}</span><b>${pct}%</b></div>
      <div class="legend-amount">¥${fmtMoney(amount)}</div>
    </div>`;
  }

  function renderStats() {
    const txs = monthTxs(month);
    const t = sumByGroup(txs);
    const aiPct = t.total > 0 ? Math.round((t.ai / t.total) * 100) : 0;
    const donutStyle = t.total > 0
      ? `conic-gradient(var(--ai) 0 ${aiPct}%, var(--life) ${aiPct}% 100%)`
      : 'conic-gradient(#EFF1F6 0 100%)';

    const catTotals = CATEGORIES
      .map((c) => ({
        c,
        amount: fromCents(txs.filter((x) => x.cat === c.id).reduce((sum, x) => sum + cents(x.amount), 0)),
      }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const maxCat = catTotals.length ? catTotals[0].amount : 0;

    const monthsList = [];
    for (let i = 5; i >= 0; i -= 1) monthsList.push(shiftMonth(month, -i));
    const trend = monthsList.map((ym) => ({ ym, ...sumByGroup(monthTxs(ym)) }));
    const maxTrend = Math.max(1, ...trend.map((x) => x.total));

    const rankHTML = catTotals.length
      ? `<div class="rank-list">${catTotals.map(({ c, amount }) => {
        const g = GROUPS[c.group];
        const pct = t.total > 0 ? Math.round((amount / t.total) * 100) : 0;
        return `<div class="rank-item">
          <div class="rank-head">
            <span class="tx-emoji" style="width:26px;height:26px;border-radius:8px;font-size:13px;background:${g.soft}">${c.emoji}</span>
            <span class="rank-name">${c.name}</span>
            <span class="rank-amount">¥${fmtMoney(amount)}</span>
            <span class="rank-pct">${pct}%</span>
          </div>
          <div class="rank-bar"><i style="width:${Math.max(4, (amount / maxCat) * 100)}%;background:${g.color}"></i></div>
        </div>`;
      }).join('')}</div>`
      : emptyHTML('📊', '这个月还没有数据', '记几笔之后，这里会显示钱主要花在哪些分类');

    document.getElementById('view-stats').innerHTML = `
      <section class="stats-top">
        <div class="donut" style="background:${donutStyle}">
          <div class="donut-center"><span>本月支出</span><strong>¥${fmtMoney(t.total)}</strong></div>
        </div>
        <div class="stats-legend">
          ${legendRow('ai', t.ai, aiPct)}
          ${legendRow('life', t.life, t.total > 0 ? 100 - aiPct : 0)}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2 class="card-title">分类排行</h2><span class="hint">${monthLabel(month)}</span></div>
        ${rankHTML}
      </section>

      <section class="card">
        <div class="card-head"><h2 class="card-title">近 6 个月</h2><span class="hint">AI / 开发 vs 生活</span></div>
        <div class="trend">
          ${trend.map((x) => `
            <div class="trend-col${x.ym === month ? ' is-current' : ''}" role="img" aria-label="${monthLabel(x.ym)}：AI / 开发 ${fmtMoney(x.ai)} 元，生活 ${fmtMoney(x.life)} 元">
              <div class="trend-bars">
                ${x.ai > 0
    ? `<i class="trend-bar ai" style="height:${Math.max(2, (x.ai / maxTrend) * 106)}px" title="AI / 开发 ¥${fmtMoney(x.ai)}"></i>`
    : '<i class="trend-bar is-zero" style="height:2px"></i>'}
                ${x.life > 0
    ? `<i class="trend-bar life" style="height:${Math.max(2, (x.life / maxTrend) * 106)}px" title="生活 ¥${fmtMoney(x.life)}"></i>`
    : '<i class="trend-bar is-zero" style="height:2px"></i>'}
              </div>
              <span class="trend-label">${x.ym === currentMonth() ? '本月' : `${Number(x.ym.split('-')[1])}月`}</span>
            </div>`).join('')}
        </div>
        <div class="trend-legend"><span><i style="background:var(--ai)"></i>AI / 开发</span><span><i style="background:var(--life)"></i>生活</span></div>
      </section>`;
  }

  /* =========================================================
     渲染：设置
     ========================================================= */
  function renderSettings() {
    const s = db.settings;
    const hasCorrupt = Boolean(corruptBackupRaw());
    document.getElementById('view-settings').innerHTML = `
      <section class="card">
        <h2 class="card-title">每月预算</h2>
        <p class="card-sub">每个月自动按这里的金额重新计算，不用手动重置。填 0 表示暂不设预算。</p>
        <label class="field-row" for="setAiBudget"><span>AI / 开发</span><span class="field-input"><span>¥</span><input id="setAiBudget" type="number" min="0" step="10" inputmode="numeric" value="${s.aiBudget}" aria-label="AI 与开发每月预算"></span></label>
        <label class="field-row" for="setLifeBudget"><span>生活</span><span class="field-input"><span>¥</span><input id="setLifeBudget" type="number" min="0" step="10" inputmode="numeric" value="${s.lifeBudget}" aria-label="生活每月预算"></span></label>
        <button type="button" class="primary-btn" data-action="save-budgets">保存预算</button>
      </section>

      ${hasCorrupt ? `<section class="card">
        <h2 class="card-title">数据修复</h2>
        <p class="card-sub">检测到一次本地数据读取异常，原始数据已暂存在本机。请先导出原始数据保存好，再继续记账；需要时可以把它交给 AI 助手修复。</p>
        <div class="btn-list">
          <button type="button" class="ghost-btn" data-action="export-raw">导出原始数据（修复用）</button>
          <button type="button" class="ghost-btn danger" data-action="clear-corrupt">我已备份，删除暂存数据</button>
        </div>
      </section>` : ''}

      <section class="card">
        <h2 class="card-title">数据</h2>
        <p class="card-sub">数据只保存在这台手机的浏览器里。换手机或清理浏览器数据前，先导出备份。</p>
        <div class="btn-list">
          <button type="button" class="ghost-btn" data-action="export-json">导出备份文件（.json）</button>
          <button type="button" class="ghost-btn" data-action="export-csv">导出表格（.csv，可用 Excel 打开）</button>
          <button type="button" class="ghost-btn" data-action="import-json">从备份文件导入</button>
          <button type="button" class="ghost-btn danger" data-action="clear-all">清空全部记录</button>
        </div>
        <input type="file" id="importFile" accept=".json,application/json" hidden>
      </section>

      <section class="card">
        <h2 class="card-title">安装到手机</h2>
        <ol class="steps">
          <li>用手机浏览器打开小账本的网址（Chrome 或 Safari）。</li>
          <li>点浏览器菜单，选择「添加到主屏幕」或「安装应用」。</li>
          <li>以后从桌面图标进入，像普通 App 一样使用，断网也能记账。</li>
        </ol>
        <p class="card-sub">iPhone：Safari 底部「分享」→「添加到主屏幕」。</p>
      </section>

      <p class="app-foot">小账本 v${APP_VERSION} · 本地已存 ${db.txs.length} 条记录</p>`;
  }

  /* =========================================================
     主渲染
     ========================================================= */
  function render(opts = {}) {
    const { scroll = false } = opts;

    document.getElementById('monthLabel').textContent = monthLabel(month);
    document.getElementById('nextMonthBtn').disabled = month >= currentMonth();
    document.getElementById('topbar').classList.toggle('is-settings', view === 'settings');

    document.querySelectorAll('.tab').forEach((btn) => {
      const on = btn.dataset.tab === view;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-current', on ? 'page' : 'false');
    });

    ['home', 'list', 'stats', 'settings'].forEach((v) => {
      document.getElementById('view-' + v).hidden = v !== view;
    });

    if (view === 'home') renderHome();
    else if (view === 'list') renderList();
    else if (view === 'stats') renderStats();
    else renderSettings();

    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function switchView(next) {
    if (!['home', 'list', 'stats', 'settings'].includes(next) || next === view) return;
    view = next;
    render({ scroll: true });
  }

  /* =========================================================
     记账：新增 / 编辑 / 删除
     ========================================================= */
  function setEntryCat(id) {
    if (!CAT_MAP.has(id)) return;
    entryCat = id;
    document.querySelectorAll('#view-home .chip[data-cat]').forEach((b) => {
      const on = b.dataset.cat === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function saveEntry() {
    const amountEl = document.getElementById('amount');
    if (!amountEl) return;
    const amount = parseAmount(amountEl.value);
    if (!amount) {
      toast('请输入有效金额，例如 29 或 29.9（最多两位小数）');
      amountEl.focus();
      return;
    }
    const dateEl = document.getElementById('entryDate');
    const date = dateEl && parseYMD(dateEl.value) ? dateEl.value : defaultEntryDate();
    const noteEl = document.getElementById('note');
    const note = (noteEl ? noteEl.value : '').trim().slice(0, 50);
    const tx = { id: uid(), date, cat: entryCat, amount, note, createdAt: Date.now() };
    const previousLastCat = db.settings.lastCat;
    db.txs.push(tx);
    db.settings.lastCat = entryCat;
    if (!saveDB()) {
      db.txs.pop();
      db.settings.lastCat = previousLastCat;
      toast(SAVE_FAIL_MSG);
      return;
    }
    month = monthOf(date);
    render();
    toast(`已记 ¥${fmtMoney(amount)} · ${catOf(entryCat).name}`);
  }

  function openEdit(id) {
    const tx = db.txs.find((x) => x.id === id);
    if (!tx) return;
    editingId = id;
    editCat = tx.cat;
    const dlg = document.getElementById('editDialog');
    dlg.innerHTML = `
      <form class="sheet-form" id="editForm" novalidate>
        <div class="sheet-head">
          <h2>编辑记录</h2>
          <button type="button" class="icon-btn" data-action="close-edit" aria-label="关闭">✕</button>
        </div>
        <label class="field-label" for="editAmount">金额</label>
        <div class="amount-row compact">
          <span class="currency">¥</span>
          <input id="editAmount" class="amount-input" type="text" inputmode="decimal" autocomplete="off" value="${fmtPlain(tx.amount)}" aria-label="金额">
        </div>
        <span class="field-label">分类</span>
        <div class="chips compact" id="editChips">
          ${CATEGORIES.map((c) => `<button type="button" class="chip${c.id === editCat ? ' is-selected' : ''}" data-edit-cat="${c.id}" data-group="${c.group}" aria-pressed="${c.id === editCat}"><span class="chip-emoji">${c.emoji}</span>${c.name}</button>`).join('')}
        </div>
        <label class="field-label" for="editNote">备注</label>
        <input id="editNote" class="text-input" type="text" maxlength="50" value="${escapeHTML(tx.note)}" placeholder="备注（可选）">
        <label class="field-label" for="editDate">日期</label>
        <input id="editDate" class="date-input" type="date" value="${tx.date}">
        <div class="sheet-actions">
          <button type="button" class="ghost-btn danger" data-action="delete-tx">删除</button>
          <button type="submit" class="primary-btn">保存</button>
        </div>
      </form>`;
    dlg.showModal();
  }

  function setEditCat(id) {
    if (!CAT_MAP.has(id)) return;
    editCat = id;
    document.querySelectorAll('#editChips .chip').forEach((b) => {
      const on = b.dataset.editCat === id;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function closeEdit() {
    const dlg = document.getElementById('editDialog');
    if (dlg.open) dlg.close();
    editingId = null;
    editCat = null;
  }

  function saveEdit() {
    if (!editingId) return;
    const tx = db.txs.find((x) => x.id === editingId);
    if (!tx) { closeEdit(); return; }
    const amountEl = document.getElementById('editAmount');
    const amount = parseAmount(amountEl.value);
    if (!amount) {
      toast('请输入有效金额');
      amountEl.focus();
      return;
    }
    const dateEl = document.getElementById('editDate');
    const date = dateEl && parseYMD(dateEl.value) ? dateEl.value : tx.date;
    const note = (document.getElementById('editNote').value || '').trim().slice(0, 50);
    const previous = { amount: tx.amount, cat: tx.cat, date: tx.date, note: tx.note };
    tx.amount = amount;
    tx.cat = editCat;
    tx.date = date;
    tx.note = note;
    if (!saveDB()) {
      Object.assign(tx, previous);
      showDialogError(SAVE_FAIL_MSG);
      return;
    }
    month = monthOf(date);
    closeEdit();
    render();
    toast('已保存修改');
  }

  async function deleteEditing() {
    if (!editingId) return;
    const tx = db.txs.find((x) => x.id === editingId);
    if (!tx) return;
    const ok = await askConfirm({
      title: '删除这条记录？',
      message: `${catOf(tx.cat).name} · ¥${fmtMoney(tx.amount)}${tx.note ? `（${tx.note}）` : ''}，删除后无法恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    db.txs = db.txs.filter((x) => x.id !== editingId);
    if (!saveDB()) {
      db.txs.push(tx);
      showDialogError(SAVE_FAIL_MSG);
      return;
    }
    closeEdit();
    render();
    toast('已删除');
  }

  /* =========================================================
     预算 / 数据导入导出
     ========================================================= */
  function saveBudgets() {
    const ai = Number(document.getElementById('setAiBudget').value);
    const life = Number(document.getElementById('setLifeBudget').value);
    if (!Number.isFinite(ai) || !Number.isFinite(life) || ai < 0 || life < 0) {
      toast('预算请填写 0 或更大的数字');
      return;
    }
    const previous = { aiBudget: db.settings.aiBudget, lifeBudget: db.settings.lifeBudget };
    db.settings.aiBudget = Math.round(ai);
    db.settings.lifeBudget = Math.round(life);
    if (!saveDB()) {
      Object.assign(db.settings, previous);
      toast(SAVE_FAIL_MSG);
      return;
    }
    render();
    toast('预算已保存');
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function exportJSON() {
    download(`小账本备份-${todayStr()}.json`, JSON.stringify(db, null, 2), 'application/json;charset=utf-8');
    toast('备份文件已导出');
  }

  const csvCell = (value) => {
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function exportCSV() {
    const rows = [['日期', '分类', '分组', '金额', '备注']];
    const sorted = db.txs.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
    for (const t of sorted) {
      const c = catOf(t.cat);
      rows.push([t.date, c.name, GROUPS[c.group].name, fmtPlain(t.amount), t.note || '']);
    }
    const csv = `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`;
    download(`小账本明细-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('表格已导出');
  }

  function triggerImport() {
    const input = document.getElementById('importFile');
    if (input) input.click();
  }

  function exportRawBackup() {
    const raw = corruptBackupRaw();
    if (!raw) {
      toast('没有需要导出的原始数据');
      return;
    }
    download(`小账本原始数据-${todayStr()}.txt`, raw, 'text/plain;charset=utf-8');
    toast('原始数据已导出，请妥善保存');
  }

  async function clearCorruptBackup() {
    const ok = await askConfirm({
      title: '删除暂存的原始数据？',
      message: '请确认已经导出并保存好原始数据。删除后无法找回。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      localStorage.removeItem(`${STORE_KEY}.corrupt`);
    } catch (err) {
      console.warn('删除暂存数据失败', err);
    }
    render();
    toast('已删除暂存数据');
  }

  function handleImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let next = null;
      try {
        next = normalizeDB(JSON.parse(String(reader.result)));
      } catch (err) {
        next = null;
      }
      if (!next) {
        toast('导入失败：这不是有效的小账本备份');
        return;
      }
      const ok = await askConfirm({
        title: '导入备份？',
        message: `将用备份中的 ${next.txs.length} 条记录替换当前 ${db.txs.length} 条记录。`,
        confirmText: '导入',
      });
      if (!ok) return;
      const previousDB = db;
      db = next;
      entryCat = db.settings.lastCat || 'ai-tools';
      if (!saveDB()) {
        db = previousDB;
        entryCat = previousDB.settings.lastCat || 'ai-tools';
        toast(SAVE_FAIL_MSG);
        return;
      }
      month = currentMonth();
      view = 'home';
      render({ scroll: true });
      toast(`导入成功，共 ${next.txs.length} 条记录`);
    };
    reader.onerror = () => toast('读取文件失败');
    reader.readAsText(file);
  }

  async function clearAll() {
    if (!db.txs.length) {
      toast('还没有记录');
      return;
    }
    const ok = await askConfirm({
      title: '清空全部记录？',
      message: `将删除 ${db.txs.length} 条记录，预算设置会保留。清空后无法恢复，建议先导出备份。`,
      confirmText: '清空',
      danger: true,
    });
    if (!ok) return;
    const previousTxs = db.txs;
    db.txs = [];
    if (!saveDB()) {
      db.txs = previousTxs;
      toast(SAVE_FAIL_MSG);
      return;
    }
    month = currentMonth();
    render();
    toast('已清空记录');
  }

  /* =========================================================
     确认弹窗 / Toast
     ========================================================= */
  function askConfirm({ title, message, confirmText = '确定', danger = false }) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      const dlg = document.getElementById('confirmDialog');
      dlg.innerHTML = `<div class="confirm-body">
        <h2>${escapeHTML(title)}</h2>
        <p>${escapeHTML(message)}</p>
        <div class="confirm-actions">
          <button type="button" class="ghost-btn" data-confirm="0">取消</button>
          <button type="button" class="${danger ? 'danger-solid' : 'primary-btn'}" data-confirm="1">${escapeHTML(confirmText)}</button>
        </div>
      </div>`;
      dlg.showModal();
    });
  }

  function toast(message, duration = 2300) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  function showDialogError(message) {
    const dlg = document.getElementById('editDialog');
    if (!dlg.open) {
      toast(message);
      return;
    }
    const form = dlg.querySelector('.sheet-form');
    if (!form) {
      toast(message);
      return;
    }
    let el = form.querySelector('.sheet-error');
    if (!el) {
      el = document.createElement('p');
      el.className = 'sheet-error';
      form.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.remove(), 5000);
  }

  /* =========================================================
     事件绑定
     ========================================================= */
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) { switchView(tab.dataset.tab); return; }

      const chip = e.target.closest('#view-home .chip[data-cat]');
      if (chip) { setEntryCat(chip.dataset.cat); return; }

      const editChip = e.target.closest('#editChips .chip[data-edit-cat]');
      if (editChip) { setEditCat(editChip.dataset.editCat); return; }

      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;

      switch (actionEl.dataset.action) {
        case 'prev-month':
          month = shiftMonth(month, -1);
          render();
          break;
        case 'next-month':
          if (month < currentMonth()) {
            month = shiftMonth(month, 1);
            render();
          }
          break;
        case 'this-month':
          month = currentMonth();
          render();
          break;
        case 'save-tx':
          saveEntry();
          break;
        case 'goto-list':
          switchView('list');
          break;
        case 'edit-tx':
          openEdit(actionEl.dataset.id);
          break;
        case 'close-edit':
          closeEdit();
          break;
        case 'delete-tx':
          deleteEditing();
          break;
        case 'set-filter':
          listFilter = actionEl.dataset.filter || 'all';
          render();
          break;
        case 'save-budgets':
          saveBudgets();
          break;
        case 'export-json':
          exportJSON();
          break;
        case 'export-csv':
          exportCSV();
          break;
        case 'import-json':
          triggerImport();
          break;
        case 'export-raw':
          exportRawBackup();
          break;
        case 'clear-corrupt':
          clearCorruptBackup();
          break;
        case 'clear-all':
          clearAll();
          break;
        default:
          break;
      }
    });

    document.addEventListener('submit', (e) => {
      if (e.target.id === 'editForm') {
        e.preventDefault();
        saveEdit();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key !== 'Enter') return;
      if (e.target.closest('dialog')) return;
      if (e.target.id === 'amount' || e.target.id === 'note') {
        e.preventDefault();
        saveEntry();
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'importFile') {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (file) handleImport(file);
      }
    });

    const confirmDlg = document.getElementById('confirmDialog');
    confirmDlg.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-confirm]');
      if (!btn) return;
      const accepted = btn.dataset.confirm === '1';
      confirmDlg.close();
      if (confirmResolve) {
        const resolve = confirmResolve;
        confirmResolve = null;
        resolve(accepted);
      }
    });
    confirmDlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      confirmDlg.close();
      if (confirmResolve) {
        const resolve = confirmResolve;
        confirmResolve = null;
        resolve(false);
      }
    });

    const editDlg = document.getElementById('editDialog');
    editDlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeEdit();
    });
    editDlg.addEventListener('close', () => {
      editingId = null;
      editCat = null;
    });
  }

  /* =========================================================
     启动
     ========================================================= */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:'
      || location.hostname === 'localhost'
      || location.hostname === '127.0.0.1';
    if (!secure) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker 注册失败', err));
    });
  }

  function init() {
    entryCat = db.settings.lastCat || 'ai-tools';
    bindEvents();
    render();
    registerSW();
    if (loadWarning) setTimeout(() => toast(loadWarning, 5000), 300);
  }

  init();
})();