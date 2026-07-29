// api/page.js — עמודי תוכן שגוגל יכול לסרוק.
// האפליקציה מנווטת ב-hash (#/), וגוגל מתעלם ממה שאחרי ה-#: בפועל יש לאתר עמוד
// אחד בלבד באינדקס. הפונקציה הזו מגישה HTML אמיתי, מלא בתוכן, שנבנה בזמן הבקשה
// מאותם קבצי נתונים שהאפליקציה משתמשת בהם — כך שהעמודים תמיד עדכניים בלי בנייה
// מחדש ובלי תחזוקה, וכל אחד מהם מפנה לגרסה האינטראקטיבית.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BASE = 'https://voter-compass.vercel.app';

const { memo, canonical, tooMany } = require('./_shared');

// כתובת הבסיס קבועה ואינה נגזרת מכותרת Host — כותרת שהשולח שולט בה יכולה
// להפנות את הבקשות היוצאות לשרת זר (SSRF).
async function loadData(_host, names) {
  const out = {};
  await Promise.all(names.map(async n => {
    // כל קובץ נתונים נמשך לכל היותר פעם ב-10 דקות לכל מופע חם
    out[n] = await memo(`data:${n}`, 10 * 60 * 1000, async () => {
      try {
        const r = await fetch(`${BASE}/data/${n}.json`, { signal: AbortSignal.timeout(6000) });
        return r.ok ? await r.json() : null;
      } catch (e) { return null; }
    }).catch(() => null);
  }));
  return out;
}

function heDate(s) {
  const d = new Date(s);
  if (isNaN(d)) return String(s || '');
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function shell({ title, desc, path, body, schema }) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}${path}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}${path}">
<meta property="og:image" content="${BASE}/og-image.png">
<meta property="og:locale" content="he_IL">
<meta name="theme-color" content="#1F4E46">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='11' fill='%231F4E46'/%3E%3Cpath d='M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z' fill='%23FBF9F4'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@700;800&family=Heebo:wght@400;500;600;700&display=swap" rel="stylesheet">
${schema ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>` : ''}
<style>
:root{--paper:#FBF9F4;--ink:#1A1714;--ink-2:#4A453E;--ink-3:#7A736A;--line:#E2DCD0;--surface:#fff;--accent:#1F4E46;--gold:#9A7B2E}
@media(prefers-color-scheme:dark){:root{--paper:#15140F;--ink:#F2EEE4;--ink-2:#C2BBAC;--ink-3:#8C8576;--line:#2C2A22;--surface:#1E1C16;--accent:#6FBFAE;--gold:#C9A75A}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Heebo,system-ui,sans-serif;background:var(--paper);color:var(--ink);line-height:1.65;-webkit-font-smoothing:antialiased}
.wrap{max-width:860px;margin-inline:auto;padding:0 20px}
header.top{border-bottom:1px solid var(--line);padding:14px 0;margin-bottom:26px}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand{font-family:"Frank Ruhl Libre",Georgia,serif;font-weight:800;font-size:1.15rem;color:var(--ink);text-decoration:none}
.cta{background:var(--accent);color:#fff;padding:8px 16px;border-radius:9px;text-decoration:none;font-weight:600;font-size:.9rem}
h1{font-family:"Frank Ruhl Libre",Georgia,serif;font-size:clamp(1.7rem,4.5vw,2.4rem);line-height:1.18;margin-bottom:10px}
h2{font-family:"Frank Ruhl Libre",Georgia,serif;font-size:1.35rem;margin:30px 0 12px}
h3{font-family:"Frank Ruhl Libre",Georgia,serif;font-size:1.05rem;margin-bottom:5px}
p{margin-bottom:13px;color:var(--ink-2)}
.lead{font-size:1.06rem;color:var(--ink-2);margin-bottom:22px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:15px 17px;margin-bottom:11px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:11px}
table{width:100%;border-collapse:collapse;font-size:.94rem}
th,td{text-align:right;padding:9px 10px;border-bottom:1px solid var(--line)}
th{font-weight:700;color:var(--ink-3);font-size:.85rem}
.tw{overflow-x:auto}
.ballot{display:inline-block;background:var(--accent);color:#fff;font-weight:700;border-radius:6px;padding:1px 9px;font-size:.85rem}
.live-tag{display:inline-block;font-size:.66rem;font-weight:700;color:#1E7A4A;border:1px solid currentColor;border-radius:20px;padding:1px 8px;vertical-align:middle;white-space:nowrap}
@media(prefers-color-scheme:dark){.live-tag{color:#5BBF86}}
a{color:var(--accent)}
.note{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:13px 15px;margin:20px 0;font-size:.9rem;color:var(--ink-2)}
.note strong{color:var(--ink)}
footer{border-top:1px solid var(--line);margin-top:40px;padding:22px 0 40px;font-size:.85rem;color:var(--ink-3)}
footer a{color:var(--ink-3);margin-inline-end:14px}
.more{display:flex;gap:9px;flex-wrap:wrap;margin:22px 0}
.more a{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:6px 14px;text-decoration:none;font-size:.88rem;font-weight:500}
</style>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="${BASE}/">מצפן הבוחר</a>
  <a class="cta" href="${BASE}/#/quiz">בדקו למי אתם מתאימים ←</a>
</div></header>
<div class="wrap">
${body}
<div class="more">
  <a href="${BASE}/guide/parties">כל המפלגות</a>
  <a href="${BASE}/guide/polls">סקרים אחרונים</a>
  <a href="${BASE}/guide/issues">נושאי הבחירות</a>
  <a href="${BASE}/guide/glossary">מילון מונחים</a>
  <a href="${BASE}/guide/faq">שאלות נפוצות</a>
  <a href="${BASE}/guide/trust">איך שומרים על ניטרליות</a>
</div>
</div>
<footer><div class="wrap">
  <p>מצפן הבוחר — כלי עצמאי, נייטרלי ולא־מפלגתי להתמצאות לקראת הבחירות לכנסת ה-26. איננו מסונפים לאף מפלגה ואיננו ממומנים על ידי גורם פוליטי. התכנים הם סיכום ממקורות פומביים ואינם המלצת הצבעה.</p>
  <a href="${BASE}/">לאפליקציה המלאה</a><a href="${BASE}/#/trust">מרכז האמון</a><a href="${BASE}/#/privacy">פרטיות</a><a href="${BASE}/#/accessibility">נגישות</a>
</div></footer>
</body></html>`;
}

