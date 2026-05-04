# עורך מקומות — JAS Route

ממשק ניהול מקומות ידידותי ופשוט למפה האינטראקטיבית.  
מיועד לשימוש של אנשים לא טכניים.

## מה ניתן לעשות

- **הוספת מקומות** — טופס עם כל שדות המקום, כולל מפה ללחיצה לבחירת מיקום
- **עריכה** — לחץ "עריכה" על כל כרטיס לעדכון הפרטים
- **מחיקה** — מחיקה עם אישור בלחיצה אחת
- **סינון וחיפוש** — סינון לפי קטגוריה וחיפוש טקסט
- **יצוא קוד** — כפתור "יצוא קוד" מייצר את ה-`LOCS` array להדבקה ישירה ב-`index.html` של המפה
- **טעינת נתונים מקוריים** — בלחיצה אחת מוסיף את 15 המקומות הקיימים במפה

---

## הגדרה ראשונית (פעם אחת בלבד)

### 1. צור פרויקט Supabase

היכנס ל-[supabase.com](https://supabase.com) וצור פרויקט חדש (חינמי).

### 2. צור את טבלת המקומות

בפרויקט Supabase, לחץ על **SQL Editor** והרץ את כל התוכן של הקובץ:

```
supabase_schema.sql
```

### 3. הגדר משתני סביבה

העתק את קובץ `.env.example` ושנה את שמו ל-`.env`:

```bash
cp .env.example .env
```

מלא את הפרטים מ-Supabase:  
לחץ **Project Settings → API** בסופאבייס ועתק:
- `Project URL` → `VITE_SUPABASE_URL`
- `anon / public` key → `VITE_SUPABASE_ANON_KEY`

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. התקן והרץ

```bash
npm install
npm run dev
```

פתח את הדפדפן ב-`http://localhost:5173`

### 5. טען את המקומות המקוריים

בפעם הראשונה שתיכנס לממשק, לחץ **"טען 15 המקומות המקוריים"** — זה ימלא אוטומטית את כל 15 המקומות מהמפה הקיימת.

אחרי הטענה, הרץ בסופאבייס SQL Editor:
```sql
SELECT setval(pg_get_serial_sequence('places', 'id'), (SELECT MAX(id) FROM places));
```
כדי שמקומות חדשים יקבלו מזהה שמתחיל מ-16.

---

## עדכון המפה לקרוא מ-Supabase (אופציונלי)

כרגע, הכפתור **"יצוא קוד"** מייצר את ה-`LOCS` array שאפשר להדביק ישירות ב-`index.html`.

אם רוצים שהמפה תקרא מ-Supabase אוטומטית בכל טעינה, החלף את השורה:
```js
const LOCS = [ ... ];
```

בקוד הבא (בתחילת הסקריפט הראשי ב-`index.html`):
```js
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_KEY = 'eyJ...';

let LOCS = [];

async function loadPlaces() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/places?order=id&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  LOCS = await res.json();
  initMap(); // קרא לפונקציה שמאתחלת את המפה
}

loadPlaces();
```

---

## פריסה (Vercel)

```bash
npm run build
```

או חבר את תיקיית `interactive-map-admin/` כפרויקט נפרד ב-Vercel.  
אל תשכח להוסיף את משתני הסביבה ב-Vercel → Settings → Environment Variables.
