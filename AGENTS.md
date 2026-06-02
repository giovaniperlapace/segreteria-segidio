# AGENTS.md - Segreteria Segidio

## Scopo di questo file

Questo file serve come contesto operativo rapido per le sessioni Codex sul progetto **Segreteria Segidio**. Non sostituisce `PIANO_DI_LAVORO.md`: finche' quel file esiste, va letto per il piano completo. Quando il piano sara' realizzato, `PIANO_DI_LAVORO.md` potra' essere eliminato e questo file restera' come riferimento permanente.

## Stato attuale

- Il progetto ha completato la Milestone 1: setup repository e progetto Next.js.
- E' inizializzato come repository Git su branch `main`, con remote `origin` su GitHub.
- L'app Next.js e' scaffoldata nella root con App Router, React 19, TypeScript, Tailwind CSS 4 ed ESLint.
- Esiste una pagina placeholder tecnica in `src/app/page.tsx`; non sono ancora implementate funzionalita' applicative.
- Esiste `PIANO_DI_LAVORO.md`, creato a partire dai tre transcript vocali presenti nella root.
- Esiste `.env.example` con le variabili Supabase previste.
- Esiste `.env.local` locale con valori reali Supabase, ma e' gitignored e non va stampato o committato.
- Il progetto Vercel `giovaniperlapaces-projects/segreteria-segidio` e' linkato localmente in `.vercel/project.json` (gitignored).
- Le variabili Supabase sono state impostate su Vercel in Production, Development e Preview.
- Esiste la prima migration MVP in `supabase/migrations/20260602163000_initial_mvp_schema.sql`.
- La migration MVP e' stata applicata in modo persistente al database self-hosted.
- Non esiste ancora client Supabase nel codice applicativo.

File di contesto da leggere all'inizio di una sessione:

1. `AGENTS.md`
2. `PIANO_DI_LAVORO.md`, se ancora presente
3. I tre file `.txt` solo se serve ricostruire l'origine dei requisiti

## Visione sintetica dell'app

Segreteria Segidio e' una web app per gestire:

- contatti/invitati;
- gruppi e categorie flessibili;
- riferimenti interni dell'organizzazione;
- eventi;
- liste invitati per evento;
- inviti, risposte e partecipazioni;
- dashboard operative;
- storico modifiche;
- stampe/export;
- controlli su dati mancanti e possibili dimenticanze.

Il problema principale da risolvere e' ridurre lavoro manuale e liste cartacee: oggi gli invitati vengono spesso selezionati uno per uno, verificati con referenti interni e aggiornati manualmente.

## Stack previsto

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- Supabase self-hosted/gestito su VM Hetzner tramite Coolify
- Deploy Vercel
- Repository prevista: `https://github.com/steorlando/segreteria-segidio`
- Supabase URL previsto: `https://supabase-segreteria.stefano-orlando.it`
- Coolify URL: `https://coolify.stefano-orlando.it/`

## MVP da tenere come bussola

L'MVP deve restare realistico e non inglobare subito tutte le funzioni avanzate.

Include:

- autenticazione;
- ruoli manager e riferimento interno;
- schema database iniziale;
- contatti con gruppi e riferimenti;
- stato contatto attivo/stand-by;
- eventi semplici;
- selezione invitati con filtri base;
- lista invitati per evento;
- gestione manuale stato invito/risposta;
- dashboard base;
- viste dati mancanti;
- export/stampe semplici;
- audit minimo delle modifiche.

Post-MVP:

- invio email robusto con batch, retry e logging;
- risposta automatica via link pubblico;
- template email avanzati e allegati;
- workflow di validazione liste con riferimenti;
- segmenti evento;
- QR code e check-in;
- alert su contatti importanti;
- deduplica;
- storico avanzato persona/carica/istituzione;
- import Excel/CSV;
- reportistica avanzata.

## Prossimo lavoro consigliato

La prossima sessione dovrebbe passare alla Milestone 4:

1. verificare `git status`;
2. rivedere `PIANO_DI_LAVORO.md`;
3. avviare autenticazione, profili e ruoli;
4. verificare RLS con utenti manager/reference;
5. mantenere service role solo lato server.

Poi seguire le milestone di `PIANO_DI_LAVORO.md`.

## Regole operative importanti

- Prima di modificare file, capire lo stato del progetto con `pwd`, `rg --files` e, se Git esiste, `git status`.
- Non revertire modifiche dell'utente.
- Non fare scaffolding, migration o deploy se la richiesta e' solo di analisi.
- Non introdurre funzionalita' fuori milestone.
- Non committare automaticamente se l'utente non lo chiede.
- Non committare segreti o file `.env`.
- Usare `.env.example` per documentare variabili.
- Tenere i diff piccoli e leggibili.
- Dopo modifiche applicative eseguire controlli adeguati: TypeScript, lint, build, test.
- Prima di applicare migration, mostrarle o rivederle con attenzione.
- Non applicare migration distruttive senza conferma esplicita.
- Non toccare produzione senza conferma esplicita.
- Distinguere sempre locale, preview/staging e produzione.

## Sicurezza e Supabase

