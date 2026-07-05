// api/live-polls.js — צינור נתונים חיים (Vercel): ויקיפדיה → פירסור → שער אימות → JSON
// מושך את טבלת הסקרים מעמוד הסקרים האנגלי של ויקיפדיה (מקור מובנה, מתוחזק ומתוארך),
// ממפה כל עמודה למזהה מפלגה קבוע במאגר, ומחזיר רק שורות שלמות. הלקוח מריץ שער
// אימות שני (הגנה כפולה) לפני שהנתונים נכנסים לתצוגה — נתון שנכשל לא נכנס.
const PAGE = 'Opinion_polling_for_the_2026_Israeli_legislative_election';
const PAGE_URL = 'https://en.wikipedia.org/wiki/' + PAGE;
const API = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext%7Crevid&format=json&formatversion=2&page=' + PAGE;
const UA = 'VoterCompassBot/1.0 (+https://voter-compass.vercel.app; public Wikipedia API, polls table only)';

// סדר העמודות בטבלת התוצאות, אומת מול כותרת הטבלה (יולי 2026).
// אם ויקיפדיה תשנה את מבנה הטבלה — בדיקת הכותרת תיכשל והפונקציה תחזיר שגיאה בטוחה,
// לא נתונים שגויים. balad/reservists אינן במאגר המפלגות ולכן מדווחות בנפרד (excluded).
const HEADER_ORDER = ['Likud','Together (Israel)','Religious Zionist Party','Otzma Yehudit','Blue and White (political party)','Shas','United Torah Judaism','Yisrael Beiteinu','Joint List','The Democrats (Israel)','Yashar (political party)','The Reservists (political party)'];
const COLS = [
  { id: 'likud',      he: 'הליכוד' },
  { id: 'bennett',    he: 'ביחד (בנט)' },
  { id: 'tzionut',    he: 'הציונות הדתית' },
  { id: 'otzma',      he: 'עוצמה יהודית' },
  { id: 'mamlachti',  he: 'המחנה הממלכתי (כחול לבן)' },
  { id: 'shas',       he: 'ש"ס' },
  { id: 'utj',        he: 'יהדות התורה' },
  { id: 'beytenu',    he: 'ישראל ביתנו' },
  { id: 'raam',       he: 'רע"ם' },
  { id: 'hadash',     he: 'חד"ש-תע"ל' },
  { id: 'balad',      he: 'בל"ד', outside: true },
  { id: 'democrats',  he: 'הדמוקרטים' },
  { id: 'yashar',     he: 'יש"ר' },
  { id: 'reservists', he: 'המילואימניקים', outside: true }
];
const MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  try {
    const r = await fetch(API, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'wiki-http-' + r.status });
    const j = await r.json();
    const wt = j && j.parse && j.parse.wikitext;
    const revid = j && j.parse && j.parse.revid;
    if (!wt) return res.status(200).json({ ok: false, error: 'no-wikitext' });

    // איתור טבלת התוצאות: סורקים את כל הטבלאות בעמוד ובוחרים את זו שכותרתה
    // מכילה את כל עמודות המפלגות בדיוק בסדר הצפוי. ([[Likud]] מופיע גם בטקסט
    // חופשי בעמוד, לכן אי אפשר לעגן עליו ישירות.) אם אף טבלה לא תואמת —
    // מבנה המקור השתנה, ומחזירים שגיאה בטוחה במקום נתונים שגויים.
    let table = null, lastSeen = [];
    let idx = 0;
    while (true) {
      const s = wt.indexOf('{|', idx);
      if (s < 0) break;
      const e = wt.indexOf('\n|}', s);
      const seg = wt.slice(s, e > 0 ? e : undefined);
      const hE = seg.indexOf('{{Opdrts');
      const hSeg = seg.slice(0, hE > 0 ? hE : 4000);
      const links = [...hSeg.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map(m => m[1]);
      const seen = [];
      links.forEach(l => { if (HEADER_ORDER.includes(l) && !seen.includes(l)) seen.push(l); });
      if (seen.length) lastSeen = seen;
      if (seen.join('¦') === HEADER_ORDER.join('¦')) { table = seg; break; }
      idx = e > 0 ? e + 2 : s + 2;
    }
    if (!table) return res.status(200).json({ ok: false, error: 'source-format-changed', got: lastSeen });

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
      for (let ci = 3; ci < parsed.length && cursor < COLS.length; ci++) {
        const c = parsed[ci];
        if (c.span > 1) {
          const covered = COLS.slice(cursor, cursor + c.span);
          if (c.seats != null) combined.push({ cols: covered, seats: c.seats });
          cursor += c.span;
        } else {
          seatByCol[COLS[cursor].id] = c;
          cursor++;
        }
      }
      const figures = []; const excluded = [];
      COLS.forEach(col => {
        const v = seatByCol[col.id];
        if (!v || v.seats == null) return;
        if (col.outside) excluded.push({ name: col.he, seats: v.seats });
        else figures.push({ partyId: col.id, party: col.he, seats: v.seats });
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
        sum: figures.reduce((a, f) => a + f.seats, 0) + excluded.reduce((a, f) => a + f.seats, 0)
      });
    }
    if (!polls.length) return res.status(200).json({ ok: false, error: 'no-valid-rows' });
    res.status(200).json({
      ok: true,
      source: 'ויקיפדיה — סקרי הבחירות לכנסת ה-26',
      pageUrl: PAGE_URL,
      revid,
      fetchedAt: Date.now(),
      polls
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