function pollsBlocked(meta) {
  const b = meta && meta.pollBlackout; if (!b) return false;
  const now = Date.now(), f = Date.parse(b.from), u = Date.parse(b.until);
  return !isNaN(f) && !isNaN(u) && now >= f && now <= u;
}

const PAGES = {
  async parties(host) {
    const d = await loadData(host, ['parties', 'meta']);
    const P = (d.parties || []).filter(p => p.runs2026 !== false).sort((a, b) => (b.seats || 0) - (a.seats || 0));
    const merged = (d.parties || []).filter(p => p.runs2026 === false);
    const rows = P.map(p => `<tr><td><a href="${BASE}/guide/party/${esc(p.id)}"><strong>${esc(p.name)}</strong></a></td><td>${p.ballot ? `<span class="ballot">${esc(p.ballot)}</span>` : '<span style="color:var(--ink-3)">טרם נקבעה</span>'}</td><td>${esc(p.leader)}</td><td>${esc(p.bloc)}</td><td>${p.seats > 0 ? p.seats : '—'}</td></tr>`).join('');
    const cards = P.map(p => `<div class="card"><h3><a href="${BASE}/guide/party/${esc(p.id)}">${esc(p.name)}</a>${p.ballot ? ` <span class="ballot">${esc(p.ballot)}</span>` : ''}</h3><p style="margin:0"><strong>${esc(p.leader)}</strong> · גוש ${esc(p.bloc)}${p.seats > 0 ? ` · ${p.seats} מנדטים בכנסת ה-25` : ' · רשימה חדשה'}<br>${esc(p.essence)}<br><a href="${BASE}/guide/party/${esc(p.id)}">לעמוד המלא של ${esc(p.name)} ←</a></p></div>`).join('');
    return {
      title: 'כל המפלגות בבחירות 2026 — אותיות הפתק, מנהיגים ועמדות | מצפן הבוחר',
      desc: `רשימת כל המפלגות המתמודדות בבחירות לכנסת ה-26 (27.10.2026): אות הפתק בקלפי, ראש הרשימה, גוש ומנדטים. ${P.length} רשימות, מידע ניטרלי ומעודכן.`,
      path: '/guide/parties',
      body: `<h1>כל המפלגות בבחירות לכנסת ה-26</h1>
<p class="lead">${P.length} רשימות מתמודדות בבחירות שיתקיימו ב-27 באוקטובר 2026. לכל רשימה: האות שמופיעה על פתק ההצבעה בקלפי, ראש הרשימה, השיוך לגוש ומספר המנדטים בכנסת היוצאת.</p>
<div class="tw"><table><thead><tr><th>מפלגה</th><th>אות הפתק</th><th>בראשות</th><th>גוש</th><th>מנדטים (כנסת ה-25)</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="note">אות הפתק נקבעת רשמית בעת הגשת הרשימות לוועדת הבחירות; רשימות חדשות מסומנות "טרם נקבעה". מספרי המנדטים הם תוצאות הכנסת ה-25 (2022) — לתמונה עדכנית ראו <a href="${BASE}/guide/polls">הסקרים האחרונים</a>.</div>
<h2>מה כל מפלגה מייצגת</h2>${cards}
${merged.length ? `<h2>רשימות שהתמזגו</h2><p>${merged.map(p => `<a href="${BASE}/guide/party/${esc(p.id)}">${esc(p.name)}</a>`).join(', ')} — אינה רצה עצמאית בבחירות 2026.</p>` : ''}
<h2>לא בטוחים למי אתם מתאימים?</h2><p><a href="${BASE}/#/quiz">שאלון ההתאמה</a> מציג ${11} אמירות על נושאי הליבה ומראה עם אילו מפלגות העמדות שלכם מתיישבות. אנונימי לחלוטין — התשובות לא נשמרות ולא נשלחות לשום מקום.</p>`,
      schema: { '@context': 'https://schema.org', '@type': 'ItemList', name: 'המפלגות בבחירות לכנסת ה-26', numberOfItems: P.length, itemListElement: P.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name })) }
    };
  },
  async polls(host) {
    const d = await loadData(host, ['polls', 'meta', 'parties']);
    const blocked = pollsBlocked(d.meta);
    const base = ((d.polls && d.polls.polls) || []).filter(p => p.figures && p.figures.length);
    // הסקרים החיים נמשכים מאותו צינור שמזין את האפליקציה, כדי שהעמוד לא יציג
    // נתון בן שבועות. בתקופת איסור הפרסום לא מושכים כלל — רק מה שכבר פורסם.
    let live = [];
    if (!blocked) {
      try {
        const j = await memo('page:live-polls', 15 * 60 * 1000, async () => {
          const r = await fetch(`${BASE}/api/live-polls`, { signal: AbortSignal.timeout(7000) });
          return r.ok ? await r.json() : null;
        });
        {
          if (j && j.ok && Array.isArray(j.polls)) {
            const seen = new Set(base.map(p => `${p.date}|${p.pollster}`));
            live = j.polls.filter(p => p.figures && p.figures.length && !seen.has(`${p.date}|${p.pollster}`))
              .map(p => ({ ...p, live: true }));
          }
        }
      } catch (e) { /* נופלים למאגר הידני בלבד */ }
    }
    const list = [...live, ...base]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 6);
    const nameOf = f => f.party || ((d.parties || []).find(x => x.id === f.partyId) || {}).name || '';
    const blocks = list.map(pl => `<div class="card"><h3>${esc(pl.pollster)} · ${esc(heDate(pl.date))}${pl.live ? ' <span class="live-tag">נמשך אוטומטית · עבר אימות</span>' : ''}</h3>
${pl.summary ? `<p style="margin:6px 0 9px">${esc(pl.summary)}</p>` : ''}
<div class="tw"><table><tbody>${[...pl.figures].sort((a, b) => b.seats - a.seats).map(f => `<tr><td>${esc(nameOf(f))}</td><td style="width:60px;font-weight:700">${f.seats}</td></tr>`).join('')}</tbody></table></div>
${pl.sourceUrl ? `<p style="margin:9px 0 0"><a href="${esc(pl.sourceUrl)}" target="_blank" rel="noopener nofollow">לסקר המלא במקור ←</a></p>` : ''}</div>`).join('');
    const latest = list[0];
    return {
      title: 'סקרים אחרונים לבחירות 2026 — מנדטים לפי מכוני הסקרים | מצפן הבוחר',
      desc: latest ? `הסקרים העדכניים לקראת הבחירות לכנסת ה-26. הסקר האחרון (${latest.pollster}, ${heDate(latest.date)}) וסקרים נוספים, עם קישור לפרסום המקורי.` : 'הסקרים העדכניים לקראת הבחירות לכנסת ה-26, עם קישור לפרסום המקורי.',
      path: '/guide/polls',
      body: `<h1>הסקרים האחרונים לבחירות לכנסת ה-26</h1>
<p class="lead">ריכוז סקרי המנדטים העדכניים לקראת הבחירות ב-27 באוקטובר 2026. הנתונים נאספים אוטומטית ממקורות פומביים ועוברים בדיקות תקינות לפני הצגה; לכל סקר מצורף קישור לפרסום המקורי, שבו המתודולוגיה המלאה.</p>
${blocked ? `<div class="note"><strong>תקופת איסור פרסום סקרים.</strong> לפי חוק הבחירות (דרכי תעמולה), התשי"ט-1959, אין לפרסם תוצאות סקר שלא פורסמו קודם לכן — מתום יום שישי שלפני פתיחת הקלפיות ועד סגירתן. מוצגים רק סקרים שכבר פורסמו.</div>` : ''}
${blocks || '<p>אין כרגע סקרים עם פירוט מנדטים במאגר.</p>'}
<div class="note">סקר הוא תמונת מצב ולא תחזית. לכל סקר טעות דגימה, והתוצאות משתנות בין מכוני הסקרים ובין מועדים. מפלגות מתחת לאחוז החסימה (3.25%) אינן מקבלות מנדטים — ראו <a href="${BASE}/guide/glossary">מילון המונחים</a>.</div>
<h2>איך זה מתורגם למנדטים?</h2><p>הכנסת מונה 120 מושבים המחולקים באופן יחסי בין הרשימות שעברו את אחוז החסימה. <a href="${BASE}/guide/glossary">מילון המונחים</a> מסביר את אחוז החסימה, שיטת בדר-עופר והסכמי עודפים.</p>`,
      schema: { '@context': 'https://schema.org', '@type': 'Dataset', name: 'סקרי הבחירות לכנסת ה-26', description: 'ריכוז סקרי מנדטים לקראת הבחירות לכנסת ה-26', inLanguage: 'he' }
    };
  },
  async glossary(host) {
    const d = await loadData(host, ['glossary']);
    const T = (d.glossary && d.glossary.terms) || [];
    return {
      title: 'מילון מונחי בחירות — מנדט, אחוז החסימה, בדר-עופר | מצפן הבוחר',
      desc: 'הסבר פשוט וניטרלי למונחי הבחירות בישראל: מנדט, אחוז החסימה, שיטת בדר-עופר, הסכם עודפים, קואליציה, גוש, פתק הצבעה ועוד.',
      path: '/guide/glossary',
      body: `<h1>מילון מונחי הבחירות</h1>
<p class="lead">המושגים שמאחורי הכותרות, בהסבר קצר וניטרלי. ${T.length} מונחים שכדאי להכיר לפני שנכנסים לקלפי.</p>
<div class="grid">${T.map(t => `<div class="card"><h3>${esc(t.t)}</h3><p style="margin:0;font-size:.93rem">${esc(t.d)}</p></div>`).join('')}</div>
<h2>רוצים להבין את הנושאים עצמם?</h2><p>ב<a href="${BASE}/guide/issues">עמוד הנושאים</a> תמצאו הסבר ניטרלי לכל נושא במחלוקת — עובדות מוסכמות, נקודת המחלוקת, והטיעון החזק של כל צד.</p>`,
      schema: { '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: 'מילון מונחי בחירות', hasDefinedTerm: T.map(t => ({ '@type': 'DefinedTerm', name: t.t, description: t.d })) }
    };
  },
  async faq(host) {
    const d = await loadData(host, ['glossary', 'meta']);
    const F = (d.glossary && d.glossary.faq) || [];
    return {
      title: 'שאלות נפוצות על הבחירות 2026 — מתי, מי מצביע ואיך | מצפן הבוחר',
      desc: 'התשובות לשאלות הנפוצות על הבחירות לכנסת ה-26: מתי מתקיימות הבחירות, מי רשאי להצביע, איך מצביעים, ומה קורה לקול מתחת לאחוז החסימה.',
      path: '/guide/faq',
      body: `<h1>שאלות נפוצות על הבחירות לכנסת ה-26</h1>
<p class="lead">הבחירות יתקיימו ביום שלישי, 27 באוקטובר 2026. ריכזנו את התשובות לשאלות שהכי הרבה אנשים שואלים.</p>
${F.map(f => `<div class="card"><h3>${esc(f.q)}</h3><p style="margin:0">${esc(f.a)}</p></div>`).join('')}`,
      schema: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: F.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    };
  },
  // מיפוי נושא → מפתח העמדה בקובץ המפלגות (חלק מהנושאים מפוצלים לשני צירים)
  async party(host, id) {
    const d = await loadData(host, ['parties', 'statements', 'issues', 'polls']);
    const P = d.parties || [];
    const p = P.find(x => x.id === id);
    if (!p) return null;
    const sts = (d.statements && d.statements.statements) || [];
    const scale = (d.statements && d.statements.scale && d.statements.scale.label) || {};
    const merged = p.runs2026 === false ? P.find(x => x.id === p.mergedInto) : null;
    const poll = ((d.polls && d.polls.polls) || []).find(x => x.figures && x.figures.length);
    const pollFig = poll && poll.figures.find(f => f.partyId === p.id);
    const rows = sts.map(s => {
      const v = p.positions ? p.positions[s.id] : null;
      return v == null ? '' : `<tr><td>${esc(s.text)}</td><td style="white-space:nowrap">${esc(scale[String(v)] || '—')}</td></tr>`;
    }).join('');
    const cands = (p.candidates || []).map(c => `<div class="card"><h3>${esc(c.name)}</h3><p style="margin:0;font-size:.93rem">${esc(c.role)}</p></div>`).join('');
    const others = P.filter(x => x.id !== p.id && x.runs2026 !== false).slice(0, 12);
    return {
      title: `${p.name}${p.ballot ? ` — אות הפתק ${p.ballot}` : ''} | עמדות, מועמדים ומצע בבחירות 2026`,
      desc: `${p.name} בבחירות לכנסת ה-26: ${p.ballot ? `אות הפתק ${p.ballot}, ` : ''}בראשות ${p.leader}, גוש ${p.bloc}. עמדות המפלגה בכל נושאי הליבה, הדמויות המרכזיות ברשימה ומצבה לקראת הבחירות.`,
      path: `/guide/party/${p.id}`,
      body: `<h1>${esc(p.name)}${p.ballot ? ` — אות הפתק <span class="ballot">${esc(p.ballot)}</span>` : ''}</h1>
<p class="lead">${esc(p.essence)}</p>
<div class="card"><table><tbody>
<tr><th style="width:130px">בראשות</th><td>${esc(p.leader)}</td></tr>
<tr><th>גוש</th><td>${esc(p.bloc)}</td></tr>
<tr><th>אות בפתק ההצבעה</th><td>${p.ballot ? `<span class="ballot">${esc(p.ballot)}</span>` : 'טרם נקבעה — נקבעת בעת הגשת הרשימות'}</td></tr>
<tr><th>מנדטים בכנסת ה-25</th><td>${p.seats > 0 ? p.seats : 'רשימה חדשה — ללא מנדטים בכנסת היוצאת'}</td></tr>
${pollFig ? `<tr><th>בסקר אחרון</th><td>${pollFig.seats} מנדטים (${esc(poll.pollster)}, ${esc(heDate(poll.date))})</td></tr>` : ''}
</tbody></table></div>
${merged ? `<div class="note"><strong>${esc(p.name)} אינה רצה עצמאית בבחירות 2026.</strong> ${esc(p.status2026)} הרשימה הממשיכה: <a href="${BASE}/guide/party/${esc(merged.id)}">${esc(merged.name)}</a>.</div>`
        : `<div class="note"><strong>מצב לקראת 2026:</strong> ${esc(p.status2026)}</div>`}
${rows ? `<h2>עמדות ${esc(p.name)} לפי נושא</h2>
<p>העמדות להלן הן <strong>סיכום מתומצת</strong> ממקורות פומביים (מצעים, הצהרות והצבעות) — לא ציטוט רשמי של המפלגה. הן נועדו להשוואה מהירה, ואינן תחליף לקריאת המצע המלא.</p>
<div class="tw"><table><thead><tr><th>הנושא</th><th>העמדה</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
${cands ? `<h2>דמויות מרכזיות ברשימה</h2><p>נציגים בולטים נכון להיום. רשימות 2026 טרם נסגרו רשמית.</p><div class="grid">${cands}</div>` : ''}
<h2>האם ${esc(p.name)} מתאימה לכם?</h2>
<p>במקום להסתמך על תווית, <a href="${BASE}/#/quiz">שאלון ההתאמה</a> משווה את עמדותיכם מול כל המפלגות ומראה אחוזי התאמה. אנונימי לחלוטין — התשובות מעובדות בדפדפן ואינן נשלחות לשום שרת.</p>
<h2>מפלגות נוספות</h2>
<div class="more">${others.map(x => `<a href="${BASE}/guide/party/${esc(x.id)}">${esc(x.name)}${x.ballot ? ` (${esc(x.ballot)})` : ''}</a>`).join('')}</div>`,
      schema: {
        '@context': 'https://schema.org', '@type': 'Organization', name: p.name,
        description: p.essence, memberOf: { '@type': 'Organization', name: 'הכנסת' },
        additionalProperty: p.ballot ? [{ '@type': 'PropertyValue', name: 'אות הפתק', value: p.ballot }] : undefined
      }
    };
  },
  async issue(host, id) {
    const d = await loadData(host, ['issues', 'explainers', 'parties', 'statements']);
    const I = d.issues || [], E = d.explainers || {}, P = d.parties || [];
    const it = I.find(x => x.id === id || x.explainer === id);
    const key = it ? it.explainer : id;
    const e = E[key];
    if (!e) return null;
    const sts = ((d.statements && d.statements.statements) || []).filter(s => s.explainer === key);
    const scale = (d.statements && d.statements.scale && d.statements.scale.label) || {};
    const active = P.filter(x => x.runs2026 !== false);
    const tables = sts.map(s => {
      const rows = active.map(x => {
        const v = x.positions ? x.positions[s.id] : null;
        return v == null ? '' : `<tr><td><a href="${BASE}/guide/party/${esc(x.id)}">${esc(x.name)}</a></td><td style="white-space:nowrap">${esc(scale[String(v)] || '—')}</td></tr>`;
      }).join('');
      return rows ? `<h3 style="margin-top:20px">${esc(s.text)}</h3><div class="tw"><table><thead><tr><th>מפלגה</th><th>עמדה</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
    }).join('');
    const otherIssues = I.filter(x => (x.explainer || x.id) !== key);
    return {
      title: `${e.title} — העובדות, המחלוקת ועמדות המפלגות | מצפן הבוחר`,
      desc: `${e.title}: מה מוסכם עובדתית, במה בדיוק חלוקים, והטיעון החזק ביותר של כל צד — לצד עמדות כל המפלגות בנושא. הסבר ניטרלי, בלי לומר לכם מה לחשוב.`,
      path: `/guide/issue/${esc(key)}`,
      body: `<h1>${esc(e.title)}</h1>
${it ? `<p class="lead">${esc(it.text)}</p>` : ''}
<h2>העובדות</h2><p>${esc(e.fact)}</p>
<h2>במה בדיוק חלוקים</h2><p>${esc(e.dispute)}</p>
<h2>הטיעון של כל צד</h2>
<p>שני הטיעונים מובאים בניסוחם החזק ביותר, בלי לסמן צד כ"נכון". המטרה היא להבין את המחלוקת.</p>
<div class="card"><h3>${esc(e.for.label)}</h3><p style="margin:0">${esc(e.for.text)}</p></div>
<div class="card"><h3>${esc(e.against.label)}</h3><p style="margin:0">${esc(e.against.text)}</p></div>
${tables ? `<h2>עמדות המפלגות בנושא</h2>
<p>סיכום מתומצת ממקורות פומביים — לא ציטוט רשמי.</p>${tables}` : ''}
${e.source && e.source.url ? `<div class="note">מקור לרקע העובדתי: <a href="${esc(e.source.url)}" target="_blank" rel="noopener nofollow">${esc(e.source.name)}</a></div>` : ''}
<h2>ואיפה אתם עומדים?</h2>
<p><a href="${BASE}/#/quiz">שאלון ההתאמה</a> כולל את הנושא הזה ומראה עם אילו מפלגות עמדותיכם מתיישבות.</p>
<h2>נושאים נוספים</h2>
<div class="more">${otherIssues.map(x => `<a href="${BASE}/guide/issue/${esc(x.explainer || x.id)}">${esc(x.title)}</a>`).join('')}</div>`,
      schema: {
        '@context': 'https://schema.org', '@type': 'Article', headline: e.title,
        description: e.fact ? String(e.fact).slice(0, 200) : '', inLanguage: 'he',
        publisher: { '@type': 'Organization', name: 'מצפן הבוחר' }
      }
    };
  },
  async trust(host) {
    const d = await loadData(host, ['integrity', 'meta', 'parties', 'polls']);
    const I = d.integrity || {}, meta = d.meta || {};
    const charter = I.charter || [];
    const sources = meta.sources || [];
    const nParties = (d.parties || []).length;
    const nTerms = (I.loadedTerms || []).length;
    return {
      title: 'איך אנחנו שומרים על ניטרליות — מנגנון האמון | מצפן הבוחר',
      desc: 'כלי בחירות שאומר "אנחנו ניטרליים" מבקש שתאמינו לו. במקום זה בנינו מנגנון שבודק את עצמו: בדיקות אוטומטיות על הנתונים, סריקת שפה טעונה, הצלבה בין מקורות ומאגר פתוח לכל אחד.',
      path: '/guide/trust',
      body: `<h1>איך כלי בחירות יכול להוכיח שהוא ניטרלי?</h1>
<p class="lead">כל כלי בחירות מצהיר שהוא אובייקטיבי. הצהרה היא דבר זול. בנינו במקומה מנגנון שבודק את התוכן של עצמו באופן מכני, בכל ביקור — ומציג את התוצאה בפומבי, כולל הכישלונות.</p>

<h2>1. מבדק תקינות אוטומטי</h2>
<p>בכל כניסה ל<a href="${BASE}/#/trust">מרכז האמון</a> רצות בדיקות חיות על קבצי הנתונים עצמם: שכל טענה עובדתית מלווה במקור, שלכל אחת מ-${nParties} הרשימות יש עמדה מוגדרת בכל נושא, שהערכים בטווח התקין, שסכום התקציב מגיע ל-100%, ושהנתונים לא התיישנו. בדיקה שנכשלת מוצגת באדום — לא מוסתרת.</p>

<h2>2. סריקת שפה טעונה</h2>
<p>לקסיקון של ${nTerms} מונחים טעונים ("הרסני", "מושחת", "קיצוני") נסרק אוטומטית בתוך הטקסט שאמור להיות ניטרלי: עובדות, תיאורי נושאים ומהות המפלגות. הסריקה <strong>אינה</strong> חלה על "הטיעון של כל צד" — שם המטרה היא דווקא לנסח את הטענה החזקה ביותר. כל מופע שמסומן נועד לבדיקה אנושית, לא לפסילה אוטומטית.</p>

<h2>3. הצלבה בין מאגרים</h2>
<p>מנגנון נפרד מצליב בין קבצי הנתונים ומתריע על סתירות: מפלגה שמסומנת כרצה אך נעדרת מהסקרים האחרונים, רשימה שסומנה כממוזגת אך עדיין מופיעה, או ערבוב בין תקופות — למשל הצגת מנדטי 2022 לצד מספרי סקר עדכניים בלי לציין מה מה. זה נועד למנוע את סוג הטעות שקשה לתפוס בעין.</p>

<h2>4. הפרדה בין עובדה לערך</h2>
<p>בכל נושא במחלוקת אנחנו מפרידים במפורש: מה מוסכם עובדתית, במה בדיוק חלוקים, ומהו הטיעון החזק ביותר של כל צד. שני הצדדים מוצגים בצבעים נייטרליים שווים — <strong>אין קידוד של "טוב מול רע"</strong>. אנחנו לא אומרים למי להצביע.</p>

<h2>5. נתונים חיים שעוברים שער אימות</h2>
<p>סקרים חדשים נמשכים אוטומטית ממקורות פומביים, אך אינם נכנסים לאתר לפני שהם עוברים בדיקות: מבנה תקין, מיפוי לרשימות שבמאגר, טווחי ערכים הגיוניים, סכום מנדטים סביר, תאריך ומקור. נתון שנכשל — לא נכנס. בנוסף, שער חוקי חוסם אוטומטית פרסום סקרים חדשים בתקופת האיסור שלפני יום הבחירות.</p>

${charter.length ? `<h2>אמנת הניטרליות</h2><div class="card"><ul style="margin:0;padding-inline-start:18px">${charter.map(c => `<li style="margin-bottom:7px">${esc(c)}</li>`).join('')}</ul></div>` : ''}

<h2>מה המנגנון הזה <em>לא</em> עושה</h2>
<div class="note">${esc(I.limits || 'המנגנון אינו "יודע את האמת". הוא אוכף את התנאים לאמון: שכל טענה ממוקרת, מתוארכת, מאוזנת בין הצדדים ומנוסחת בשפה ניטרלית.')}</div>
<p>שקיפות אמיתית כוללת גם הודאה במגבלות: עמדות המפלגות הן <strong>סיכום מתומצת</strong> ממקורות פומביים ולא ציטוט רשמי; סריקת השפה מוגבלת ללקסיקון סופי; והרשימות ל-2026 עדיין משתנות. כל אלה מוצגים באתר כאזהרות גלויות, לא כהערות שוליים.</p>

<h2>אימות עצמאי — הנתונים פתוחים</h2>
<p>אין צורך להאמין לנו. <a href="${BASE}/#/database">מאגר הנתונים המלא</a> פתוח לעיון והורדה: כל קובץ JSON שמזין את האתר, עם רשימת המקורות. אפשר להוריד, להצליב מול המקור הרשמי, ולהגיד לנו אם טעינו.</p>
${sources.length ? `<div class="card"><h3>מקורות־על</h3><ul style="margin:6px 0 0;padding-inline-start:18px">${sources.slice(0, 8).map(s => `<li style="margin-bottom:5px"><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.name)}</a></li>`).join('')}</ul></div>` : ''}

<h2>מצאתם טעות?</h2>
<p>נשמח לתקן — זה חלק מהמנגנון. <a href="mailto:rzlwy0884@gmail.com">rzlwy0884@gmail.com</a></p>
<p><a href="${BASE}/#/trust">לצפייה במבדק החי, שרץ ברגע זה על הנתונים ←</a></p>`,
      schema: { '@context': 'https://schema.org', '@type': 'Article', headline: 'איך אנחנו שומרים על ניטרליות — מנגנון האמון', inLanguage: 'he', about: 'שקיפות וניטרליות בכלי בחירות', publisher: { '@type': 'Organization', name: 'מצפן הבוחר' } }
    };
  },
  async issues(host) {
    const d = await loadData(host, ['issues', 'explainers']);
    const I = d.issues || [], E = d.explainers || {};
    const blocks = I.map(it => {
      const e = E[it.explainer] || {};
      return `<div class="card"><h3><a href="${BASE}/guide/issue/${esc(it.explainer)}">${esc(it.title)}</a></h3>
<p style="margin:5px 0 9px">${esc(it.text)}</p>
${e.fact ? `<p style="margin:0 0 8px"><strong>העובדות:</strong> ${esc(e.fact)}</p>` : ''}
${e.dispute ? `<p style="margin:0 0 8px"><strong>במה חלוקים:</strong> ${esc(e.dispute)}</p>` : ''}
${e.for && e.against ? `<p style="margin:0"><strong>${esc(e.for.label)}:</strong> ${esc(e.for.text)}<br><br><strong>${esc(e.against.label)}:</strong> ${esc(e.against.text)}</p>` : ''}
<p style="margin:9px 0 0"><a href="${BASE}/guide/issue/${esc(it.explainer)}">לעמוד המלא: ${esc(it.title)} ←</a></p></div>`;
    }).join('');
    return {
      title: 'נושאי הבחירות 2026 — גיוס חרדים, מערכת המשפט, ועדת חקירה | מצפן הבוחר',
      desc: 'הנושאים שעל הפרק בבחירות לכנסת ה-26, בהסבר ניטרלי: העובדות המוסכמות, נקודת המחלוקת, והטיעון החזק ביותר של כל צד — בלי לומר לכם מה לחשוב.',
      path: '/guide/issues',
      body: `<h1>הנושאים שעל הפרק בבחירות</h1>
<p class="lead">לכל נושא: מה מוסכם עובדתית, במה בדיוק חלוקים, ומהו הטיעון החזק ביותר של כל צד. המטרה היא שתבינו את המחלוקת — לא שתאמצו עמדה מסוימת.</p>
${blocks}
<h2>איפה אתם עומדים?</h2><p><a href="${BASE}/#/quiz">שאלון ההתאמה</a> יראה לכם עם אילו מפלגות העמדות שלכם מתיישבות, ואיפה אתם ממוקמים על המפה הפוליטית. אנונימי לחלוטין.</p>`,
      schema: { '@context': 'https://schema.org', '@type': 'ItemList', name: 'נושאי הבחירות לכנסת ה-26', itemListElement: I.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.title })) }
    };
  }
};

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '').replace(/[^a-z]/g, '');
  const id = String((req.query && req.query.id) || '').replace(/[^a-z0-9-]/gi, '');
  // פרמטר שאינו slug/id => הפניה לכתובת הקנונית, כדי שלא ניתן לעקוף את הקאש
  const canonPath = (slug === 'party' || slug === 'issue') && id ? `/guide/${slug}/${id}` : (slug ? `/guide/${slug}` : '/guide/parties');
  if (canonical(req, res, ['slug', 'id'], canonPath, false)) return;
  if (tooMany('page', 120, 60000)) {
    res.setHeader('Retry-After', '60');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(429).send('Too many requests');
  }
  const host = req.headers && req.headers.host;
  const fn = PAGES[slug];
  const notFound = () => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(shell({ title: 'העמוד לא נמצא | מצפן הבוחר', desc: 'העמוד המבוקש אינו קיים.', path: '/guide/', body: '<h1>העמוד לא נמצא</h1><p>אולי אחד מהעמודים האלה יעזור:</p>' }));
  };
  if (!fn) return notFound();
  try {
    const p = await fn(host, id);
    if (!p) return notFound();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.status(200).send(shell(p));
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(shell({ title: 'מצפן הבוחר', desc: 'כלי עצמאי להתמצאות לקראת הבחירות לכנסת ה-26.', path: '/guide/', body: '<h1>מצפן הבוחר</h1><p>התוכן אינו זמין כרגע. <a href="' + BASE + '/">לאפליקציה המלאה</a></p>' }));
  }
};
