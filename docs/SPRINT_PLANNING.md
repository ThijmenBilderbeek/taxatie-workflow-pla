# Sprint Planning — AI & Kennisbank Features

Dit document beschrijft de geplande sprints na Sprint 4 (Kennisbank-context integratie in AI-rapportgeneratie). Het dient als referentie voor toekomstige ontwikkelsessies zodat elke sprint direct opgepakt kan worden zonder verlies van context.

---

## Sprint 5: Feedback-loop & AI-kwaliteitsverbetering

**Doel:** Sla bij elke sectiebewerking het verschil op, stuur recente negatieve feedback terug naar de AI, en gebruik acceptatiestatistieken om de `reuseScore` in de Kennisbank automatisch bij te werken.

- **Sectie-niveau feedback opslaan**: Wanneer een taxateur een AI-gegenereerde sectie bewerkt, sla het verschil (diff) op in een `sectie_feedback` tabel (kolommen: `dossier_id`, `sectie_key`, `original_text`, `edited_text`, `diff`, `feedback_type` (`positive`/`negative`/`edited`), `created_at`)
- **Feedback meesturen naar AI**: Bij volgende generaties, stuur de meest recente negatieve feedback mee in de prompt — vergelijkbaar met hoe `src/lib/aiSuggestions.ts` al eerdere negatieve veldsuggesties meestuurt naar `supabase/functions/openai-suggest-field/index.ts`
- **Kwaliteitsscore per sectie**: Track hoe vaak secties worden geaccepteerd vs. bewerkt → bereken een acceptatieratio per `sectie_key` en gebruik dit om de `reuse_score` kolom in de Kennisbank-tabel `document_chunks` te updaten

**Relevante bestanden:**
- `src/lib/aiSuggestions.ts` — patroon voor feedback meesturen naar AI (referentie-implementatie)
- `src/lib/aiRapportGenerator.ts` — hier dient de negatieve feedback toegevoegd te worden aan de prompt
- `supabase/functions/openai-generate-section/index.ts` — Edge Function uitbreiden met `sectieFeedback` parameter
- `src/components/RapportView.tsx` — UI voor het detecteren van edits en opslaan van feedback
- `src/types/kennisbank.ts` — type-definities uitbreiden met `SectieFeedback` interface

---

## Sprint 6: Kennisbank automatisch verrijken bij afronden rapport

**Doel:** Bij het afronden van een rapport worden bewerkte secties automatisch als hoogwaardige chunks opgeslagen in de Kennisbank, zodat toekomstige generaties profiteren van menselijk gecorrigeerde voorbeelden.

- Bij "Rapport afronden" (`src/components/RapportView.tsx` → `handleAfronden`), extraheer automatisch de bewerkte secties als nieuwe chunks met hoge `reuseScore` (bijv. `0.9`)
- Vergelijk AI-gegenereerde tekst met de handmatig bewerkte versie → markeer bewerkte versies als betere stijlvoorbeelden (`chunk_type: 'style_example'`)
- Update het `DocumentWritingProfile` op basis van het voltooide rapport (toon, woordkeus, zinslengtes)

**Relevante bestanden:**
- `src/components/RapportView.tsx` — `handleAfronden` functie uitbreiden
- `src/lib/documentKnowledgeExtractor.ts` — hergebruik extractie-logica voor nieuwe chunks
- `src/lib/kennisbankRetriever.ts` — eventueel cache invalideren na nieuwe chunks
- `src/hooks/useDocumentKnowledge.ts` — hook aanroepen bij afronden
- `src/types/kennisbank.ts` — `DocumentWritingProfile` type

---

## Sprint 7: Slimme template-selectie op basis van objectkenmerken

**Doel:** Vervang de huidige `chapter`/`object_type` filtering door semantisch zoeken via vector embeddings, zodat de meest inhoudelijk relevante chunks worden gevonden — ook voor complexe of gemengde objecttypes.

- Voeg vector embeddings toe aan `document_chunks` (via Supabase `pgvector` extensie) — genereer embeddings met `text-embedding-ada-002` bij het opslaan van chunks
- Gebruik semantische zoekfunctionaliteit (`cosine_similarity`) om de meest relevante chunks te vinden in plaats van alleen op `chapter`/`object_type` match
- Dit verbetert de kwaliteit drastisch voor edge cases (bijv. een bedrijfscomplex met kantoorgedeelte)

**Relevante bestanden:**
- `src/lib/kennisbankRetriever.ts` — retrieval-logica aanpassen naar vector similarity search
- `supabase/functions/openai-classify/index.ts` — embeddings genereren bij classificatie
- `src/types/kennisbank.ts` — `DocumentChunk` type uitbreiden met `embedding` veld
- `src/hooks/useKennisbankSuggestions.ts` — suggesties ophalen via semantisch zoeken

---

## Sprint 8: Multi-sectie coherentie

**Doel:** Zorg dat eerder gegenereerde secties invloed hebben op latere secties, zodat het rapport intern consistent blijft zonder tegenstrijdige omschrijvingen.

