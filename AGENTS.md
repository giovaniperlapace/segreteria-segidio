# AGENTS.md - Segreteria Segidio

## Scopo di questo file

Questo file serve come contesto operativo rapido per le sessioni Codex sul progetto **Segreteria Segidio**. Non sostituisce `PIANO_DI_LAVORO.md`: finche' quel file esiste, va letto per il piano completo. Quando il piano sara' realizzato, `PIANO_DI_LAVORO.md` potra' essere eliminato e questo file restera' come riferimento permanente.

## Stato attuale

- Il progetto ha completato le Milestone 1-10: setup, ambiente, schema MVP, autenticazione, gestione utenti, CRUD archivio, import contatti Access, audit, gestione eventi con storico inviti Access e costruzione avanzata delle liste invitati.
- La prossima milestone operativa e' la Milestone 11: gestione manuale degli stati di invito e risposta.
- E' inizializzato come repository Git su branch `main`, con remote `origin` su GitHub.
- L'app Next.js e' scaffoldata nella root con App Router, React 19, TypeScript, Tailwind CSS 4 ed ESLint.
- Il codice applicativo include login magic link, callback, dashboard protetta e logout.
- La dashboard manager espone nell'ordine contatti, riferimenti, eventi, storico e impostazioni. Utenti/ruoli e gruppi sono raggiungibili dalla sezione Settings.
- I profili utente hanno `first_name` e `last_name` separati; `full_name` resta sincronizzato per compatibilita'.
- L'archivio e' stato ripopolato dal database Access dati corretto `old_software/DbSegreteria2.mdb` con 12.956 contatti legacy, 54 gruppi, 12.946 relazioni contatto-gruppo, 297 riferimenti interni normalizzati e 13.439 relazioni contatto-riferimento.
- La Milestone 9 ha importato 484 eventi legacy e 181.588 relazioni evento-contatto valide da `PersoneInviti`; 88 email mancanti sono state recuperate in modo conservativo da `SpedizioniEmail`. I vecchi flag Access non sono stati importati.
- Le pagine eventi, contatti e riferimenti usano il pattern standard tabella/schede dove pertinente e popup modificabile per i dettagli. Le liste invitati evento supportano ricerca, filtri, ordinamento, flag per-evento e apertura della scheda completa del contatto.
- La Milestone 10 aggiunge `/dashboard/events/[eventId]/build`: filtri combinabili per ricerca, stato, priorita', dati mancanti, gruppi, referenti ed evento passato con risposta/presenza; selezione massiva; inviti diretti idempotenti; proposte separate assegnate ai referenti; conversione delle proposte approvate in inviti.
- I referenti approvano o escludono le proposte da `/dashboard/proposals`. Le proposte non entrano nei conteggi invitati finche' il manager non le converte esplicitamente.
- Esiste `PIANO_DI_LAVORO.md`, creato a partire dai tre transcript vocali presenti nella root.
- Esiste `.env.example` con le variabili Supabase previste.
- Esiste `.env.local` locale con valori reali Supabase, ma e' gitignored e non va stampato o committato.
- Il progetto Vercel `giovaniperlapaces-projects/segreteria-segidio` e' linkato localmente in `.vercel/project.json` (gitignored).
- Il dominio di produzione e' `https://archivio-segreteria.segidio.org`.
- Il dominio custom serve la versione aggiornata con `/login`, `/auth/callback`, `/dashboard` e API magic link.
- L'unica repository ufficiale e' la repository pubblica `https://github.com/giovaniperlapace/segreteria-segidio`; il progetto Vercel e' collegato a questa repository sul branch Production `main` e i push attivano il deploy automatico.
- Le variabili Supabase sono state impostate su Vercel in Production, Development e Preview.
- Esiste la prima migration MVP in `supabase/migrations/20260602163000_initial_mvp_schema.sql`.
- La migration MVP e' stata applicata in modo persistente al database self-hosted.
- Esistono client Supabase browser, server e service-role separati.
- Il login usa magic link Supabase inviato tramite Gmail SMTP da `segreteriagenerale@santegidio.org`.
- Il primo profilo manager e' `segreteriagenerale@santegidio.org`.

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
- Repository ufficiale: `https://github.com/giovaniperlapace/segreteria-segidio`
- Supabase URL previsto: `https://supabase-segreteria.stefano-orlando.it`
- Coolify URL: `https://coolify.stefano-orlando.it/`

