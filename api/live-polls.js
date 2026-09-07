// api/live-polls.js — צינור נתונים חיים (Vercel): ויקיפדיה → פירסור → שער אימות → JSON
// מושך את טבלת הסקרים מעמוד הסקרים האנגלי של ויקיפדיה (מקור מובנה, מתוחזק ומתוארך),
// ממפה כל עמודה למזהה מפלגה קבוע במאגר, ומחזיר רק שורות שלמות. הלקוח מריץ שער
// אימות שני (הגנה כפולה) לפני שהנתונים נכנסים לתצוגה — נתון שנכשל לא נכנס.
const PAGE = 'Opinion_polling_for_the_2026_Israeli_legislative_election';
const PAGE_URL = 'https://en.wikipedia.org/wiki/' + PAGE;
const API = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext%7Crevid&format=json&formatversion=2&page=' + PAGE;
const UA = 'VoterCompassBot/1.0 (+https://voter-compass.vercel.app; public Wikipedia API, polls table only)';

// זיהוי עמודות לפי קישור הוויקי שבכותרת שלהן (לא לפי מיקום קבוע). כך הצינור שורד
// הוספת/הסרת רשימות (מיזוגים, פיצולים, רשימות חדשות כמו "עמך ישראל" או "אחדות")
// מבלי להישבר: עמודה לא מזוהה מדווחת אוטומטית תחת excluded, ולא "נמצאת" במאגר שלנו.
const PARTY_PATTERNS = [
  { re: /^Likud$/,                              id: 'likud',      he: 'הליכוד' },
  { re: /^Together|Bennett/,                    id: 'bennett',    he: 'ביחד (בנט)' },
  { re: /Religious Zionist/,                    id: 'tzionut',    he: 'הציונות הדתית' },
  { re: /^Zehut$/,                               id: 'tzionut',    he: 'זהות (פייגלין)' },
  { re: /Otzma Yehudit/,                        id: 'otzma',      he: 'עוצמה יהודית' },
  { re: /Blue and White|National Unity \(Israel\)/, id: 'mamlachti', he: 'המחנה הממלכתי (כחול לבן)' },
  { re: /^Shas$/,                                id: 'shas',       he: 'ש"ס' },
  { re: /United Torah Judaism/,                  id: 'utj',        he: 'יהדות התורה' },
  { re: /Yisrael Beiteinu/,                      id: 'beytenu',    he: 'ישראל ביתנו' },
  { re: /United Arab List|^Ra.?am/,              id: 'raam',       he: 'רע"ם' },
  { re: /Joint List|Hadash/,                     id: 'hadash',     he: 'חד"ש-תע"ל' },
  { re: /^Balad$/,                               id: 'balad',      he: 'בל"ד', outside: true },
  { re: /The Democrats \(Israel\)/,              id: 'democrats',  he: 'הדמוקרטים' },
  { re: /^Yashar/,                               id: 'yashar',     he: 'יש"ר' },
  { re: /Amcha Yisrael/,                         id: 'amcha',      he: 'עמך ישראל' },
  { re: /^The Reservists/,                       id: 'hendelzelikha', he: 'יועז הנדל' },
  { re: /New Economic Party/,                    id: 'hendelzelikha', he: 'ירון זליכה' }
];
// שמות עבריים ידועים לרשימות חדשות שעדיין אינן במאגר המפלגות שלנו (מוצגות כ-excluded)
const KNOWN_OUTSIDE_HE = { 'Unity (Israel)': 'אחדות (ארדן-אדלשטיין)' };
// עמודות ליבה יציבות שחייבות להופיע כדי שנזהה טבלה כטבלת התוצאות הנוכחית (לא טבלת תרחיש/היסטוריה)
const REQUIRED_CORE = ['likud', 'bennett', 'tzionut', 'otzma', 'mamlachti', 'shas', 'utj', 'beytenu'];

function classifyLink(title) {
  for (const p of PARTY_PATTERNS) if (p.re.test(title)) return { id: p.id, he: p.he, outside: !!p.outside };
  return { id: null, he: KNOWN_OUTSIDE_HE[title] || title, outside: true };
}