- Stuur een samenvatting van eerder gegenereerde secties mee bij het genereren van latere secties (bijv. een `previousSectionsSummary` parameter in de Edge Function)
- Voorkomt contradicts (bijv. B.1 zegt "kantoor" maar B.6 beschrijft een bedrijfshal)
- Voeg een "Rapport coherentie check" toe die na volledige generatie een snelle AI-check uitvoert en eventuele inconsistenties markeert

**Relevante bestanden:**
- `src/lib/aiRapportGenerator.ts` — secties sequentieel genereren en context doorgeven
- `supabase/functions/openai-generate-section/index.ts` — `previousSectionsSummary` parameter toevoegen
- `src/components/RapportView.tsx` — coherentie-check resultaten tonen in de UI
- `src/types/index.ts` — eventuele nieuwe typen voor coherentie-resultaten

---

## Sprint 9: Performance & kosten optimalisatie

**Doel:** Verlaag de OpenAI API-kosten en verbeter de responstijd door caching, batching en slimme modelkeuze.

- Caching van AI-responses per `sectieKey` + `dossierHash` combinatie — identieke dossiers genereren geen nieuwe API calls
- Batch meerdere korte secties in één API call om overhead te verminderen
- Migreer van `gpt-4o-mini` naar `gpt-4o` alleen voor complexe secties (B.6, B.9, B.10) om kosten te beheersen
- Rate limiting dashboard voor OpenAI kosten monitoring — toon verbruik per gebruiker/dossier

**Relevante bestanden:**
- `src/lib/aiRapportGenerator.ts` — caching en batching implementeren
- `supabase/functions/openai-generate-section/index.ts` — modelkeuze op basis van `sectieKey`
- `src/components/RapportView.tsx` — indicator tonen wanneer cache wordt gebruikt
- `src/components/WizardFlow.tsx` — eventueel kostenindicator toevoegen

---

## Sprint 10: Gebruikerservaring & fine-tuning

**Doel:** Geef taxateurs meer controle over de AI-generatie en bied inzicht in de Kennisbank-kwaliteit.

- **"Regenereer met instructie"** — taxateur kan per sectie een vrije instructie meegeven (bijv. "Maak dit formeler" of "Voeg meer detail toe over de fundering") die als extra context naar de AI gaat
- **A/B test**: toon 2 AI-varianten naast elkaar, laat taxateur de beste kiezen → gebruik de keuze als feedbacksignaal
- **Exporteer Kennisbank-statistieken**: hoeveel templates, gemiddelde `reuseScore`, meest gebruikte schrijftonen — toon als dashboard of exporteer als CSV

**Relevante bestanden:**
- `src/components/RapportView.tsx` — "Regenereer met instructie" UI toevoegen
- `src/components/KennisbankSuggestiesPanel.tsx` — statistieken tonen
- `src/components/SuggestieFeedbackDialog.tsx` — A/B keuze-interface
- `src/lib/aiRapportGenerator.ts` — instructie-parameter doorgeven aan de Edge Function
- `supabase/functions/openai-generate-section/index.ts` — `userInstruction` parameter toevoegen

---

## Relevante bestaande bestanden

De bovenstaande sprints bouwen voort op de volgende bestanden in de huidige codebase:

| Bestand | Omschrijving |
|---|---|
| `src/lib/aiEnhancer.ts` | AI-verrijking van dossiergegevens |
| `src/lib/aiSuggestions.ts` | AI-veldsuggesties met feedback-loop (referentie voor Sprint 5) |
| `src/lib/aiRapportGenerator.ts` | AI-rapportgeneratie per sectie |
| `src/lib/documentKnowledgeExtractor.ts` | Extractie van chunks uit documenten voor de Kennisbank |
| `src/lib/kennisbankRetriever.ts` | Ophalen van relevante Kennisbank-chunks bij generatie |
| `src/hooks/useDocumentKnowledge.ts` | React hook voor document-kennisbeheer |
| `src/hooks/useKennisbankSuggestions.ts` | React hook voor Kennisbank-suggesties |
| `src/components/RapportView.tsx` | Hoofdcomponent voor rapport weergave en bewerking |
| `src/components/KennisbankSuggestiesPanel.tsx` | Panel voor Kennisbank-suggesties |
| `src/components/SuggestieFeedbackDialog.tsx` | Dialog voor feedback op suggesties |
| `src/components/WizardFlow.tsx` | Wizard voor het aanmaken van een dossier |
| `src/types/kennisbank.ts` | TypeScript-types voor de Kennisbank |
| `src/types/index.ts` | Algemene TypeScript-types |
| `supabase/functions/openai-classify/index.ts` | Edge Function: AI-classificatie van chunks |
| `supabase/functions/openai-suggest-field/index.ts` | Edge Function: AI-veldsuggesties |
| `supabase/functions/openai-generate-section/index.ts` | Edge Function: AI-sectiegeneratie (indien aanwezig) |