## MVP da tenere come bussola

L'MVP deve restare realistico e non inglobare subito tutte le funzioni avanzate.

Include:

- autenticazione;
- ruoli manager e riferimento interno;
- schema database iniziale;
- contatti con gruppi e riferimenti;
- stato contatto attivo/non attivo;
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

La prossima sessione dovrebbe avviare la Milestone 10:

1. verificare `git status` e rivedere `PIANO_DI_LAVORO.md`;
2. progettare la selezione massiva dei contatti per un evento;
3. riusare i filtri archivio per gruppo, riferimento, stato, priorita' e dati mancanti;
4. impedire duplicati nella stessa lista evento;
5. valutare il filtro per inviti/partecipazioni a eventi passati;
6. completare il collaudo operativo con un utente `reference` reale.

Restano inoltre da rivedere i valori paese legacy non normalizzati (`UE`, `SMOM`, `OLP`, `ONU`, `Jugoslavia`, `Polisario`).

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
- Quando una migration `.sql` e' necessaria per il lavoro richiesto e non e' distruttiva, applicarla senza attendere un ulteriore ok esplicito dopo averla rivista.
- Non applicare migration distruttive senza conferma esplicita.
- Non toccare produzione per operazioni distruttive, deploy o modifiche fuori scope senza conferma esplicita.
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
- `supabase/migrations/20260604120000_auth_profiles_hardening.sql`
- `supabase/migrations/20260604180000_manager_user_administration.sql`
- `supabase/migrations/20260605100000_split_profile_names.sql`
- `supabase/migrations/20260605120000_contact_language_settings.sql`
- `supabase/migrations/20260605130000_legacy_access_import_upsert.sql`
- `supabase/migrations/20260606120000_real_access_import_fields.sql`
- `supabase/migrations/20260606150000_contact_history_audit_actor.sql`
- `supabase/migrations/20260606170000_events_legacy_history.sql`
- `supabase/migrations/20260607120000_invitation_proposals_and_bulk_selection.sql`

Include:

- enum applicativi per ruoli, stati contatto, priorita', eventi, inviti, risposte e presenze;
- tabelle `profiles`, `internal_references`, `groups`, `contacts`, `contact_groups`, `contact_references`, `events`, `event_invitations`, `contact_versions`, `audit_logs`;
- vista `contacts_missing_required_data`;
- trigger `updated_at`, storico contatti e audit log;
- helper RLS `is_manager`, `current_internal_reference_id`, `can_access_contact`, `can_access_event`;
- policy RLS per manager e riferimenti.
- tabella impostazioni `contact_languages` per alimentare il selettore lingua;
- indice unico pieno su `contacts.legacy_access_id` per import idempotenti via PostgREST.
- funzioni trigger aggiornate per attribuire autore a versioni contatto e audit anche nelle scritture server-side con service role.
- campi legacy eventi e storico inviti, flag operativo per-evento e indici per import idempotente.
- tabella `invitation_proposals`, stati pending/approved/excluded, audit e policy RLS per manager e referente assegnato.

La migration e' stata applicata con `psql` nel container `supabase-db-c13y7vgiy5k5gbs9r9edpgeu`. Dopo l'applicazione sono state verificate 10 tabelle core, RLS attiva su tutte le tabelle, nessuna foreign key senza indice e smoke test con `begin; ... rollback;` senza lasciare dati fittizi.

## Import Access completato

La Milestone 7 e' stata corretta il 2026-06-05: `old_software/Segreteria2.mdb` e' solo il database interfaccia e non va usato come fonte dati. Il primo import da `EXPO2000` e' stato eliminato dalle tabelle operative. La fonte corretta e' `old_software/DbSegreteria2.mdb`, tabella principale `Persone`, importata tramite:

```bash
python3 scripts/export_legacy_access_contacts.py --mdb old_software/DbSegreteria2.mdb --out old_software/export
python3 scripts/import_legacy_access_contacts.py --apply --allow-insecure-tls
```

Risultato persistente sul database self-hosted:

