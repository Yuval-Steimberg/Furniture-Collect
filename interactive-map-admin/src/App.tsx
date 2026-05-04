import { isConfigured } from './lib/supabase'
import PlaceEditor from './PlaceEditor'

export default function App() {
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">⚙️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">הגדרת Supabase נדרשת</h1>
          <p className="text-gray-500 mb-6 text-sm leading-relaxed">
            צור קובץ <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">.env</code> בתיקיית הפרויקט עם הפרטים הבאים:
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-right text-xs font-mono text-gray-700 space-y-1 border border-gray-200 mb-6">
            <div>VITE_SUPABASE_URL=https://xxx.supabase.co</div>
            <div>VITE_SUPABASE_ANON_KEY=eyJ...</div>
          </div>
          <p className="text-gray-400 text-xs">
            אחר כך הרץ <code className="bg-gray-100 px-1 rounded font-mono">npm run dev</code> מחדש
          </p>
          <p className="text-gray-400 text-xs mt-2">
            ראה <strong>README.md</strong> להוראות מלאות כולל יצירת טבלת places בסופאבייס
          </p>
        </div>
      </div>
    )
  }

  return <PlaceEditor />
}
