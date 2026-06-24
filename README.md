# מצפן הבוחר (Voter Compass)

כלי הסברה נייטרלי לקראת הבחירות לכנסת ה-26.

## מבנה ה-repo
- `index.html` — האפליקציה (בשורש; Vercel מגיש אותה ישירות).
- `data/` — כל הנתונים שעליהם מתבססת האפליקציה (8 קבצי JSON):
  meta, issues, statements, parties, polls, explainers, budget, integrity.

## פריסה ב-Vercel
ייבוא ה-repo. Framework Preset: Other, ללא build. `index.html` שבשורש
קורא את `data/` מאותו origin.
