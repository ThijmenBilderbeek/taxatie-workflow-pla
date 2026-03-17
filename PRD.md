# Intern Taxatieplatform met Intelligente Vergelijkbaarheidslaag

Een gestructureerde workflow-applicatie voor professioneel vastgoedtaxateurs die stapsgewijs objectgegevens invoeren, automatisch vergelijkbare historische rapporten vinden, en geoptimaliseerde output genereren voor Flux VMS.

**Experience Qualities**:
1. **Efficiënt** - Gestroomlijnde workflow vermindert repetitief werk door intelligente hergebruik van eerdere taxaties
2. **Betrouwbaar** - Gestructureerde data-invoer en validatie zorgen voor consistente, professionele rapportage
3. **Transparant** - Duidelijke similarity scores en bronverwijzingen maken keuzes navolgbaar en controleerbaar

**Complexity Level**: Complex Application (advanced functionality, likely with multiple views)
Dit is een enterprise-grade applicatie met een 10-stappen wizard, geavanceerde similarity engine, rapportgeneratie, kennisbank, feedbacksysteem en externe systeemintegratie.

## Essential Features

### 1. Adrescheck en Actualisatiemodus
- **Functionality**: Controleert bij nieuw dossier of adres al eerder getaxeerd is
- **Purpose**: Voorkomt dubbel werk en zorgt voor consistente versiehistorie
- **Trigger**: Gebruiker start nieuw dossier en vult adresgegevens in
- **Progression**: Adresinvoer → automatische check → melding bij match → optie om vorige versie te laden → wijzigingen worden gemarkeerd → opslag als nieuwe versie
- **Success criteria**: Systeem herkent bestaande adressen en laadt vorige data correct met visuele highlights op gewijzigde velden

### 2. Similarity Engine met Gewogen Scoring
- **Functionality**: Berekent vergelijkbaarheidsscore (0-100) voor alle historische rapporten op basis van 5 gewogen parameters
- **Purpose**: Vindt meest relevante referentierapporten om rapportkwaliteit te verhogen
- **Trigger**: Wizard stap 10 bereikt, of handmatige herberekening
- **Progression**: Wizarddata compleet → berekening per historisch rapport → weging afstand (30%), type (25%), oppervlakte (20%), ouderdom (15%), gebruik (10%) → sorteren op totaalscore → top 5 tonen met kleurcode
- **Success criteria**: Een kantoor van 1200m² in Amsterdam toont vergelijkbare kantoren binnen 2km bovenaan, niet woningen of gebouwen van 5000m²

### 3. Aanpasbare Similarity Instellingen
- **Functionality**: Taxateurs kunnen gewichten van similarity parameters aanpassen via sliders
- **Purpose**: Maakt systeem stuurbaar zonder codeerkennis, past zich aan verschillende taxatiecontexten
- **Trigger**: Navigatie naar Instellingen → sectie Similarity
- **Progression**: Open instellingen → pas slider aan → andere sliders herberekenen automatisch naar 100% totaal → opslaan → nieuwe berekeningen gebruiken nieuwe gewichten
- **Success criteria**: Wijzigen van gewicht direct zichtbaar in herberekende scores, totaal blijft altijd 100%

### 4. 10-Stappen Wizard met Auto-save
- **Functionality**: Gestructureerde data-invoer over 10 stappen met validatie en automatisch opslaan
- **Purpose**: Zorgt voor complete, gevalideerde taxatiedata zonder dataverlies
- **Trigger**: Klik op "Nieuw dossier" in dashboard
- **Progression**: Start wizard → voortgangsbalk toont positie → invullen velden met validatie → auto-save bij stapovergang → vorige stappen blijven bewerkbaar → stap 10 toont similarity resultaten → selecteer referenties → genereer rapport
- **Success criteria**: Alle velden worden correct opgeslagen, validatie voorkomt onvolledige data, gebruiker kan vrij navigeren tussen stappen

### 5. Rapportgeneratie met Template Placeholders
- **Functionality**: Genereert 15 rapportsecties met voorgevulde tekst op basis van wizarddata en geselecteerde referenties
- **Purpose**: Versnelt rapportage met professionele conceptteksten die handmatig verfijnd kunnen worden
- **Trigger**: Klik "Genereer concept rapport" in stap 10
- **Progression**: Referenties geselecteerd → template-engine vult placeholders → tekst per sectie gegenereerd → toon bewerkbare editor per sectie → label toont gebruikte referentie + score → save wijzigingen
- **Success criteria**: Alle 15 secties gevuld met relevante tekst, placeholders correct vervangen, tekst bewerkbaar en opgeslagen

