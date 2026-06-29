// api/news.js — פונקציית שרת (Vercel) שמושכת כותרות פוליטיות עדכניות
// ישירות מהפידים של אתרי החדשות הישראליים — בצד השרת, בלי CORS ובלי פרוקסי.
// כל פריט מוחזר עם קישור ישיר אמיתי לכתבה + שם המקור והדומיין, כך שאפשר לאמת.
// פידים שאומתו כנגישים מצד שרת (Vercel) ומחזירים קישורים ישירים אמיתיים.
// מעריב (פוליטי-מדיני) הוסר: חוסם כתובות IP של מרכזי נתונים אף שהוא נגיש מדפדפן.
// מאגר מאוזן: ynet/וואלה (מרכז), זמן ישראל (מרכז), דבר (מרכז-שמאל), ישראל היום (ימין), גלובס (כלכלה).
const FEEDS = [
  { url: 'https://www.ynet.co.il/Integration/StoryRss2.xml',  src: 'ynet',  site: 'ynet.co.il' },
  { url: 'https://rss.walla.co.il/feed/1?type=main',          src: 'וואלה', site: 'walla.co.il' },
  { url: 'https://www.zman.co.il/feed/',                      src: 'זמן ישראל', site: 'zman.co.il' },
  { url: 'https://www.davar1.co.il/feed/',                    src: 'דבר',   site: 'davar1.co.il' },
  { url: 'https://www.israelhayom.co.il/rss',                 src: 'ישראל היום', site: 'israelhayom.co.il' },
  { url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2', src: 'גלובס', site: 'globes.co.il' }
];
// סינון לרלוונטיות פוליטית עבור פידים כלליים (פיד "פוליטי-מדיני" של מעריב פטור — all:true)
const POL = /בחיר|כנסת|ממשל|קואליצי|אופוזיצי|נתניהו|מפלג|מנדט|סקר|ליכוד|לפיד|בנט|גנץ|סמוטריץ|בן.?גביר|ליברמן|דרעי|גולן|אייזנקוט|חרד|גיוס|רפורמה|בג"ץ|פוליט|ראש הממשלה|קלפי|מצביע|שר ה|דמוקרטי/;
// User-Agent מזהה ושקוף (לא התחזות לדפדפן) — גישה הוגנת ל-RSS פומבי בלבד.
const UA = 'VoterCompassBot/1.0 (+https://voter-compass.vercel.app; reads public RSS, headline+link only, no content copying)';

function clean(s) {
  return (s || '')
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function field(block, name) {
  const m = block.match(new RegExp('<' + name + '(?:[^>]*)>([\\s\\S]*?)</' + name + '>', 'i'));
  return m ? clean(m[1]) : '';
}

async function pull(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const blocks = xml.split(/<item[\s>]/i).slice(1).map(b => {
      const end = b.search(/<\/item>/i);
      return end >= 0 ? b.slice(0, end) : b;
    });
    const out = [];
    for (const b of blocks) {
      const t = field(b, 'title');
      let link = field(b, 'link');
      const desc = field(b, 'description');
      const pd = field(b, 'pubDate');
      if (!link) link = field(b, 'guid');
      if (!t || !/^https?:\/\//.test(link)) continue;
      if (!feed.all && !(POL.test(t) || POL.test(desc))) continue;
      // ⚖️ הערה משפטית: ה-description נשלף אך ורק לסינון מילות-מפתח ולעולם אינו מוחזר ללקוח.
      // מוחזרים רק: כותרת המפרסם (verbatim, לא מנוסחת מחדש), קישור ישיר, שם מקור ותאריך.
      // אין להוסיף כאן את desc או תגיות <img> — הצגתם תיצור חשיפה לזכויות יוצרים.
      out.push({ t, link, src: feed.src, site: feed.site, dt: pd ? new Date(pd).toISOString() : null });
    }
    return out;
  } catch (e) {
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  try {
    const lists = await Promise.all(FEEDS.map(pull));
    let items = [].concat(...lists);
    const seen = new Set();
    items = items.filter(it => { if (seen.has(it.link)) return false; seen.add(it.link); return true; });
    items.sort((a, b) => (b.dt ? Date.parse(b.dt) : 0) - (a.dt ? Date.parse(a.dt) : 0));
    // איזון בין מקורות: עד 6 כתבות לכל מקור, תוך שמירה על סדר העדכניות
    const per = {}, balanced = [];
    for (const it of items) { per[it.src] = (per[it.src] || 0) + 1; if (per[it.src] <= 6) balanced.push(it); }
    items = balanced.slice(0, 18);
    res.status(200).json({ items, live: items.length > 0, sources: FEEDS.map(f => f.site), at: Date.now() });
  } catch (e) {
    res.status(200).json({ items: [], live: false, at: Date.now() });
  }
};
