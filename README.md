# Taxatieplatform — Valyze

Een professioneel vastgoedtaxatieplatform voor taxateurs, gehost op [valyze.nl](https://valyze.nl).

## Tech Stack

| Laag | Technologie |
|------|-------------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS |
| Backend | Node.js, Express, TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Hosting | Render |
| Domein | valyze.nl |

## Projectstructuur

```
taxatie-workflow-pla/
├── frontend/          ← React frontend applicatie
│   ├── src/
│   │   ├── components/    ← UI componenten
│   │   ├── context/       ← AuthContext
│   │   ├── hooks/         ← Supabase data hooks
│   │   ├── lib/           ← Supabase client
│   │   └── types/         ← TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── backend/           ← Express API server
│   ├── src/
│   │   ├── routes/        ← API routes
│   │   └── middleware/    ← Auth middleware
│   └── package.json
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── render.yaml        ← Render deployment configuratie
└── .env.example       ← Voorbeeld environment variabelen
```

## Lokaal draaien

### Vereisten
- Node.js 20+
- Een Supabase project (zie [supabase.com](https://supabase.com))

### 1. Database instellen

Ga naar je Supabase project → **SQL Editor** en voer het bestand `supabase/migrations/001_initial_schema.sql` uit.

### 2. Environment variabelen instellen

Kopieer het voorbeeld bestand:
```bash
cp .env.example frontend/.env.local
cp .env.example backend/.env
```

Vul de juiste waarden in:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- `VITE_BACKEND_URL` — URL van de backend (bijv. `http://localhost:3001` voor lokale ontwikkeling)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (alleen backend!)

### 3. Frontend starten

```bash
cd frontend
npm install
npm run dev
```

De frontend is beschikbaar op `http://localhost:5173`

### 4. Backend starten

```bash
cd backend
npm install
npm run dev
```

De backend is beschikbaar op `http://localhost:4000`

## Deployment op Render

### Eerste keer deployen

1. Ga naar [render.com](https://render.com) en log in via GitHub
2. Klik op **New** → **Blueprint**
3. Selecteer de `taxatie-workflow-pla` repository
4. Render detecteert automatisch `render.yaml` en maakt beide services aan

### Environment variabelen instellen in Render

Stel per service de volgende variabelen in:

**Frontend service (`taxatie-frontend`):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BACKEND_URL`

**Backend service (`taxatie-backend`):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Domeinnaam koppelen

1. Ga in Render naar je frontend service → **Settings → Custom Domains**
2. Voeg `valyze.nl` toe
3. Render geeft een DNS record terug
4. Zet het DNS record in bij je domeinprovider (bijv. TransIP)
5. HTTPS wordt automatisch geconfigureerd

## Taxateurs toevoegen

Nieuwe taxateurs worden aangemaakt via Supabase Auth:

1. Ga naar Supabase → **Authentication → Users**
2. Klik op **Add user**
3. Vul e-mailadres en wachtwoord in
4. De taxateur kan nu inloggen op [valyze.nl](https://valyze.nl)

## Environment variabelen overzicht

| Variabele | Omgeving | Beschrijving |
|-----------|----------|--------------|
| `VITE_SUPABASE_URL` | Frontend | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase public/anon key |
| `VITE_BACKEND_URL` | Frontend | URL van de Express-backend |
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Supabase service role key (geheim!) |
| `FRONTEND_URL` | Backend | URL van de frontend (voor CORS) |
| `PORT` | Backend | Poort voor de backend server |
| `NODE_ENV` | Backend | `development` of `production` |
