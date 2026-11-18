// 一句话记账解析器：把 "昨天午饭麦当劳12块5 paynow，打车8块" 变成结构化记录
(function (root) {
  'use strict';

  // ---------- 分类关键词 ----------
  const EXPENSE_CATS = [
    { name: '餐饮', icon: '🍜', kw: ['早饭', '早餐', '午饭', '午餐', '中饭', '晚饭', '晚餐', '夜宵', '宵夜', '吃饭', '吃', '饭', '咖啡', 'kopi', 'teh', '奶茶', '饮料', '喝', '麦当劳', 'mcdonald', '肯德基', 'kfc', '汉堡', '星巴克', 'starbucks', 'hawker', '小贩', '食阁', 'food court', '海底捞', '火锅', '烧烤', '外卖', 'grabfood', 'foodpanda', 'deliveroo', '面包', '零食', '水果', '苹果', '香蕉', '榴莲', '西瓜', '甜品', '蛋糕', '鸡饭', '叻沙', '面', '粥', '寿司', '餐厅', '聚餐', 'toast box', 'ya kun', '瑞幸', '喜茶', '霸王茶姬', 'koi', 'liho', 'chagee'] },
    { name: '交通', icon: '🚇', kw: ['打车', '的士', 'taxi', 'grab', 'gojek', 'tada', 'cdg', 'comfort', '地铁', 'mrt', '公交', '巴士', 'bus', '车费', 'ez-link', 'ezlink', '加油', '油费', '停车', '滴滴', '高铁', '火车', '共享单车'] },
    { name: '购物', icon: '🛍️', kw: ['淘宝', '京东', '拼多多', 'shopee', 'lazada', 'amazon', '亚马逊', 'taobao', '衣服', '裤子', '鞋', '包包', '优衣库', 'uniqlo', '电子', '耳机', '手机', '电脑', '化妆品', '护肤', 'ikea', '宜家', 'daiso', '大创', '网购', '买了个', '买东西'] },
    { name: '日用', icon: '🧴', kw: ['超市', 'fairprice', 'ntuc', '职总', 'cold storage', 'sheng siong', '昇菘', 'giant', 'don don donki', 'donki', '日用', '日用品', '洗发水', '沐浴露', '纸巾', '牙膏', '洗衣', '屈臣氏', 'watsons', 'guardian', '买菜', '菜市场', '杂货', '7-11', '711', '便利店', 'cheers'] },
    { name: '住房', icon: '🏠', kw: ['房租', '租金', '租房', '水电', '电费', '水费', '燃气', '煤气', '网费', '宽带', '物业', 'sp group', 'sp账单', '中介'] },
    { name: '通讯', icon: '📱', kw: ['话费', '电话卡', '手机费', 'singtel', 'starhub', 'm1', 'simba', 'giga', '流量', '充值'] },
    { name: '娱乐', icon: '🎮', kw: ['电影', '游戏', 'ktv', '唱歌', '酒吧', '喝酒', '演唱会', '门票', 'netflix', 'spotify', 'youtube', 'disney', '会员', '订阅', 'steam', 'switch', '健身', 'gym', '按摩', '剧本杀', '桌游', '动物园', '环球影城', 'uss'] },
    { name: '医疗', icon: '💊', kw: ['看病', '医院', '药', '诊所', 'clinic', '牙医', '体检', '医生', 'polyclinic', '挂号'] },
    { name: '学习', icon: '📚', kw: ['书', '课', '学费', '课程', '培训', '考试', '文具', 'udemy', 'coursera'] },
    { name: '人情', icon: '🎁', kw: ['红包', '礼物', '请客', '送礼', '份子钱', '随礼', '生日礼'] },
    { name: '旅行', icon: '✈️', kw: ['酒店', '机票', '旅游', '旅行', '住宿', 'airbnb', 'agoda', 'booking', '签证', '景点'] },
    { name: '其他', icon: '📦', kw: [] },
  ];
  const INCOME_CATS = [
    { name: '工资', icon: '💼', kw: ['工资', '薪水', '薪资', 'salary', '发工资'] },
    { name: '奖金', icon: '🏆', kw: ['奖金', 'bonus', '年终奖', '提成'] },
    { name: '报销退款', icon: '↩️', kw: ['报销', '退款', '退钱', 'refund', '返现', 'cashback'] },
    { name: '理财', icon: '📈', kw: ['利息', '分红', '股息', '理财', '收益', 'interest'] },
    { name: '其他收入', icon: '💰', kw: [] },
  ];
  const INCOME_TRIGGERS = ['收入', '收到', '进账', '入账', '赚了', '到账', '转给我', '还我', '还钱给我', '工资', '薪水', '奖金', '报销', '退款', '利息', '分红', 'salary', 'bonus', 'refund', 'cashback', '返现'];

  // ---------- 金额 ----------
  const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const CN_UNIT = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

  function cnInt(s) {
    if (!s) return NaN;
    const chars = [...s];
    let total = 0, section = 0, num = 0, prevUnit = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch in CN_DIGIT) {
        num = CN_DIGIT[ch];
        // "一百二" = 120, "两千五" = 2500
        if (i === chars.length - 1 && prevUnit >= 100 && chars[i - 1] in CN_UNIT) {
          section += num * prevUnit / 10; num = 0;
        }
      } else if (ch in CN_UNIT) {
        const u = CN_UNIT[ch];
        if (u === 10000) { total += (section + num) * u; section = 0; }
        else section += (num || 1) * u;
        num = 0; prevUnit = u;
      } else return NaN;
    }
    return total + section + num;
  }

  function cnNumber(s) {
    const [i, d] = s.split('点');
    const intPart = i ? cnInt(i) : 0;
    if (isNaN(intPart)) return NaN;
    if (!d) return intPart;
    const dec = [...d].map(c => CN_DIGIT[c]);
    if (dec.some(x => x === undefined)) return NaN;
    return Number(intPart + '.' + dec.join(''));
  }

  const SGD_MARK = /^(s\$|\$|sgd|刀|新币|新元|新加坡元|新加坡币)$/i;
  const CNY_MARK = /^(¥|￥|rmb|cny|人民币)$/i;
  function markCurrency(m) {
    if (!m) return null;
    if (SGD_MARK.test(m)) return 'SGD';
    if (CNY_MARK.test(m)) return 'CNY';
    if (/^usd|美元|美金$/i.test(m)) return 'USD';
    if (/^(myr|rm|马币|令吉)$/i.test(m)) return 'MYR';
    if (/^(jpy|日元)$/i.test(m)) return 'JPY';
    return null;
  }

  const UNIT = '块钱|块|元|刀|新币|新元|新加坡元|sgd|rmb|cny|人民币|美元|美金|usd|马币|myr|日元|jpy';
  const PREFIX = 's\\$|\\$|¥|￥|sgd|rmb|cny|usd|rm';
  const CN_NUM = '[零〇一二两三四五六七八九十百千万点]';
  const CN_D = '[零一二两三四五六七八九]';
  const BAD_FOLLOW = /^\s*(个|杯|份|人|位|次|天|晚|件|瓶|斤|号|日|月|点|:|：|分钟|小时|岁|楼|站|张|碗|盒|包|只|条|公里|km|折|%|年)/i;

  // 找出文本里所有金额（返回位置，供拆分多笔用）
  function findAmounts(text) {
    const out = [];
    const reDigit = new RegExp(`(?:(${PREFIX})\\s*)?(\\d+(?:\\.\\d+)?)\\s*(${UNIT}|毛|角)?(?:(\\d)(?![\\d号日月.])(?:毛|角)?)?`, 'gi');
    let m;
    while ((m = reDigit.exec(text))) {
      const [all, pre, num, unit, tail] = m;
      const before = text.slice(0, m.index);
      const after = text.slice(m.index + all.length);
      if (!pre && !unit && (BAD_FOLLOW.test(after) || /第\s*$/.test(before))) continue;
      let v = parseFloat(num);
      if (unit === '毛' || unit === '角') v = v / 10;
      else if (tail && /块|元/.test(unit || '')) v += Number(tail) / 10;
      out.push({ value: v, currency: markCurrency(pre) || markCurrency(unit), strong: !!(pre || unit), start: m.index, end: m.index + all.length });
    }
    const reCn = new RegExp(`(${CN_NUM}+)\\s*(${UNIT}|毛|角)(${CN_D})?(?:毛|角)?`, 'gi');
    while ((m = reCn.exec(text))) {
      const [all, num, unit, tail] = m;
      if (out.some(o => m.index < o.end && m.index + all.length > o.start)) continue;
      let v = cnNumber(num);
      if (isNaN(v)) continue;
      if (unit === '毛' || unit === '角') v = v / 10;
      else if (tail) v += CN_DIGIT[tail] / 10;
      out.push({ value: v, currency: markCurrency(unit), strong: true, start: m.index, end: m.index + all.length });
    }
    // 没单位但明显是数字的中文："房租一千二"、"三十五"
    const reCnBare = /[零一二两三四五六七八九]*[十百千万][零一二两三四五六七八九十百千万点]*/g;
    while ((m = reCnBare.exec(text))) {
      const all = m[0];
      if (out.some(o => m.index < o.end && m.index + all.length > o.start)) continue;
      if (BAD_FOLLOW.test(text.slice(m.index + all.length))) continue;
      const v = cnNumber(all);
      if (isNaN(v) || v <= 0) continue;
      out.push({ value: v, currency: null, strong: false, start: m.index, end: m.index + all.length });
    }
    out.sort((a, b) => a.start - b.start);
    // 有带单位的金额时，丢掉裸数字（比如 "买了3个苹果12块" 里的 3 已被排除，这里再保险）
    if (out.some(o => o.strong)) return out.filter(o => o.strong || out.length === 1);
    return out;
  }

  // ---------- 日期 ----------
  function ymd(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function numOrCn(s) { return /^\d+$/.test(s) ? Number(s) : cnInt(s); }
  const WEEK = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };

  function findDate(text, today) {
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const rules = [
      [/大前天/, () => addDays(t0, -3)],
      [/前天/, () => addDays(t0, -2)],
      [/昨天|昨晚|昨日|昨早/, () => addDays(t0, -1)],
      [/今天|今晚|今早|今日/, () => t0],
      [/(上上|上)?(?:周|星期|礼拜)([一二三四五六日天1-7])/, m => {
        const target = WEEK[m[2]];
        const cur = t0.getDay();
        const toMon = d => (d + 6) % 7; // 周一=0
        let diff = toMon(target) - toMon(cur);
        if (m[1] === '上') diff -= 7;
        else if (m[1] === '上上') diff -= 14;
        else if (diff > 0) diff -= 7;
        return addDays(t0, diff);
      }],
      [/(\d{1,2}|[一二三四五六七八九十]{1,3})月(\d{1,2}|[一二三四五六七八九十]{1,3})(?:号|日)?/, m => {
        const mo = numOrCn(m[1]) - 1, da = numOrCn(m[2]);
        let d = new Date(t0.getFullYear(), mo, da);
        if (d > t0) d = new Date(t0.getFullYear() - 1, mo, da);
        return d;
      }],
      [/(\d{1,2}|[一二三四五六七八九十]{1,3})(?:号|日)(?!元)/, m => {
        const da = numOrCn(m[1]);
        let d = new Date(t0.getFullYear(), t0.getMonth(), da);
        if (d > t0) d = new Date(t0.getFullYear(), t0.getMonth() - 1, da);
        return d;
      }],
    ];
    for (const [re, fn] of rules) {
      const m = text.match(re);
      if (m) {
        const d = fn(m);
        if (d && !isNaN(d)) return { date: ymd(d), start: m.index, end: m.index + m[0].length };
      }
    }
    return null;
  }

  // ---------- 账户 ----------
  function findAccount(text, accounts) {
    const lower = text.toLowerCase();
    let best = null;
    for (const a of accounts) {
      const kws = [a.name, ...(a.keywords || [])].filter(Boolean);
      for (const k of kws) {
        const i = lower.indexOf(k.toLowerCase());
        if (i >= 0 && (!best || k.length > best.len)) best = { account: a.name, start: i, end: i + k.length, len: k.length };
      }
    }
    return best;
  }

  // ---------- 分类 ----------
  function findCategory(text, type, learned) {
    const lower = text.toLowerCase();
    // 1. 你自己改过的分类优先（越长越具体）
    let best = null;
    for (const [k, v] of Object.entries(learned || {})) {
      if (v.type !== type) continue;
      if (k && lower.includes(k.toLowerCase()) && (!best || k.length > best.len)) best = { cat: v.category, len: k.length };
    }
    if (best) return best.cat;
    // 2. 内置关键词（最长匹配）
    const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    best = null;
    for (const c of cats) for (const k of c.kw) {
      if (lower.includes(k.toLowerCase()) && (!best || k.length > best.len)) best = { cat: c.name, len: k.length };
    }
    return best ? best.cat : (type === 'income' ? '其他收入' : '其他');
  }

  function cleanNote(s) {
    return s
      .replace(/花了|用了|付了|付款|支付|一共|总共|大概|大约|差不多|块钱|记一笔|记账|帮我记|^\s*用|^\s*在|通过|然后|还有|收到了?|^的|的$/g, ' ')
      .replace(/[，,。.；;！!？?、]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cut(text, ranges) {
    const rs = ranges.filter(Boolean).sort((a, b) => b.start - a.start);
    let t = text;
    for (const r of rs) t = t.slice(0, r.start) + ' ' + t.slice(r.end);
    return t;
  }

  // ---------- 拆分多笔 ----------
  function splitItems(text, accounts) {
    const parts = text.split(/[，,；;。\n！!？?]|还有|然后|另外|以及|再加上/).map(s => s.trim()).filter(Boolean);
    const items = [], context = [];
    for (const p of parts) {
      const amts = findAmounts(p);
      if (amts.length === 0) { context.push(p); continue; }
      if (amts.length === 1) { items.push(p); continue; }
      // 一句话里有多个金额又没标点："午饭12块打车8块" → 在每个金额后切开
      let last = 0;
      amts.forEach((a, i) => {
        let end = a.end;
        if (i < amts.length - 1) {
          const rest = p.slice(end);
          const acc = findAccount(rest.slice(0, 16), accounts);
          if (acc && /^\s*(用|走|付|通过)?\s*$/.test(rest.slice(0, acc.start))) end += acc.end;
          items.push(p.slice(last, end)); last = end;
        } else items.push(p.slice(last));
      });
    }
    return { items, context: context.join(' ') };
  }

  // ---------- 主函数 ----------
  function parse(input, ctx) {
    const text = String(input || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).trim();
    if (!text) return [];
    const today = ctx.today || new Date();
    const accounts = ctx.accounts || [];
    const accCur = name => (accounts.find(a => a.name === name) || {}).currency;

    // 全句只出现一个日期 → 对所有笔生效（"昨天午饭12打车8"）
    const globalDate = findDate(text, today);
    const { items, context } = splitItems(text, accounts);
    const ctxAcc = findAccount(context, accounts);
    const defaultAcc = ctxAcc ? ctxAcc.account : ctx.defaultAccount;
    const isIncomeAll = INCOME_TRIGGERS.some(k => context.toLowerCase().includes(k));

    const list = items.length ? items : [text];
    return list.map(seg => {
      const dateHit = findDate(seg, today);
      const segNoDate = dateHit ? cut(seg, [dateHit]) : seg;
      const amts = findAmounts(segNoDate);
      const amt = amts.find(a => a.strong) || amts[amts.length - 1] || null;
      const accHit = findAccount(segNoDate, accounts);
      const account = accHit ? accHit.account : defaultAcc;
      const lower = segNoDate.toLowerCase();
      const type = (isIncomeAll || INCOME_TRIGGERS.some(k => lower.includes(k))) ? 'income' : 'expense';
      let note = cleanNote(cut(segNoDate, [amt, accHit]));
      if (!note && context) note = cleanNote(cut(context, [ctxAcc, findDate(context, today)]));
      const category = findCategory(note || segNoDate, type, ctx.learned);
      return {
        type,
        amount: amt ? Math.round(amt.value * 100) / 100 : null,
        currency: (amt && amt.currency) || accCur(account) || ctx.baseCurrency || 'SGD',
        account,
        category,
        date: (dateHit || globalDate || { date: ymd(today) }).date,
        note,
        raw: seg,
      };
    });
  }

  const api = { parse, findAmounts, findDate, cnNumber, EXPENSE_CATS, INCOME_CATS, ymd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
