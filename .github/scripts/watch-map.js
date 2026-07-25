// watch-map.js — משווה את מפת המפלגות שבמאגר מול הסקרים החיים, ומדווח על פערים.
// לא משנה נתונים בעצמו: באפליקציית אמון, החלטה כמו "המפלגה הזו התמזגה" חייבת
// אישור אנושי. התפקיד כאן הוא לוודא שאף שינוי לא עובר בשקט.
const fs = require('fs');
const API = process.env.SITE_API || 'https://voter-compass.vercel.app/api/live-polls';

(async () => {
  const out = [];
  let changed = false;
  try {
    const parties = JSON.parse(fs.readFileSync('data/parties.json', 'utf8'));
    const meta = JSON.parse(fs.readFileSync('data/meta.json', 'utf8'));
    const r = await fetch(API, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();

    if (!j.ok) {
      changed = true;
      out.push(`### מקור הסקרים לא נקרא`, ``,
        `הצינור החי החזיר שגיאה: \`${j.error || 'לא ידוע'}\`.`,
        j.error === 'source-format-changed'
          ? `זה בדרך כלל אומר שמבנה טבלת הסקרים בוויקיפדיה השתנה — לעיתים בגלל מפלגה חדשה או מיזוג. יש לעדכן את מיפוי העמודות ב-\`api/live-polls.js\`.`
          : `כדאי לבדוק שהמקור זמין.`);
    } else {
      const polls = j.polls || [];
      const active = parties.filter(p => p.runs2026 !== false);
      const merged = parties.filter(p => p.runs2026 === false);
      const seen = new Set();
      polls.slice(0, 3).forEach(p => (p.figures || []).forEach(f => f.partyId && seen.add(f.partyId)));

      const missing = active.filter(p => !seen.has(p.id) && (p.seats || 0) > 0);
      const ghosts = merged.filter(p => seen.has(p.id));

      if (missing.length) {
        changed = true;
        out.push(`### מפלגה פעילה שנעדרת מהסקרים האחרונים`, ``,
          ...missing.map(p => `- **${p.name}** (${p.seats} מנדטים במאגר) לא מופיעה ב-3 הסקרים האחרונים.`),
          ``, `ייתכן מיזוג, פיצול, או ירידה מתחת לאחוז החסימה.`,
          `אם התמזגה: לעדכן ב-\`data/parties.json\` את \`"runs2026": false\` ו-\`"mergedInto": "<id של הרשימה הממשיכה>"\` — האפליקציה תסדר את עצמה אוטומטית (מפלגות, שאלון, מפה, תקציב).`);
      }
      if (ghosts.length) {
        changed = true;
        out.push(`### סתירה: רשימה שמסומנת כממוזגת מופיעה בסקר`, ``,
          ...ghosts.map(p => `- **${p.name}** מסומנת \`runs2026:false\` אך מופיעה בסקר עדכני.`));
      }

      const days = Math.floor((Date.now() - Date.parse(meta.lastUpdated)) / 86400000);
      const toVote = Math.ceil((Date.parse(meta.electionDay) - Date.now()) / 86400000);
      const threshold = toVote <= 60 ? 21 : 45;
      if (days >= threshold) {
        changed = true;
        out.push(`### הנתונים מתיישנים`, ``,
          `פרטי המפלגות עודכנו לפני **${days} ימים** (${meta.lastUpdated})${isNaN(toVote) ? '' : `, ונותרו ${toVote} ימים לבחירות`}.`,
          `האתר כבר מציג על כך הודעה גלויה למשתמשים. מומלץ להריץ עדכון (ראו \`UPDATE-PROMPT.md\`).`);
      }

      if (!changed) {
        out.push(`מפת המפלגות תואמת את הסקרים העדכניים. ${active.length} רשימות פעילות, הנתונים עודכנו לפני ${days} ימים.`);
      } else {
        out.push(``, `---`, `נבדק מול ${polls.length} סקרים אחרונים מ-${j.source || 'המקור'}. דוח אוטומטי — יש לאמת מול מקור אמין לפני עדכון.`);
      }
    }
  } catch (e) {
    changed = true;
    out.push(`### הבדיקה האוטומטית נכשלה`, ``, `\`${String(e && e.message || e)}\``);
  }

  const report = out.join('\n');
  console.log(report);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `report<<EOF\n${report}\nEOF\n`);
  }
})();
