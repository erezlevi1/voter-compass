// api/sitemap.js — מפת אתר שנבנית מהנתונים החיים.
// למה לא קובץ סטטי: (1) גוגל משתמש ב-lastmod כדי להחליט מה לסרוק קודם, וקובץ
// סטטי לא יכול לדעת שעמוד הסקרים התעדכן היום; (2) כשרשימת המפלגות משתנה
// (מיזוג, רשימה חדשה) המפה מתעדכנת מעצמה, בלי תחזוקה ידנית.
// בטיחות: כל כשל נופל לרשימה קבועה — הפונקציה לעולם לא מחזירה מפה ריקה.
const BASE = 'https://voter-compass.vercel.app';

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/guide/parties', changefreq: 'weekly', priority: '0.9' },
  { path: '/guide/polls', changefreq: 'daily', priority: '0.9' },
  { path: '/guide/issues', changefreq: 'weekly', priority: '0.8' },
  { path: '/guide/glossary', changefreq: 'monthly', priority: '0.8' },
  { path: '/guide/faq', changefreq: 'monthly', priority: '0.8' },
  { path: '/guide/trust', changefreq: 'monthly', priority: '0.8' }
];
// רשת ביטחון: אם משיכת הנתונים נכשלת, עדיין מוגשת מפה מלאה ותקינה.
const FALLBACK_PARTIES = ['likud', 'yeshatid', 'mamlachti', 'shas', 'utj', 'tzionut', 'otzma', 'beytenu', 'democrats', 'hadash', 'raam', 'bennett', 'yashar'];
const FALLBACK_ISSUES = ['draft', 'judicial', 'war', 'inquiry', 'religionstate', 'economy', 'territories'];

const day = d => {
  const t = new Date(d);
  return isNaN(t) ? null : t.toISOString().slice(0, 10);
};

async function grab(origin, name) {
  try {
    const r = await fetch(`${origin}/data/${name}.json`, { signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  const origin = req.headers && req.headers.host ? `https://${req.headers.host}` : BASE;
  const today = day(Date.now());
  let parties = FALLBACK_PARTIES, issues = FALLBACK_ISSUES;
  let contentMod = today, pollsMod = today;

  try {
    const [pj, ij, mj, plj] = await Promise.all([
      grab(origin, 'parties'), grab(origin, 'issues'), grab(origin, 'meta'), grab(origin, 'polls')
    ]);
    if (Array.isArray(pj) && pj.length) parties = pj.map(p => p.id).filter(Boolean);
    if (Array.isArray(ij) && ij.length) issues = [...new Set(ij.map(i => i.explainer).filter(Boolean))];
    // עמודי התוכן משתנים כשהמאגר מתעדכן; עמוד הסקרים — כשמתפרסם סקר חדש.
    if (mj && mj.lastUpdated) contentMod = day(mj.lastUpdated) || today;
    // תאריך הסקר האחרון — מהמאגר הידני ומהצינור החי גם יחד. חשוב שיהיה מדויק:
    // lastmod שמצהיר על טריות שאינה קיימת גורם לגוגל להתעלם מהשדה.
    const dates = [contentMod];
    const latest = plj && Array.isArray(plj.polls) && plj.polls.find(p => p.date);
    if (latest) dates.push(day(latest.date));
    try {
      const lr = await fetch(`${origin}/api/live-polls`, { signal: AbortSignal.timeout(5000) });
      if (lr.ok) {
        const lj = await lr.json();
        if (lj && lj.ok && Array.isArray(lj.polls) && lj.polls.length) dates.push(day(lj.polls[0].date));
      }
    } catch (e) { /* נשארים עם מה שיש */ }
    pollsMod = dates.filter(Boolean).sort().pop() || contentMod;
  } catch (e) { /* נשארים עם ברירות המחדל */ }

  const rows = [];
  const add = (path, changefreq, priority, lastmod) => {
    rows.push(`  <url>
    <loc>${BASE}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`);
  };
  STATIC_PAGES.forEach(p => add(p.path, p.changefreq, p.priority, p.path === '/guide/polls' ? pollsMod : contentMod));
  parties.forEach(id => add(`/guide/party/${id}`, 'weekly', '0.7', contentMod));
  issues.forEach(id => add(`/guide/issue/${id}`, 'weekly', '0.7', contentMod));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>
`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
};