function stripRefs(s) { return s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, ''); }
function plainText(s) {
  return stripRefs(s)
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/^[\s|]+|[\s|]+$/g, '')
    .trim();
}
function rowCells(row) {
  return row.split('\n').map(l => l.trim())
    .filter(l => l.startsWith('|') && !l.startsWith('|-') && !l.startsWith('|}'))
    .map(l => l.slice(1));
}
// כותרת הטבלה (שורה ראשונה, תאי `!`): מחלץ את קישורי כל תא, לפי סדר העמודות בפועל.
// תא כותרת עם colspan (כמו איחוד טכני של שתי רשימות תחת כותרת משותפת) מכיל בד"כ קישור
// לכל רשימה בנפרד — מרחיבים אותו למספר עמודות תואם ל-colspan כדי לא להזיז את שאר המיפוי.
function headerLinkCols(headerSeg) {
  return headerSeg.split('\n').map(l => l.trim())
    .filter(l => l.startsWith('!'))
    .flatMap(l => {
      const spanM = l.match(/colspan="?(\d+)/);
      const span = spanM ? parseInt(spanM[1], 10) : 1;
      const titles = [...l.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1]);
      if (!titles.length) return [];
      while (titles.length < span) titles.push(titles[titles.length - 1]);
      return titles.slice(0, span).map(title => ({ title, ...classifyLink(title) }));
    });
}
// מפריד קידומת אטריבוטים (style/colspan) מגוף התא, ומזהה: מנדטים / אחוז מתחת לחסימה / ריק
function parseCell(raw) {
  let attrs = '', body = raw;
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const two = raw.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; i++; continue; }
    if (raw[i] === '|' && depth === 0) {
      const before = raw.slice(0, i);
      if (/=/.test(before) && !/\{\{|\[\[/.test(before)) { attrs = before; body = raw.slice(i + 1); }
      break;
    }
  }
  const spanM = attrs.match(/colspan="?(\d+)/);
  body = body.trim();
  let seats = null, pct = null;
  if (/\{\{\s*N\/A/i.test(body) || /^\{\{Hidden/i.test(body) || body === '–' || body === '-' || body === '') {
    seats = null;
  } else {
    const nm = plainText(body).match(/^(\d{1,2})$/);
    const pm = body.match(/\(?([\d.]+)%\)?/);
    if (nm) seats = parseInt(nm[1], 10);
    else if (pm) pct = parseFloat(pm[1]);
  }
  return { body, span: spanM ? parseInt(spanM[1], 10) : 1, seats, pct };
}
function parseDate(cell) {
  const m = cell.match(/\{\{\s*Opdrts\s*\|([^}]*)\}\}/i);
  if (m) {
    const parts = m[1].split('|').map(x => x.trim()).filter(Boolean);
    const year = parts[parts.length - 1], mon = MONTHS[(parts[parts.length - 2] || '').toLowerCase()], day = parts[parts.length - 3];
    if (year && mon && day) return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const t = plainText(cell);
  const m2 = t.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m2) { const mon = MONTHS[m2[2].toLowerCase()]; if (mon) return `${m2[3]}-${String(mon).padStart(2, '0')}-${String(m2[1]).padStart(2, '0')}`; }
  return null;
}
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

const { memo, canonical, tooMany } = require('./_shared');

module.exports = async (req, res) => {
  if (canonical(req, res, [], '/api/live-polls')) return;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  if (tooMany('live-polls', 40, 60000)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ ok: false, error: 'rate-limited' });
  }
  try {
    // הוויקיטקסט (~230KB) נמשך לכל היותר פעם ב-15 דקות לכל מופע
    const out = await memo('live-polls', 15 * 60 * 1000, async () => {
    const r = await fetch(API, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return { ok: false, error: 'wiki-http-' + r.status };
    const j = await r.json();
    const wt = j && j.parse && j.parse.wikitext;
    const revid = j && j.parse && j.parse.revid;
    if (!wt) return { ok: false, error: 'no-wikitext' };

    // איתור טבלת התוצאות: סורקים את כל הטבלאות בעמוד ובוחרים את הראשונה שכותרתה
    // מכילה את כל 8 המפלגות היציבות (ליבה) שתמיד מופיעות בטבלת התוצאות הנוכחית —
    // לא טבלאות תרחיש/היסטוריה. סדר ומספר שאר העמודות נגזר דינמית מהכותרת בפועל,
    // כך שרשימות חדשות/שנעלמו לא שוברות את הפירסור. אם אף טבלה לא תואמת —
    // מבנה המקור השתנה מהותית, ומחזירים שגיאה בטוחה במקום נתונים שגויים.
    let table = null, partyCols = null, lastSeen = [];
    let idx = 0;
    while (true) {
      const s = wt.indexOf('{|', idx);
      if (s < 0) break;
      const e = wt.indexOf('\n|}', s);
      const seg = wt.slice(s, e > 0 ? e : undefined);
      const headerEnd = seg.search(/\n\|-/);
      const headerSeg = seg.slice(0, headerEnd > 0 ? headerEnd : seg.length);
      const cols = headerLinkCols(headerSeg);
      const recognizedIds = cols.filter(c => c.id).map(c => c.id);
      lastSeen = recognizedIds;
      if (REQUIRED_CORE.every(id => recognizedIds.includes(id))) { table = seg; partyCols = cols; break; }
      idx = e > 0 ? e + 2 : s + 2;
    }
    if (!table) return { ok: false, error: 'source-format-changed', got: lastSeen };

    const rows = table.split(/\n\|-/).slice(1);
    const polls = [];
    for (const row of rows) {
      if (polls.length >= 4) break;
      const cells = rowCells(row);
      if (cells.length < 10) continue;
      const date = parseDate(cells[0]);
      if (!date) continue;
      const parsed = cells.slice(1).map(parseCell);
      const firm = plainText(parsed[0] ? parsed[0].body : '') || 'לא צוין';
      const publisher = plainText(parsed[1] ? parsed[1].body : '') || '';

      let cursor = 0; const seatByCol = {}; const combined = [];
      for (let ci = 3; ci < parsed.length && cursor < partyCols.length; ci++) {
        const c = parsed[ci];
        if (c.span > 1) {
          const covered = partyCols.slice(cursor, cursor + c.span);
          if (c.seats != null) combined.push({ cols: covered, seats: c.seats });
          cursor += c.span;
        } else {
          seatByCol[partyCols[cursor].id || partyCols[cursor].title] = { col: partyCols[cursor], cell: c };
          cursor++;
        }
      }
      // מפלגה במאגר שלנו (col.outside===false) שלא עברה אחוז חסימה בסקר הזה ספציפית לא
      // נעלמת בשקט — מדווחת ב-notIncluded, כדי שהלקוח יציג אותה במפורש כ"לא נכללה בסקר הנוכחי".
      const figures = []; const excluded = []; const notIncluded = [];
      partyCols.forEach(col => {
        const entry = seatByCol[col.id || col.title];
        const v = entry && entry.cell;
        if (col.outside) {
          if (v && v.seats != null) excluded.push({ name: col.he, seats: v.seats });
          return;
        }
        if (v && v.seats != null) figures.push({ partyId: col.id, party: col.he, seats: v.seats });
        else notIncluded.push({ partyId: col.id, party: col.he, pct: (v && v.pct != null) ? v.pct : null });
      });
      combined.forEach(cb => {
        const inside = cb.cols.filter(c => !c.outside);
        const label = cb.cols.map(c => c.he).join(' + ');
        if (inside.length) figures.push({ partyId: inside[0].id, party: label, seats: cb.seats, combined: true });
        else excluded.push({ name: label, seats: cb.seats });
      });
      if (figures.length < 8) continue;
      figures.sort((a, b) => b.seats - a.seats);
      const um = row.match(/url\s*=\s*(https?:\/\/[^\s|}\]]+)/);
      polls.push({
        date,
        pollster: firm + (publisher ? ' · ' + publisher : ''),
        sourceUrl: um ? um[1] : PAGE_URL,
        figures,
        excluded,
        notIncluded,
        sum: figures.reduce((a, f) => a + f.seats, 0) + excluded.reduce((a, f) => a + f.seats, 0)
      });
    }
    if (!polls.length) return { ok: false, error: 'no-valid-rows' };
    return {
      ok: true,
      source: 'ויקיפדיה — סקרי הבחירות לכנסת ה-26',
      pageUrl: PAGE_URL,
      revid,
      fetchedAt: Date.now(),
      polls
    };
    });
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
