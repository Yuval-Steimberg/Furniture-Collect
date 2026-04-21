# Furniture Collect — Just A Second

Field-first inventory tool for apartment evacuation & reuse, built for
[Just A Second](https://www.justasecond.co.il) (Noa Berant).

Workers walk through apartments slated for demolition or renovation, record
what's inside in Hebrew voice (or photo), flag what should be salvaged vs.
left behind, and the collection team picks it up. The system produces
sustainability reports — kg diverted from landfill, CO₂-eq avoided — that the
evacuating developer or municipality can hand to their ESG team.

## Stack

- **Frontend:** Vite + React + TypeScript + shadcn/ui + Tailwind (v3)
- **Design system:** [Just A Second tokens](./docs/README.md) — cream paper,
  sage, slate, forest, one confident orange. Hebrew-first (RTL) with Heebo
  body and Bowlby One SC display.
- **Backend:** Supabase (Postgres + RLS + Auth + Storage + Edge Functions)
- **AI:**
  - Voice → Whisper (he) → Gemini 2.5 Flash Lite (parse) → structured items
  - Photo → Claude Sonnet 4.5 vision → structured items (planned)
  - Stats Q&A over aggregates

## Getting started

```bash
# Clone + install
git clone git@github.com:Yuval-Steimberg/Furniture-Collect.git
cd Furniture-Collect
bun install            # or: npm install

# Env
cp .env.example .env
# → fill VITE_SUPABASE_* from your Supabase project dashboard

# Dev
bun run dev            # or: npm run dev
```

Open `http://localhost:5173`.

## Supabase setup

1. Create a project at supabase.com.
2. Run every `.sql` file in `supabase/migrations/` (oldest first) via the SQL
   editor or `supabase db push`.
3. Deploy the edge functions in `supabase/functions/`:
   ```bash
   supabase functions deploy parse-voice-items
   supabase functions deploy parse-text-items
   supabase functions deploy calculate-statistics
   supabase functions deploy ask-statistics-question
   supabase functions deploy send-invitation-email
   supabase functions deploy delete-user
   ```
4. Set the function secrets (`OPENAI_API_KEY`, `LOVABLE_API_KEY`) in the
   Supabase dashboard → Project Settings → Edge Functions.
5. Put the project id + anon key into `.env`.

## Roles

- `ORG_ADMIN` — full control across projects, user management.
- `PROJECT_MANAGER` — manages one project, invites workers.
- `WORKER` — documents apartments, records items, marks collections.

## Roadmap

See [`docs/TRACKING.md`](./docs/TRACKING.md) for the full roadmap, from
design-system migration through to sellable-product features.

The headline features on the path to "next-gen":

| Tier | Feature | Spec |
|---|---|---|
| 1 | Camera + vision autofill (photo → structured item) | [`docs/specs/camera-vision-autofill.md`](./docs/specs/camera-vision-autofill.md) |
| 1 | Sustainability receipt PDF (per project / apartment) | [`docs/specs/sustainability-receipt-pdf.md`](./docs/specs/sustainability-receipt-pdf.md) |
| 1 | Offline-first voice capture (IndexedDB + sync) | [`docs/specs/offline-voice-capture.md`](./docs/specs/offline-voice-capture.md) |
| 1 | Batch-review undo flyout | [`docs/specs/batch-review-undo.md`](./docs/specs/batch-review-undo.md) |

## License

Private. All rights reserved. © Just A Second.
