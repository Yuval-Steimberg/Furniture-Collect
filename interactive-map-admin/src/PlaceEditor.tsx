import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Check, Download, Edit2, Loader2, MapPin, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import { CATS, INITIAL_PLACES } from './types'
import type { Place } from './types'

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error'
interface ToastItem { id: number; text: string; kind: ToastKind }

function useToast() {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = ++counter.current
    setItems(t => [...t, { id, text, kind }])
    setTimeout(() => setItems(t => t.filter(x => x.id !== id)), 3500)
  }, [])
  return { items, toast }
}

function Toasts({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {items.map(t => (
        <div
          key={t.id}
          className={`animate-fade-up px-5 py-3 rounded-2xl shadow-lg text-white text-sm font-semibold
            ${t.kind === 'success' ? 'bg-[#3D5443]' : 'bg-red-500'}`}
        >
          {t.kind === 'success' ? '✓' : '✕'} {t.text}
        </div>
      ))}
    </div>
  )
}

// ─── CoordMap (Leaflet) ───────────────────────────────────────────────────────

const TEL_AVIV: [number, number] = [32.0621, 34.7780]

interface CoordMapProps {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}

function CoordMap({ lat, lng, onChange }: CoordMapProps) {
  const divRef  = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const cbRef     = useRef(onChange)
  useEffect(() => { cbRef.current = onChange })

  useEffect(() => {
    if (!divRef.current) return
    const center: [number, number] = lat && lng ? [lat, lng] : TEL_AVIV
    const map = L.map(divRef.current, { center, zoom: 16 })
    mapRef.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OSM contributors © CARTO',
      maxZoom: 19,
    }).addTo(map)

    const placeMarker = (lt: number, ln: number) => {
      if (markerRef.current) {
        markerRef.current.setLatLng([lt, ln])
      } else {
        const m = L.marker([lt, ln], { draggable: true }).addTo(map)
        m.on('dragend', () => {
          const pos = m.getLatLng()
          cbRef.current(pos.lat, pos.lng)
        })
        markerRef.current = m
      }
    }

    if (lat && lng) placeMarker(lat, lng)

    map.on('click', e => {
      placeMarker(e.latlng.lat, e.latlng.lng)
      cbRef.current(e.latlng.lat, e.latlng.lng)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  // intentionally omit lat/lng so map doesn't re-mount on coord change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // sync external lat/lng changes (from the number inputs) into the existing marker
  useEffect(() => {
    if (!mapRef.current || !lat || !lng) return
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const m = L.marker([lat, lng], { draggable: true }).addTo(mapRef.current)
      m.on('dragend', () => {
        const pos = m.getLatLng()
        cbRef.current(pos.lat, pos.lng)
      })
      markerRef.current = m
    }
  }, [lat, lng])

  return (
    <div ref={divRef} className="w-full h-52 rounded-xl overflow-hidden border border-gray-200" />
  )
}

// ─── PlaceModal ───────────────────────────────────────────────────────────────

type PlaceForm = Omit<Place, 'id'>

const BLANK: PlaceForm = {
  name: '', sub: '', cat: 'art',
  lat: TEL_AVIV[0], lng: TEL_AVIV[1],
  desc: '', hours: null, contact: null, address: '',
}

interface ModalProps {
  place: Partial<Place> | null
  saving: boolean
  onClose: () => void
  onSave: (p: PlaceForm & { id?: number }) => void
}

function PlaceModal({ place, saving, onClose, onSave }: ModalProps) {
  const isNew = !place?.id
  const [f, setF] = useState<PlaceForm>({
    name:    place?.name    ?? BLANK.name,
    sub:     place?.sub     ?? BLANK.sub,
    cat:     place?.cat     ?? BLANK.cat,
    lat:     place?.lat     ?? BLANK.lat,
    lng:     place?.lng     ?? BLANK.lng,
    desc:    place?.desc    ?? BLANK.desc,
    hours:   place?.hours   ?? BLANK.hours,
    contact: place?.contact ?? BLANK.contact,
    address: place?.address ?? BLANK.address,
  })

  const set = <K extends keyof PlaceForm>(k: K, v: PlaceForm[K]) =>
    setF(prev => ({ ...prev, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(isNew ? f : { ...f, id: place!.id! })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto flex justify-center py-8 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl h-fit" dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isNew ? 'הוספת מקום חדש' : `עריכת "${place?.name}"`}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4">

          <FieldRow label="שם המקום *">
            <input
              required
              className={inp}
              value={f.name}
              onChange={e => set('name', e.target.value)}
              placeholder="לדוגמה: Cafe Zohar"
            />
          </FieldRow>

          <FieldRow label="כותרת משנה">
            <input
              className={inp}
              value={f.sub}
              onChange={e => set('sub', e.target.value)}
              placeholder="לדוגמה: קפה שכונתי"
            />
          </FieldRow>

          <FieldRow label="קטגוריה">
            <select
              className={inp}
              value={f.cat}
              onChange={e => set('cat', e.target.value)}
            >
              {Object.entries(CATS).map(([k, c]) => (
                <option key={k} value={k}>{c.icon} {c.label}</option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="תיאור">
            <textarea
              className={`${inp} resize-none`}
              rows={3}
              value={f.desc}
              onChange={e => set('desc', e.target.value)}
              placeholder="מה מיוחד במקום הזה?"
            />
          </FieldRow>

          <FieldRow label="כתובת">
            <input
              className={inp}
              value={f.address}
              onChange={e => set('address', e.target.value)}
              placeholder="לדוגמה: נווה שאנן, ת״א"
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="שעות פתיחה">
              <input
                className={inp}
                value={f.hours ?? ''}
                onChange={e => set('hours', e.target.value || null)}
                placeholder="א׳–ו׳ 09:00–18:00"
              />
            </FieldRow>
            <FieldRow label="יצירת קשר">
              <input
                className={inp}
                value={f.contact ?? ''}
                onChange={e => set('contact', e.target.value || null)}
                placeholder="טלפון / אימייל"
              />
            </FieldRow>
          </div>

          <FieldRow label="מיקום — לחץ על המפה לקביעת נקודה, או גרור את הסיכה">
            <CoordMap
              lat={f.lat}
              lng={f.lng}
              onChange={(la, ln) => setF(p => ({ ...p, lat: la, lng: ln }))}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <span className="text-xs text-gray-400 mb-1 block">קו רוחב</span>
                <input
                  type="number"
                  step="any"
                  className={inp}
                  value={f.lat}
                  onChange={e => set('lat', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <span className="text-xs text-gray-400 mb-1 block">קו אורך</span>
                <input
                  type="number"
                  step="any"
                  className={inp}
                  value={f.lng}
                  onChange={e => set('lng', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          </FieldRow>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#3D5443] text-white font-medium hover:bg-[#2f4134] disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
            >
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> שומר...</>
                : <><Check className="h-4 w-4" /> שמור</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inp = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#3D5443]/30 bg-white'

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

// ─── ExportModal ──────────────────────────────────────────────────────────────

function ExportModal({ places, onClose }: { places: Place[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const code = `const LOCS = ${JSON.stringify(
    places.map(({ id, name, sub, cat, lat, lng, desc, hours, contact, address }) =>
      ({ id, name, sub, cat, lat, lng, desc, hours, contact, address })
    ),
    null, 2
  )};`

  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">יצוא קוד — LOCS array</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              העתק והדבק במקום <code className="bg-gray-100 px-1 rounded font-mono">const LOCS = [...]</code> ב-index.html של המפה
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <pre className="flex-1 overflow-auto p-5 text-xs font-mono bg-gray-50 text-gray-800 leading-relaxed">
          {code}
        </pre>

        <div className="p-4 border-t flex justify-end shrink-0">
          <button
            onClick={copy}
            className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-colors
              ${copied ? 'bg-green-600 text-white' : 'bg-[#3D5443] text-white hover:bg-[#2f4134]'}`}
          >
            {copied ? '✓ הועתק!' : 'העתק'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DeleteConfirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
        <div className="text-4xl mb-3">🗑️</div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">מחיקת מקום</h3>
        <p className="text-gray-500 text-sm mb-5">
          האם למחוק את <strong>"{name}"</strong>?<br />לא ניתן לשחזר.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
          >
            מחק
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PlaceCard ────────────────────────────────────────────────────────────────

function PlaceCard({ place, onEdit, onDelete }: { place: Place; onEdit: () => void; onDelete: () => void }) {
  const cat = CATS[place.cat] ?? CATS.anchor
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden" dir="rtl">
      <div className="h-1.5 w-full" style={{ backgroundColor: cat.color }} />
      <div className="p-4">
        <div className="flex gap-3 mb-3">
          <span className="text-2xl shrink-0 mt-0.5">{cat.icon}</span>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 leading-tight truncate">{place.name}</h3>
            {place.sub && <p className="text-sm text-gray-500 truncate">{place.sub}</p>}
            <span
              className="mt-1.5 inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: cat.color + '20', color: cat.color }}
            >
              {cat.label}
            </span>
          </div>
        </div>

        <div className="space-y-0.5 mb-4 text-xs text-gray-400">
          {place.address && (
            <p className="flex gap-1 items-center">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{place.address}</span>
            </p>
          )}
          {place.hours   && <p>🕐 {place.hours}</p>}
          {place.contact && <p className="truncate">📞 {place.contact}</p>}
          {place.desc    && <p className="text-gray-300 line-clamp-2 pt-1 leading-relaxed">{place.desc}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Edit2 className="h-3.5 w-3.5" /> עריכה
          </button>
          <button
            onClick={onDelete}
            className="py-2 px-3 rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap
        ${active ? 'bg-[#3D5443] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >
      {children}
    </button>
  )
}

// ─── PlaceEditor (main) ───────────────────────────────────────────────────────

export default function PlaceEditor() {
  const [places,     setPlaces]     = useState<Place[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState<Partial<Place> | null>(null) // null=closed {}=new Place=edit
  const [deleting,   setDeleting]   = useState<{ id: number; name: string } | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [seeding,    setSeeding]    = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [catFilter,  setCatFilter]  = useState('all')
  const [search,     setSearch]     = useState('')
  const { items: toasts, toast } = useToast()

  // ── data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('places').select('*').order('id')
    if (error) toast('שגיאה בטעינת מקומות', 'error')
    else setPlaces((data as Place[]) ?? [])
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  // ── save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (p: PlaceForm & { id?: number }) => {
    setSaving(true)
    const { id, ...data } = p
    const { error } = id
      ? await supabase.from('places').update(data).eq('id', id)
      : await supabase.from('places').insert([data])
    if (error) {
      toast('שגיאה בשמירה', 'error')
    } else {
      toast(id ? 'המקום עודכן!' : 'המקום נוסף!')
      setModal(null)
      await load()
    }
    setSaving(false)
  }, [load, toast])

  // ── delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: number) => {
    const { error } = await supabase.from('places').delete().eq('id', id)
    if (error) toast('שגיאה במחיקה', 'error')
    else { toast('המקום נמחק'); await load() }
    setDeleting(null)
  }, [load, toast])

  // ── seed initial data ─────────────────────────────────────────────────────

  const handleSeed = useCallback(async () => {
    setSeeding(true)
    const { error } = await supabase
      .from('places')
      .upsert(INITIAL_PLACES, { onConflict: 'id' })
    if (error) toast('שגיאה בטעינת נתונים ראשוניים', 'error')
    else { toast('15 המקומות נוספו!'); await load() }
    setSeeding(false)
  }, [load, toast])

  // ── filtered list ─────────────────────────────────────────────────────────

  const filtered = places
    .filter(p => catFilter === 'all' || p.cat === catFilter)
    .filter(p => !search || p.name.includes(search) || p.address.includes(search) || p.sub.includes(search))

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">

      {/* ── Header ── */}
      <header className="bg-[#3D5443] text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold leading-tight">🗺️ עורך מקומות — JAS Route</h1>
            <p className="text-xs text-white/60">{places.length} מקומות במפה</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {places.length > 0 && (
              <button
                onClick={() => setShowExport(true)}
                className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> יצוא קוד
              </button>
            )}
            <button
              onClick={() => setModal({})}
              className="px-4 py-2 rounded-lg bg-white text-[#3D5443] text-sm font-bold hover:bg-white/90 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="h-4 w-4" /> מקום חדש
            </button>
          </div>
        </div>
      </header>

      {/* ── Filter bar ── */}
      <div className="bg-white border-b border-gray-100 sticky top-[61px] z-30">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex gap-3 items-center overflow-x-auto">
          {/* Search */}
          <div className="relative shrink-0">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש מקום..."
              className="w-44 pr-8 pl-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#3D5443]/30 bg-white"
            />
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto">
            <Pill active={catFilter === 'all'} onClick={() => setCatFilter('all')}>
              הכל ({places.length})
            </Pill>
            {Object.entries(CATS).map(([k, c]) => {
              const cnt = places.filter(p => p.cat === k).length
              return cnt > 0 ? (
                <Pill key={k} active={catFilter === k} onClick={() => setCatFilter(k)}>
                  {c.icon} {c.label} ({cnt})
                </Pill>
              ) : null
            })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-[#3D5443]" />
          </div>

        ) : places.length === 0 ? (
          /* Empty state — no places at all */
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🗺️</p>
            <p className="text-xl font-semibold text-gray-700 mb-2">אין מקומות במפה עדיין</p>
            <p className="text-gray-400 text-sm mb-8 max-w-xs mx-auto">
              הוסף מקום ידנית, או טען את 15 המקומות המקוריים מהמפה שלך
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setModal({})}
                className="px-6 py-3 rounded-xl bg-[#3D5443] text-white font-medium hover:bg-[#2f4134] flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="h-4 w-4" /> מקום חדש
              </button>
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="px-6 py-3 rounded-xl border-2 border-[#3D5443] text-[#3D5443] font-medium hover:bg-[#3D5443]/5 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : '📥'}
                {seeding ? 'טוען...' : 'טען 15 המקומות המקוריים'}
              </button>
            </div>
          </div>

        ) : filtered.length === 0 ? (
          /* Empty search/filter result */
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-lg font-semibold text-gray-700 mb-1">לא נמצאו תוצאות</p>
            <p className="text-gray-400 text-sm mb-5">נסה לשנות את החיפוש או הפילטר</p>
            <button
              onClick={() => { setSearch(''); setCatFilter('all') }}
              className="text-[#3D5443] underline text-sm"
            >
              נקה פילטרים
            </button>
          </div>

        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <PlaceCard
                key={p.id}
                place={p}
                onEdit={() => setModal(p)}
                onDelete={() => setDeleting({ id: p.id, name: p.name })}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {modal !== null && (
        <PlaceModal
          place={modal}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {deleting && (
        <DeleteConfirm
          name={deleting.name}
          onConfirm={() => handleDelete(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {showExport && (
        <ExportModal places={places} onClose={() => setShowExport(false)} />
      )}

      <Toasts items={toasts} />
    </div>
  )
}
