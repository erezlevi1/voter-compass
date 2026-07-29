// api/_shared.js — הגנות משותפות לכל פונקציות השרת.
// (קובץ שמתחיל ב-_ אינו נתיב ציבורי ב-Vercel.)
//
// שלוש בעיות שזה פותר:
// 1. עקיפת קאש: כל פרמטר שאילתה שרירותי (?x=1, ?x=2 ...) יוצר מפתח קאש חדש,
//    ולכן כל בקשה מריצה את הפונקציה מחדש. לולאה פשוטה יכולה למצות את מכסת
//    ההרצות והתעבורה של החשבון.
// 2. הגברה: קריאה אחת ל-/api/news מייצרת 6 בקשות יוצאות לאתרי חדשות. תוקף
//    יכול להשתמש בנו כמגבר, ולגרום לחסימת כתובת ה-IP שלנו אצל אותם אתרים.
// 3. SSRF: כתובת הבסיס נבנתה מכותרת Host שהשולח שולט בה.

const BASE = 'https://voter-compass.vercel.app';

// זיכרון ברמת המודול: נשמר בין הרצות על אותו מופע חם, כך שהמון בקשות
// רצופות אינן מתורגמות להמון בקשות יוצאות.
const _memo = new Map();
async function memo(key, ttlMs, fn) {
  const now = Date.now();
  const hit = _memo.get(key);
  if (hit && now - hit.at < ttlMs) return hit.val;
  // אם קריאה זהה כבר בדרך, ממתינים לה במקום לפתוח עוד אחת
  if (hit && hit.pending) return hit.pending;
  const pending = (async () => {
    try {
      const val = await fn();
      _memo.set(key, { at: Date.now(), val });
      return val;
    } catch (e) {
      // בכשל: מחזירים ערך ישן אם קיים, כדי לא להעניש משתמשים אמיתיים
      if (hit && 'val' in hit) return hit.val;
      _memo.delete(key);
      throw e;
    }
  })();
  _memo.set(key, { ...(hit || {}), at: hit ? hit.at : 0, pending });
  return pending;
}

// מנרמל את הבקשה לכתובת קנונית. פרמטר לא מוכר => הפניה 301 לכתובת הנקייה,
// שמוגשת מהקאש. התוקף מקבל תשובה זולה, ולא הרצה מלאה עם בקשות יוצאות.
// appendAllowed=false כשהפרמטרים כבר מקודדים בנתיב היעד (למשל /guide/party/likud)
function canonical(req, res, allowed, path, appendAllowed = true) {
  const q = (req && req.query) || {};
  const extra = Object.keys(q).filter(k => !allowed.includes(k));
  if (!extra.length) return false;
  const kept = appendAllowed ? allowed
    .filter(k => q[k] != null && q[k] !== '')
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(String(q[k]).slice(0, 64))}`)
    .join('&') : '';
  res.setHeader('Cache-Control', 'public, s-maxage=86400');
  res.setHeader('Location', `${BASE}${path}${kept ? '?' + kept : ''}`);
  res.status(301).end();
  return true;
}

// מגבלת קצב גסה לכל מופע חם. אינה תחליף ל-WAF, אבל עוצרת לולאה נאיבית
// לפני שהיא מייצרת בקשות יוצאות.
const _hits = new Map();
function tooMany(key, max, windowMs) {
  const now = Date.now();
  const e = _hits.get(key);
  if (!e || now - e.start > windowMs) { _hits.set(key, { start: now, n: 1 }); return false; }
  e.n++;
  if (_hits.size > 500) _hits.clear();
  return e.n > max;
}

module.exports = { BASE, memo, canonical, tooMany };