### 6. Flux VMS Compatibele Output
- **Functionality**: Exporteert rapporttekst in plain-text formaat geoptimaliseerd voor copy-paste in Flux VMS
- **Purpose**: Naadloze integratie met bestaand taxatiesysteem zonder handmatige herformattering
- **Trigger**: Klik "Kopieer voor Flux" of "Exporteer als .txt"
- **Progression**: Rapport gereed → klik export → formattering toegepast (HOOFDLETTERS titels, regelafstand, max 100 tekens, geen markdown) → kopieer naar klembord of download .txt → paste in Flux VMS
- **Success criteria**: Geëxporteerde tekst direct bruikbaar in Flux zonder aanpassingen, formatting regels consistent toegepast

### 7. Feedbacksysteem voor Niet-technische Gebruikers
- **Functionality**: Duim omhoog/omlaag per rapportsectie met gestructureerde feedback opties
- **Purpose**: Verzamelt gebruikersinput om similarity engine en templates te verbeteren
- **Trigger**: Duim-icoon klikken bij rapportsectie of similarity resultaat
- **Progression**: Bekijk gegenereerde tekst → klik duim-omlaag → selecteer reden uit dropdown → optioneel tekstveld → submit → feedback opgeslagen → zichtbaar in instellingen-overzicht
- **Success criteria**: Feedback correct opgeslagen met referentie naar dossier en sectie, overzicht toont trends en patronen

### 8. Dashboard met Kennisbank
- **Functionality**: Overzicht van alle dossiers, statistieken en kennisbankdata
- **Purpose**: Geeft inzicht in portfolio, workload en kwaliteit van historische data
- **Trigger**: Applicatie opstart of navigatie naar dashboard
- **Progression**: Open dashboard → toon dossierkaarten met filters → statistieken sectie toont totalen, gemiddelde scores, meest gebruikte referenties → filter op status/type/datum/taxateur → open dossier of start nieuw
- **Success criteria**: Alle dossiers toonbaar, filters werkend, statistieken accuraat, loading states correct

## Edge Case Handling

- **Geen similarity matches** - Toon melding "Geen vergelijkbare rapporten gevonden" met suggestie om parameters aan te passen
- **Incomplete wizarddata** - Validatie blokkeert voortgang, highlight ontbrekende velden
- **Duplicate dossiernummer** - Auto-increment bij conflict
- **Zeer grote tekstvelden** - Textarea met character count en max lengte
- **Verouderde referentierapporten** - Waarschuwing bij rapporten ouder dan 3 jaar
- **Adres zonder coördinaten** - Similarity werkt op postcode indien lat/lng ontbreekt
- **Totaal gewicht ≠ 100%** - Sliders herberekenen automatisch, submit geblokkeerd indien handmatige invoer fout
- **Empty states** - Dashboard zonder dossiers toont onboarding met "Maak eerste dossier"

## Design Direction

Professioneel, betrouwbaar en efficiënt. Het design moet vertrouwen uitstralen zoals een hoogwaardig financieel platform, met duidelijke hiërarchie en geen afleidingen. Denk aan de esthetiek van moderne B2B SaaS tools zoals Notion of Linear, maar dan toegespitst op vastgoedprofessionals.

## Color Selection

Een zakelijke palette met warme, betrouwbare accenten die professionaliteit en stabiliteit uitstralen.