- Usare Supabase Auth.
- Creare profili applicativi collegati agli utenti auth.
- Ruoli minimi: `manager` e `reference`.
- Abilitare RLS sulle tabelle sensibili.
- Il manager puo' vedere e gestire tutto.
- Il riferimento deve vedere solo i contatti associati e le funzioni pertinenti.
- Proteggere pagine, server actions e API routes lato server.
- La service role key deve stare solo lato server.
- Verificare le policy RLS con utenti diversi.
- Considerare GDPR, minimizzazione dei dati, storico modifiche e accessi ai dati personali.

## Modello dati concettuale

Le tabelle da considerare, partendo dal piano:

- `profiles`
- `contacts`
- `contact_versions`
- `groups`
- `contact_groups`
- `internal_references`
- `contact_references`
- `events`
- `event_invitations`
- `audit_logs`

Da prevedere per il post-MVP:

- `organizations`
- `positions`
- `event_segments`
- `invitation_proposals`
- `invitation_responses`
- `email_templates`
- `email_logs`
- `checkins`
- `attachments`

Scelta progettuale da non dimenticare: nel MVP si puo' tenere `contacts` come record corrente con storico minimo; la separazione piu' raffinata tra persona fisica, carica e istituzione va progettata senza bloccare lo sviluppo iniziale.

Migration MVP creata:

- `supabase/migrations/20260602163000_initial_mvp_schema.sql`

Include:

- enum applicativi per ruoli, stati contatto, priorita', eventi, inviti, risposte e presenze;
- tabelle `profiles`, `internal_references`, `groups`, `contacts`, `contact_groups`, `contact_references`, `events`, `event_invitations`, `contact_versions`, `audit_logs`;
- vista `contacts_missing_required_data`;
- trigger `updated_at`, storico contatti e audit log;
- helper RLS `is_manager`, `current_internal_reference_id`, `can_access_contact`, `can_access_event`;
- policy RLS per manager e riferimenti.

La migration e' stata applicata con `psql` nel container `supabase-db-c13y7vgiy5k5gbs9r9edpgeu`. Dopo l'applicazione sono state verificate 10 tabelle core, RLS attiva su tutte le tabelle, nessuna foreign key senza indice e smoke test con `begin; ... rollback;` senza lasciare dati fittizi.

## Vercel env vars

Quando si aggiornano variabili Vercel, preferire il flusso CLI non interattivo.

Account/scope attuale:

- account CLI: `giovaniperlapace`
- scope Vercel: `giovaniperlapaces-projects`
- progetto: `segreteria-segidio`

Prima confermare account/scope e link progetto:

```bash
npx vercel whoami
npx vercel project ls --scope giovaniperlapaces-projects
npx vercel link --yes --project segreteria-segidio --scope giovaniperlapaces-projects
```

Tenere i segreti in variabili shell e non stamparli. Usare `--value`, `--force`, `--yes`:

```bash
scope=giovaniperlapaces-projects
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production --value "$url" --force --yes --scope "$scope"
npx vercel env add SUPABASE_URL production --value "$url" --force --yes --scope "$scope"
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --value "$anon_key" --force --yes --scope "$scope"
npx vercel env add SUPABASE_ANON_KEY production --value "$anon_key" --force --yes --scope "$scope"
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production --value "$service_key" --force --yes --scope "$scope"
```

Ripetere per `development`. Per `preview`, Vercel puo' chiedere il branch anche con `--value`. In questa repo il metodo non interattivo che ha funzionato e':

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL preview "" --value "$url" --force --yes --scope "$scope"
```

L'argomento branch vuoto (`""`) applica la variabile a tutti i branch Preview.

Prima di deploy da sorgente locale, creare `.vercelignore` se manca:

```gitignore
.env
.env.*
```

## Credenziali e accessi

Supabase di questo progetto:

- URL: `https://supabase-segreteria.stefano-orlando.it`
- Coolify project/container suffix: `c13y7vgiy5k5gbs9r9edpgeu`
- container Kong: `supabase-kong-c13y7vgiy5k5gbs9r9edpgeu`

Per recuperare le chiavi self-hosted Supabase, usare SSH/Docker sul server Hetzner e leggere `ANON_KEY` e `SERVICE_KEY` dal container Kong. Non stamparle in chat.

Il file Coolify API locale previsto e' `/Users/stefanolaptop/.config/coolify/codex.env`; al momento della Milestone 2 il token API ha risposto `401`, mentre SSH root verso `178.105.59.79` funzionava.

Se servono dati Supabase, database o Coolify, cercarli tramite Coolify/SSH solo se l'accesso e' disponibile e solo quando la milestone lo richiede.

Se non si riesce ad accedere, non inventare credenziali o workaround. Dire chiaramente cosa manca:

- token GitHub;
- login Coolify;
- API token Coolify;
- Supabase access token;
- database password;
- connection string;
- service role key;
- anon key;
- project ref;
- variabili d'ambiente gia' configurate;
- permessi mancanti.

## Decisioni aperte da ricordare

- Provider email.
- Stati risposta definitivi.
- Gestione allegati.
- Campi contatto obbligatori.
- Separazione persona/carica/istituzione.
- Livello di storico nel MVP.
- Import dati iniziali.
- Formato export/stampe.
- Ambiente staging.
- Policy GDPR/data retention.
- Segmenti evento nel MVP o post-MVP.
- Permessi precisi dei riferimenti interni.

## Criterio di qualita'

Ogni blocco deve lasciare il progetto piu' chiaro di prima: scope piccolo, controlli eseguiti, nessun segreto, permessi ragionati, e una spiegazione sintetica di cosa e' cambiato e cosa resta da fare.
