(function () {
  'use strict';
  const { parse, EXPENSE_CATS, INCOME_CATS, ymd } = window.Parser;
  const $ = s => document.querySelector(s);
  const KEY = 'jizhang.v1';
  const CURRENCIES = ['SGD', 'CNY', 'USD', 'MYR', 'JPY'];
  const SYMBOL = { SGD: 'S$', CNY: '¥', USD: 'US$', MYR: 'RM', JPY: 'JP¥' };

  // ---------- 数据 ----------
  const DEFAULT = {
    tx: [],
    learned: {},
    settings: {
      base: 'SGD',
      rates: { SGD: 1, CNY: 5.5, USD: 0.77, MYR: 3.3, JPY: 117 }, // 1 SGD = x
      ratesAt: null,
      defaultAccount: 'DBS卡',
      accounts: [
        { name: 'DBS卡', currency: 'SGD', keywords: ['dbs', '星展', '刷卡', '信用卡', '借记卡', 'apple pay', '拍卡', '卡付'] },
        { name: 'PayNow', currency: 'SGD', keywords: ['paynow', 'pay now', '扫码付', 'paylah'] },
        { name: '现金', currency: 'SGD', keywords: ['cash'] },
        { name: '支付宝', currency: 'CNY', keywords: ['alipay', '花呗'] },
        { name: '微信', currency: 'CNY', keywords: ['wechat', '微信支付'] },
      ],
    },
  };
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { db = null; }
  if (!db) db = JSON.parse(JSON.stringify(DEFAULT));
  db.settings = Object.assign({}, DEFAULT.settings, db.settings);
  db.learned = db.learned || {};
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('保存失败：浏览器存储不可用，请尽快导出备份'); }
  }
  // 请求持久化存储，避免浏览器清理
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const S = () => db.settings;
  const toBase = (amt, cur) => amt / (S().rates[cur] || 1) * (S().rates[S().base] || 1);
  const fmt = (n, cur) => (SYMBOL[cur] || cur + ' ') + (Math.round(n * 100) / 100).toLocaleString('en', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const catIcon = (name, type) => ((type === 'income' ? INCOME_CATS : EXPENSE_CATS).find(c => c.name === name) || { icon: type === 'income' ? '💰' : '📦' }).icon;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => ymd(new Date());

  // ---------- 提示 ----------
  let toastTimer;
  function toast(msg, actionText, action) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (actionText) {
      const b = document.createElement('button');
      b.textContent = actionText;
      b.onclick = () => { action(); el.remove(); };
      el.appendChild(b);
    }
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 4000);
  }

  // ---------- 草稿（识别结果，确认后保存） ----------
  let drafts = [];
  const ctx = () => ({ accounts: S().accounts, defaultAccount: S().defaultAccount, baseCurrency: S().base, learned: db.learned, today: new Date() });

  function draftHTML(d, i, editing) {
    const all = d.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    // 识别出的分类排第一个，横向滑动也一眼看到
    const cats = d._catTouched ? all : all.filter(c => c.name === d.category).concat(all.filter(c => c.name !== d.category));
    const accs = S().accounts.map(a => a.name);
    if (d.account && !accs.includes(d.account)) accs.push(d.account);
    return `<div class="card draft" data-i="${i}">
      <div class="row">
        <div class="seg"><button data-k="type" data-v="expense" class="${d.type === 'expense' ? 'on' : ''}">支出</button><button data-k="type" data-v="income" class="${d.type === 'income' ? 'on' : ''}">收入</button></div>
        <input class="amt grow ${d.type === 'income' ? 'inc' : ''}" data-k="amount" type="number" inputmode="decimal" step="0.01" placeholder="没听到金额，点这里填" value="${d.amount == null ? '' : d.amount}">
        <select data-k="currency" style="width:auto">${CURRENCIES.map(c => `<option ${c === d.currency ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="cats">${cats.map(c => `<button class="cat ${c.name === d.category ? 'on' : ''}" data-k="category" data-v="${c.name}">${c.icon} ${c.name}</button>`).join('')}</div>
      <div class="fields">
        <select data-k="account">${accs.map(a => `<option ${a === d.account ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
        <input data-k="date" type="date" value="${d.date}" style="grid-column: span 2">
      </div>
      <input class="note" data-k="note" placeholder="备注（买了什么）" value="${esc(d.note)}">
      ${editing ? `<div class="actions"><button class="btn danger" data-act="delete">删除</button><button class="btn ghost" data-act="cancel">取消</button><button class="btn" data-act="save">保存</button></div>`
        : (drafts.length > 1 ? `<div class="actions"><button class="btn ghost" data-act="remove" style="flex:0 0 auto">去掉这笔</button></div>` : '')}
    </div>`;
  }

  function renderDrafts() {
    const box = $('#drafts');
    if (!drafts.length) { box.innerHTML = ''; return; }
    const total = drafts.length;
    box.innerHTML = drafts.map((d, i) => draftHTML(d, i, false)).join('') +
      `<div class="actions"><button class="btn ghost" data-act="clear">清空</button><button class="btn" data-act="saveAll">保存${total > 1 ? ` ${total} 笔` : ''}</button></div>`;
  }

  // 草稿编辑（事件委托，同时用于编辑弹层）
  function bindDraftEvents(container, getList, onChange) {
    container.addEventListener('click', e => {
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      const card = b.closest('[data-i]'); const d = getList()[+card.dataset.i];
      d[b.dataset.k] = b.dataset.v;
      if (b.dataset.k === 'type') d.category = d.type === 'income' ? '其他收入' : '其他';
      if (b.dataset.k === 'category') d._catTouched = true;
      onChange();
    });
    container.addEventListener('change', e => {
      const el = e.target.closest('[data-k]');
      if (!el || el.tagName === 'BUTTON') return;
      const d = getList()[+el.closest('[data-i]').dataset.i];
      const k = el.dataset.k;
      d[k] = k === 'amount' ? (el.value === '' ? null : Number(el.value)) : el.value;
      if (k === 'account') {
        const a = S().accounts.find(x => x.name === el.value);
        if (a && !d._curTouched) { d.currency = a.currency; onChange(); }
      }
      if (k === 'currency') d._curTouched = true;
    });
  }

  function learn(d) {
    // 改过分类 → 记住备注里的关键词，下次自动分
    if (!d._catTouched) return;
    const key = (d.note || '').trim().toLowerCase().slice(0, 20);
    if (key.length < 1) return;
    db.learned[key] = { type: d.type, category: d.category };
  }

  function commitDrafts() {
    const bad = drafts.findIndex(d => !(d.amount > 0));
    if (bad >= 0) { toast('有一笔还没填金额'); const el = document.querySelectorAll('#drafts .amt')[bad]; el && el.focus(); return; }
    const added = drafts.map(d => {
      learn(d);
      return { id: uid(), type: d.type, amount: d.amount, currency: d.currency, category: d.category, account: d.account, date: d.date || today(), note: d.note || '', raw: d.raw || '', createdAt: Date.now() };
    });
    db.tx.push(...added);
    if (added[0]) S().defaultAccount = S().defaultAccount || added[0].account;
    save();
    drafts = []; $('#input').value = '';
    renderDrafts(); renderAll();
    const sum = added.reduce((s, t) => s + toBase(t.amount, t.currency) * (t.type === 'income' ? -1 : 1), 0);
    toast(`已记 ${added.length} 笔` + (added.length > 1 ? `，共 ${fmt(Math.abs(sum), S().base)}` : ''), '撤销', () => {
      const ids = new Set(added.map(t => t.id));
      db.tx = db.tx.filter(t => !ids.has(t.id)); save(); renderAll();
    });
  }

  $('#drafts').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'saveAll') commitDrafts();
    if (a.dataset.act === 'clear') { drafts = []; $('#input').value = ''; renderDrafts(); }
    if (a.dataset.act === 'remove') { drafts.splice(+a.closest('[data-i]').dataset.i, 1); renderDrafts(); }
  });
  bindDraftEvents($('#drafts'), () => drafts, renderDrafts);

  // 输入 → 实时识别
  let parseTimer;
  function reparse() {
    const text = $('#input').value.trim();
    drafts = text ? parse(text, ctx()) : [];
    renderDrafts();
  }
  $('#input').addEventListener('input', () => { clearTimeout(parseTimer); parseTimer = setTimeout(reparse, 250); });
  $('#input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); reparse(); if (drafts.length && drafts.every(d => d.amount > 0)) commitDrafts(); }
  });
  $('#manual').onclick = () => {
    drafts.push({ type: 'expense', amount: null, currency: (S().accounts.find(a => a.name === S().defaultAccount) || {}).currency || S().base, category: '其他', account: S().defaultAccount, date: today(), note: '' });
    renderDrafts();
    setTimeout(() => { const a = document.querySelectorAll('#drafts .amt'); a[a.length - 1].focus(); }, 0);
  };
  const EXAMPLES = ['午饭麦当劳12块5 PayNow', '昨天打车grab 18刀', '房租一千二 paynow', '咖啡5块5，买菜23块刷卡', '工资到账5000', '支付宝买菜35元'];
  $('#examples').innerHTML = EXAMPLES.map(x => `<button>${x}</button>`).join('');
  $('#examples').onclick = e => { if (e.target.tagName === 'BUTTON') { $('#input').value = e.target.textContent; reparse(); } };

  // ---------- 语音 ----------
  // iPhone Safari 的语音识别有几个坑：说完有时不触发结束事件、第二次启动会立刻失败。
  // 所以：每次都彻底释放旧的识别器，状态自己管，启动失败自动重试一次。
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = $('#mic'), micHint = $('#mic-hint');
  const HINT = micHint.textContent;
  let rec = null, listening = false, baseText = '', gotResult = false, startedAt = 0, retried = false;
  let silenceTimer = null, endGuard = null;

  function setListening(on, msg) {
    listening = on;
    micBtn.classList.toggle('on', on);
    micHint.textContent = msg || HINT;
  }
  function killRec() {
    clearTimeout(silenceTimer); clearTimeout(endGuard);
    if (!rec) return;
    const r = rec; rec = null;
    r.onresult = r.onerror = r.onend = null;
    try { r.abort(); } catch (e) {}
  }
  function finish() {
    killRec();
    setListening(false);
    reparse();
  }
  function stopListening() {
    // 让识别器把最后一句吐出来，最多等 1 秒，还没结束就强制收尾
    if (!rec) return finish();
    try { rec.stop(); } catch (e) {}
    clearTimeout(endGuard);
    endGuard = setTimeout(finish, 1000);
  }
  function giveUp(msg) {
    killRec(); setListening(false);
    toast(msg); $('#input').focus();
  }
  function startListening() {
    killRec();
    const r = new SR();
    rec = r;
    r.lang = 'zh-CN'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    gotResult = false; startedAt = Date.now();
    r.onresult = e => {
      if (rec !== r) return;
      gotResult = true;
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      $('#input').value = baseText + s;
      clearTimeout(parseTimer); parseTimer = setTimeout(reparse, 150);
      // 停顿 3 秒自动结束（防止 iPhone 不触发结束事件、按钮一直红着）
      clearTimeout(silenceTimer); silenceTimer = setTimeout(stopListening, 3000);
    };
    r.onerror = e => {
      if (rec !== r) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        giveUp('麦克风没授权。也可以点输入框，用键盘上的 🎤 听写');
      }
      // 其他错误统一交给 onend 处理
    };
    r.onend = () => {
      if (rec !== r) return;
      const quick = !gotResult && Date.now() - startedAt < 1500;
      if (quick && !retried) {
        // 刚启动就结束、什么都没听到 → 就是“第二次失灵”，换个新识别器重来一次
        retried = true;
        killRec();
        setTimeout(() => { if (listening) startListening(); }, 350);
        return;
      }
      if (quick) { giveUp('语音没启动成功，点输入框用键盘上的 🎤 也可以'); return; }
      finish();
    };
    try { r.start(); }
    catch (err) {
      killRec();
      if (!retried) { retried = true; setTimeout(() => { if (listening) startListening(); }, 350); }
      else giveUp('语音启动失败，请用键盘上的 🎤');
      return;
    }
    // 一直没出声，8 秒后自动停
    clearTimeout(silenceTimer); silenceTimer = setTimeout(stopListening, 8000);
  }
  micBtn.onclick = () => {
    if (!SR) { $('#input').focus(); toast('这个浏览器不支持网页语音，点键盘上的 🎤 用系统听写也一样'); return; }
    if (listening) { stopListening(); return; }
    baseText = $('#input').value.trim();
    if (baseText) baseText += '，';
    retried = false;
    setListening(true, '正在听…说完停一下，或再点一次麦克风结束');
    startListening();
  };
  // 切到后台时把麦克风收掉，回来再点就是全新的一次
  document.addEventListener('visibilitychange', () => { if (document.hidden && listening) finish(); });

  // ---------- 列表 ----------
  function listHTML(txs, emptyText) {
    if (!txs.length) return `<div class="empty">${emptyText}</div>`;
    const groups = {};
    txs.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
    const wk = '日一二三四五六';
    return Object.entries(groups).map(([date, list]) => {
      const out = list.filter(t => t.type === 'expense').reduce((s, t) => s + toBase(t.amount, t.currency), 0);
      const d = new Date(date + 'T00:00');
      const label = date === today() ? '今天' : date === ymd(new Date(Date.now() - 864e5)) ? '昨天' : `${d.getMonth() + 1}月${d.getDate()}日 周${wk[d.getDay()]}`;
      return `<div class="day"><div class="day-h"><span>${label}</span><span>支出 ${fmt(out, S().base)}</span></div>` +
        list.map(t => `<div class="item" data-id="${t.id}">
          <div class="ico">${catIcon(t.category, t.type)}</div>
          <div class="grow"><div class="t">${esc(t.note || t.category)}</div><div class="s">${esc(t.category)} · ${esc(t.account)}</div></div>
          <div class="m ${t.type === 'income' ? 'inc' : ''}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount, t.currency)}${t.currency !== S().base ? `<small>≈ ${fmt(toBase(t.amount, t.currency), S().base)}</small>` : ''}</div>
        </div>`).join('') + '</div>';
    }).join('');
  }

  function monthSum(ym) {
    let out = 0, inc = 0;
    db.tx.forEach(t => { if (t.date.startsWith(ym)) { const v = toBase(t.amount, t.currency); t.type === 'income' ? inc += v : out += v; } });
    return { out, inc };
  }

  function renderHome() {
    const ym = today().slice(0, 7);
    const { out, inc } = monthSum(ym);
    const todayOut = db.tx.filter(t => t.date === today() && t.type === 'expense').reduce((s, t) => s + toBase(t.amount, t.currency), 0);
    const b = S().base;
    $('#summary').innerHTML = `<div><div class="k">本月支出</div><div class="big">${fmt(out, b)}</div></div>
      <div><div class="k">今天</div><div class="v">${fmt(todayOut, b)}</div></div>
      <div><div class="k">本月收入</div><div class="v inc">${fmt(inc, b)}</div></div>`;
    const recent = db.tx.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 40);
    $('#recent').innerHTML = listHTML(recent, '还没有记录。点上面的麦克风说一句试试 👆');
  }

  // ---------- 编辑已有记录 ----------
  function openEdit(id) {
    const t = db.tx.find(x => x.id === id);
    if (!t) return;
    const list = [Object.assign({}, t)];
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet"><div class="row" style="margin-bottom:4px"><b class="grow">编辑</b>${t.raw ? `<span class="hint">原话：${esc(t.raw)}</span>` : ''}</div><div class="box"></div></div>`;
    const box = bg.querySelector('.box');
    const render = () => { box.innerHTML = draftHTML(list[0], 0, true); };
    render();
    bindDraftEvents(box, () => list, render);
    box.addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'cancel') bg.remove();
      if (a.dataset.act === 'save') {
        const d = list[0];
        if (!(d.amount > 0)) { toast('金额要大于 0'); return; }
        learn(d);
        delete d._catTouched; delete d._curTouched;
        Object.assign(t, d); save(); bg.remove(); renderAll(); toast('已保存');
      }
      if (a.dataset.act === 'delete') {
        const idx = db.tx.indexOf(t);
        db.tx.splice(idx, 1); save(); bg.remove(); renderAll();
        toast('已删除', '撤销', () => { db.tx.splice(idx, 0, t); save(); renderAll(); });
      }
    });
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
  }
  document.addEventListener('click', e => {
    const it = e.target.closest('.item[data-id]');
    if (it) openEdit(it.dataset.id);
  });

  // ---------- 统计 ----------
  let curMonth = today().slice(0, 7);
  function shiftMonth(n) {
    const [y, m] = curMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    curMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderStats();
  }
  $('#m-prev').onclick = () => shiftMonth(-1);
  $('#m-next').onclick = () => shiftMonth(1);

  function bars(map, total) {
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<div class="empty">这个月还没有支出</div>';
    const max = rows[0][1];
    return rows.map(([k, v]) => `<div class="bar-row"><span>${k}</span><div class="bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div>
      <span>${fmt(v, S().base)} <span class="muted" style="font-size:12px">${Math.round(v / total * 100)}%</span></span></div>`).join('');
  }

  function renderStats() {
    const [y, m] = curMonth.split('-').map(Number);
    $('#m-label').textContent = `${y}年${m}月`;
    const txs = db.tx.filter(t => t.date.startsWith(curMonth));
    const { out, inc } = monthSum(curMonth);
    const b = S().base;
    const days = new Date(y, m, 0).getDate();
    const isCur = curMonth === today().slice(0, 7);
    const passed = isCur ? new Date().getDate() : days;
    $('#m-summary').innerHTML = `<div><div class="k">支出</div><div class="big">${fmt(out, b)}</div></div>
      <div><div class="k">收入</div><div class="v inc">${fmt(inc, b)}</div></div>
      <div><div class="k">日均支出</div><div class="v">${fmt(out / passed, b)}</div></div>`;
    const daily = Array(days).fill(0);
    const cats = {}, accs = {};
    txs.forEach(t => {
      if (t.type !== 'expense') return;
      const v = toBase(t.amount, t.currency);
      daily[Number(t.date.slice(8)) - 1] += v;
      const ck = catIcon(t.category, t.type) + ' ' + t.category;
      cats[ck] = (cats[ck] || 0) + v;
      accs[t.account] = (accs[t.account] || 0) + v;
    });
    const dmax = Math.max(...daily, 1);
    $('#m-daily').innerHTML = daily.map((v, i) => `<i class="${v ? '' : 'zero'}" title="${i + 1}日 ${fmt(v, b)}" style="height:${v ? Math.max(4, v / dmax * 100) : 2}%"></i>`).join('');
    $('#m-cats').innerHTML = bars(cats, out);
    $('#m-accs').innerHTML = bars(accs, out);
    $('#m-list').innerHTML = listHTML(txs, '这个月没有记录');
  }

  // ---------- 设置 ----------
  function renderSettings() {
    const s = S();
    $('#s-base').innerHTML = CURRENCIES.map(c => `<option ${c === s.base ? 'selected' : ''}>${c}</option>`).join('');
    $('#s-cny').value = s.rates.CNY;
    $('#s-rate-info').textContent = s.ratesAt ? `汇率更新于 ${new Date(s.ratesAt).toLocaleString()}` : '现在用的是大概汇率，建议点一下联网更新';
    $('#s-accs').innerHTML = s.accounts.map((a, i) => `<div class="acc-row" data-i="${i}">
      <input data-f="name" value="${esc(a.name)}" placeholder="名称">
      <select data-f="currency">${CURRENCIES.map(c => `<option ${c === a.currency ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <button data-f="del" title="删除">✕</button>
      <input class="kw" data-f="keywords" value="${esc((a.keywords || []).join('，'))}" placeholder="关键词，用逗号隔开">
    </div>`).join('');
    $('#s-default').innerHTML = s.accounts.map(a => `<option ${a.name === s.defaultAccount ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    const learned = Object.entries(db.learned);
    $('#s-learned').innerHTML = learned.length ? learned.map(([k, v]) => `<div class="set-row"><span class="grow">“${esc(k)}” → ${esc(v.category)}</span><button data-forget="${esc(k)}" class="muted">忘掉</button></div>`).join('')
      : '<div class="hint">还没有。识别错的时候在卡片上点一下正确分类，下次说同样的话就会自动分对。</div>';
    $('#s-count').textContent = `共 ${db.tx.length} 条记录`;
  }
  $('#s-base').onchange = e => { S().base = e.target.value; save(); renderAll(); };
  $('#s-cny').onchange = e => { const v = Number(e.target.value); if (v > 0) { S().rates.CNY = v; save(); renderAll(); } };
  $('#s-rate').onclick = async () => {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/SGD').then(r => r.json());
      if (r.result !== 'success') throw new Error();
      CURRENCIES.forEach(c => { if (r.rates[c]) S().rates[c] = r.rates[c]; });
      S().ratesAt = Date.now(); save(); renderAll(); toast(`已更新：1 SGD = ${S().rates.CNY.toFixed(4)} CNY`);
    } catch (e) { toast('更新失败，可以手动填汇率'); }
  };
  $('#s-accs').addEventListener('change', e => {
    const el = e.target; const i = +el.closest('[data-i]').dataset.i; const a = S().accounts[i];
    if (el.dataset.f === 'name') {
      const old = a.name; a.name = el.value.trim() || old;
      if (S().defaultAccount === old) S().defaultAccount = a.name;
      db.tx.forEach(t => { if (t.account === old) t.account = a.name; });
    }
    if (el.dataset.f === 'currency') a.currency = el.value;
    if (el.dataset.f === 'keywords') a.keywords = el.value.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);
    save(); renderAll();
  });
  $('#s-accs').addEventListener('click', e => {
    if (e.target.dataset.f !== 'del') return;
    const i = +e.target.closest('[data-i]').dataset.i;
    if (S().accounts.length <= 1) return;
    if (!confirm(`删除付款方式“${S().accounts[i].name}”？（已记的账不受影响）`)) return;
    S().accounts.splice(i, 1);
    if (!S().accounts.some(a => a.name === S().defaultAccount)) S().defaultAccount = S().accounts[0].name;
    save(); renderAll();
  });
  $('#s-add-acc').onclick = () => { S().accounts.push({ name: '新付款方式', currency: S().base, keywords: [] }); save(); renderSettings(); };
  $('#s-default').onchange = e => { S().defaultAccount = e.target.value; save(); };
  $('#s-learned').addEventListener('click', e => { const k = e.target.dataset.forget; if (k != null) { delete db.learned[k]; save(); renderSettings(); } });

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#s-export').onclick = () => download(`记账备份-${today()}.json`, JSON.stringify(db, null, 1), 'application/json');
  $('#s-csv').onclick = () => {
    const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = [['日期', '类型', '金额', '币种', `折合${S().base}`, '分类', '付款方式', '备注', '原话']]
      .concat(db.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.type === 'income' ? '收入' : '支出', t.amount, t.currency, toBase(t.amount, t.currency).toFixed(2), t.category, t.account, t.note, t.raw]));
    download(`记账-${today()}.csv`, '﻿' + rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
  };
  $('#s-import').onclick = () => $('#s-file').click();
  $('#s-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.tx)) throw new Error();
      const have = new Set(db.tx.map(t => t.id));
      const add = data.tx.filter(t => !have.has(t.id));
      db.tx.push(...add);
      Object.assign(db.learned, data.learned || {});
      save(); renderAll(); toast(`导入了 ${add.length} 条新记录`);
    } catch (err) { toast('文件格式不对'); }
    e.target.value = '';
  };

  // ---------- 导航 ----------
  let tab = 'home';
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => {
    tab = b.dataset.tab;
    document.querySelectorAll('nav.tabs button').forEach(x => x.classList.toggle('on', x === b));
    ['home', 'stats', 'settings'].forEach(p => $('#page-' + p).classList.toggle('hidden', p !== tab));
    renderAll(); window.scrollTo(0, 0);
  });

  function renderAll() {
    renderHome();
    if (tab === 'stats') renderStats();
    if (tab === 'settings') renderSettings();
  }

  // 支持 ?q=午饭12块 这样的链接直接带入（以后给快捷指令用）
  const q = new URLSearchParams(location.search).get('q');
  if (q) { $('#input').value = q; history.replaceState(null, '', location.pathname); }
  renderAll();
  if (q) reparse();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // 新版本接管后刷新一次，手机上直接用到最新代码（正在输入时不打断）
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || $('#input').value || drafts.length || listening) return;
      reloaded = true; location.reload();
    });
  }
})();