- **Primary Color**: Diep navy blauw `oklch(0.28 0.05 250)` - Communiceert betrouwbaarheid en professionaliteit, gebruikt voor primaire acties en navigatie
- **Secondary Colors**: Warm grijs `oklch(0.65 0.01 260)` voor secundaire elementen, licht grijs `oklch(0.96 0.005 260)` voor backgrounds
- **Accent Color**: Warm amber `oklch(0.65 0.15 65)` voor highlights, similarity scores en call-to-actions - trekt aandacht zonder agressief te zijn
- **Foreground/Background Pairings**: 
  - Background (Licht grijs #F7F8FA): Navy tekst (#1A2940) - Ratio 12.1:1 ✓
  - Primary (Navy #1A2940): White tekst (#FFFFFF) - Ratio 11.8:1 ✓
  - Accent (Amber #D4A748): Navy tekst (#1A2940) - Ratio 4.9:1 ✓
  - Card (White #FFFFFF): Foreground tekst (#1A2940) - Ratio 13.5:1 ✓

## Font Selection

Typefaces moeten zakelijk maar toegankelijk zijn, met uitstekende leesbaarheid voor data-rijke interfaces en lange rapportteksten.

- **Typographic Hierarchy**:
  - H1 (Page Titles): Urbanist SemiBold/32px/tight tracking - Voor paginatitels en hoofdnavigatie
  - H2 (Section Headers): Urbanist Medium/24px/normal tracking - Voor wizard stappen en dashboard secties
  - H3 (Card Titles): Urbanist Medium/18px/normal tracking - Voor dossierkaarten en rapportsecties
  - Body (Interface): Inter Regular/15px/relaxed leading - Voor formulieren en UI elementen
  - Body Large (Rapport): Inter Regular/16px/1.7 leading - Voor rapportteksten, geoptimaliseerd voor leescomfort
  - Small (Labels): Inter Medium/13px/wide tracking - Voor labels en metadata
  - Mono (Data): JetBrains Mono/14px - Voor dossiernummers, datums en numerieke data

## Animations

Animaties versterken de workflow-ervaring en maken state changes duidelijk, zonder te vertragen.

- **Wizard transitions**: Fade + subtle slide (200ms ease-out) bij stapovergang
- **Similarity results**: Staggered fade-in van kaarten (50ms offset) om hiërarchie te tonen
- **Auto-save indicator**: Pulse animatie op "Opgeslagen" label (300ms)
- **Score badges**: Scale-in animatie bij eerste render (150ms spring)
- **Feedback buttons**: Subtiele scale (1.05) + color shift op hover
- **Copy to clipboard**: Success checkmark met scale + fade animatie (400ms)
- **Filter/sort actions**: Smooth height transitions bij collapse/expand
- **Loading states**: Skeleton screens met shimmer effect, geen spinners

## Component Selection

- **Components**:
  - **Wizard**: Custom multi-step component met Progress indicator, wraps Card components per stap
  - **Forms**: Input, Textarea, Select, Switch, Calendar (react-day-picker) voor data-invoer
  - **Dashboard**: Custom grid layout met Card components, Badge voor status, Tabs voor sectiewisseling
  - **Similarity**: Card met custom score indicator (circular progress), Badge voor classificatie kleuren
  - **Rapport**: Accordion voor secties, Textarea voor editing, Separator tussen hoofdstukken
  - **Navigation**: Custom sidebar met Lucide icons, Breadcrumb voor wizard context
  - **Dialogs**: AlertDialog voor confirmaties, Sheet voor instellingen panel
  - **Feedback**: Custom thumb up/down buttons, Popover voor feedback form
  - **Export**: DropdownMenu voor export opties, Tooltip voor disabled DOCX

- **Customizations**:
  - Wizard progress bar met custom gradient fill en step numbers
  - Similarity score circle met SVG circular progress indicator en color-coded arc
  - Report editor met split view (gegenereerd vs bewerkbaar)
  - Custom slider component voor gewichten met auto-balancing logica
  - Status badges met custom color variants (concept/behandeling/afgerond)

- **States**:
  - Buttons: Default heeft subtle shadow, hover lift (2px), active scale (0.98), disabled opacity 0.5
  - Inputs: Default border subtle, focus ring 2px accent color, error red border + shake animation
  - Cards: Default flat, hover subtle elevation (shadow-md), active border accent color
  - Sliders: Track grijs, filled deel gradient primary-to-accent, thumb met hover scale
  - Score badges: Green (80-100), yellow (60-79), orange (40-59), red (0-39) met opacity variants

- **Icon Selection**:
  - Building (lucide) voor objecttype
  - MapPin voor locatie/afstand
  - Calendar voor datums
  - TrendingUp voor marktwaarde
  - FileText voor rapporten
  - Copy voor Flux export
  - ThumbsUp/Down voor feedback
  - Settings voor instellingen
  - Filter voor dashboard filters
  - Plus voor nieuwe dossiers
  - ChevronRight voor wizard navigatie

- **Spacing**:
  - Container padding: px-6 py-8 (desktop), px-4 py-6 (mobile)
  - Section gap: gap-8 (grote secties), gap-4 (form fields)
  - Card padding: p-6 (standaard), p-4 (compact)
  - Grid gaps: gap-6 (dashboard cards), gap-3 (form layouts)
  - Wizard steps: mb-8 tussen stappen, mb-4 binnen stap

- **Mobile**:
  - Wizard: Single column layout, sticky progress bar bovenaan, grotere touch targets (min 44px)
  - Dashboard: Stack cards verticaal, filters in collapsible Sheet
  - Rapport: Full-width editor, floating action button voor export
  - Similarity: Score cards stapelen, scroll horizontal voor top 5
  - Sidebar: Collapsed by default, hamburger menu toggle
  - Tables: Horizontal scroll met sticky first column
  - Forms: Full-width inputs, labels boven veld in plaats van naast