- 12.956 contatti con `legacy_access_id = Persone.IdPersona` valorizzato e univoco;
- 4.104 contatti attivi e 8.852 contatti non attivi (`contacts.status = 'standby'`, etichetta UI "Non attivo");
- 54 gruppi derivati da `Gruppi`;
- 12.946 relazioni `contact_groups` derivate da `Persone.IdGruppo`;
- 297 riferimenti interni normalizzati derivati da `Persone.Contatti`;
- 13.439 relazioni `contact_references`.
- i riferimenti legacy composti con virgola sono stati splittati in referenti atomici; i punti interrogativi nei nomi riferimento sono stati rimossi (`Vincenzo?` -> `Vincenzo`).

I riferimenti interni hanno `first_name` e `last_name` separati, con `full_name` mantenuto sincronizzato. La pagina `/dashboard/references` mostra una tabella di consultazione; cliccando una riga si apre la scheda modificabile con i contatti associati. I riferimenti non collegati possono essere convertiti in utenti `reference` se hanno nome, cognome ed email valida.

Le pagine che leggono molti record usano fetch paginato per evitare il limite PostgREST di 1000 righe per query.

Contatti e riferimenti interni supportano eliminazione operativa tramite soft delete (`deleted_at`, `deleted_by_profile_id`): spariscono da liste e selettori, ma restano nel database per storico/audit. Non esiste una funzione UI di riattivazione.

`Persone.Attivo = S` viene importato come attivo; `N`/`n` viene importato come `standby` e mostrato nell'app come "Non attivo".

Lingue e paesi legacy sono stati normalizzati solo per alias certi verso le opzioni UI. Valori non-paese o ambigui conservati per revisione post-import: `UE`, `SMOM`, `OLP`, `ONU`, `Jugoslavia`, `Polisario`.

## Import eventi Access completato

La Milestone 9 e' stata completata il 2026-06-06 usando `old_software/DbSegreteria2.mdb`:

```bash
python3 scripts/import_legacy_access_events.py --apply --allow-insecure-tls --recover-missing-emails
```

Risultato persistente sul database self-hosted:

- 484 eventi importati da `Eventi`;
- 181.588 inviti storici validi importati da `PersoneInviti`;
- risposte normalizzate: 156.191 senza risposta, 15.786 partecipazioni dichiarate, 9.492 rifiuti e 119 risposte forse;
- presenze normalizzate: 435 presenti, 25 assenti e 181.128 non verificate;
- 88 indirizzi email mancanti recuperati in modo conservativo da `SpedizioniEmail`;
- righe orfane o incomplete scartate senza creare record fittizi;
- nessun vecchio valore `Flag` Access importato.

Il nuovo flag `event_invitations.attention_flag`, con nota opzionale, e' relativo esclusivamente al contatto dentro lo specifico evento. Gli eventi e gli inviti possono essere consultati e modificati da `/dashboard/events`; ogni contatto mostra lo storico recente degli eventi nel proprio popup.

## Autenticazione e provisioning utenti

- La pagina `/login` richiede soltanto l'email: il ruolo non viene scelto dall'utente.
- Solo email presenti in `profiles` con `active = true` possono richiedere un magic link.
- Quando si fanno prove operative del login/magic link, non inviare mail di prova a `segreteriagenerale@santegidio.org`: usare `steorlando@gmail.com`.
- Supabase genera il token; l'API route server invia il link tramite Gmail SMTP.
- `/auth/callback` verifica il token e crea la sessione.
- `/dashboard` e' protetta lato proxy e lato server.
- Manager e riferimenti vedono navigazione coerente al proprio ruolo.
- I manager gestiscono utenti autorizzati, ruoli e disattivazioni da `/dashboard/users`.
- L'ultimo manager attivo non puo' essere disattivato o declassato.
- Per aggiungere o aggiornare un utente autorizzato:

```bash
npm run user:provision -- email@example.org manager Nome Cognome
npm run user:provision -- email@example.org reference Nome Cognome
```

- Il comando crea, se necessario, l'utente Supabase Auth e fa upsert del profilo applicativo.
- Variabili server necessarie per l'invio: `GMAIL_USER` e `GMAIL_APP_PASSWORD`.
- `APP_URL` definisce l'origine dei magic link: in Production deve essere `https://archivio-segreteria.segidio.org`, in Development `http://localhost:3000`.
- In Preview `APP_URL` deve restare assente, cosi' ogni deployment usa automaticamente la propria origine Vercel.

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
npx vercel env add APP_URL production --value "https://archivio-segreteria.segidio.org" --force --yes --scope "$scope"
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
