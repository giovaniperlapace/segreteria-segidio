# Piano di lavoro - Segreteria Segidio

## 1. Premessa e metodo di lavoro

Questa prima fase serve a trasformare le trascrizioni vocali in una direzione di sviluppo ordinata. L'applicazione dovra' sostituire un sistema oggi molto manuale, quindi il metodo migliore e' procedere per milestone piccole, verificabili e reversibili, evitando di costruire subito tutte le funzioni avanzate.

Regole di lavoro consigliate con Codex:

- lavorare sempre per blocchi brevi, con obiettivo, output atteso e criteri di accettazione chiari;
- non fare grandi modifiche non richieste e non introdurre refactor estesi fuori scope;
- mantenere sincronizzazione costante con GitHub quando la repository sara' inizializzata;
- fare commit frequenti, descrittivi e legati a una singola milestone;
- verificare `git status` prima e dopo ogni blocco di lavoro;
- produrre diff leggibili, evitando cambiamenti mescolati tra loro;
- controllare sempre le migration prima di applicarle;
- applicare le migration `.sql` necessarie e non distruttive senza attendere un ulteriore ok esplicito dopo review;
- non applicare migration distruttive senza conferma esplicita;
- non toccare produzione per operazioni distruttive, deploy o modifiche fuori scope senza conferma;
- distinguere ambiente locale, staging/preview e produzione;
- non committare segreti, chiavi Supabase, password database o token;
- usare `.env.example` per documentare le variabili necessarie;
- validare TypeScript, lint, build e test dopo ogni milestone significativa;
- documentare ogni decisione tecnica rilevante;
- chiedere chiarimenti quando servono credenziali o decisioni di prodotto;
- preferire implementazioni semplici ma solide;
- mantenere guardrails su privacy, sicurezza, ruoli e accesso ai dati.

Le Milestone 1-7 sono completate. Il prossimo blocco operativo deve partire dalla Milestone 8 su storicizzazione minima e audit consultabile.

## 2. Sintesi della visione dell'app

Segreteria Segidio e' una web app per gestire eventi, contatti istituzionali, inviti, risposte e liste operative. L'obiettivo e' ridurre il lavoro manuale oggi necessario per selezionare invitati, verificare liste con i riferimenti interni, inviare comunicazioni, registrare risposte e ricostruire lo storico di partecipazioni e modifiche.

La visione centrale e' avere un archivio contatti interrogabile in modo flessibile: per gruppo, per riferimento interno, per evento passato, per stato di invito, per risposta, per partecipazione effettiva e per dati mancanti. L'app deve permettere al manager di creare eventi, generare liste di invitati tramite filtri combinati, gestire inviti e risposte, produrre stampe/export e mantenere lo storico dei contatti.

Nel tempo l'app dovra' supportare email con link di risposta, workflow di conferma da parte dei riferimenti interni, segmenti di evento, QR code/check-in, alert intelligenti e reportistica piu' avanzata.

## 3. Glossario dei concetti

- **Contatto/invitato**: persona o contatto istituzionale presente nell'archivio e potenzialmente invitabile a uno o piu' eventi.
- **Persona fisica**: individuo reale, con nome, cognome, recapiti personali o professionali e storico dei ruoli ricoperti.
- **Carica**: ruolo istituzionale o organizzativo, per esempio "Ministro dell'Istruzione"; puo' cambiare persona mantenendo parte dei dati dell'ufficio.
- **Istituzione**: ente, ambasciata, ufficio, organizzazione o struttura collegata a una persona o carica.
- **Gruppo/categoria**: classificazione flessibile dei contatti, per esempio ambasciatori, persone religiose, persone politiche, ambasciate.
- **Referente interno**: persona dell'organizzazione che segue determinati contatti; puo' essere anche utente dell'app con permessi limitati.
- **Manager**: utente amministrativo/operativo che vede tutto, crea eventi, gestisce contatti, liste, inviti, risposte, dashboard e storico.
- **Evento**: iniziativa a cui invitare contatti, con titolo, data, luogo, stato e lista invitati.
- **Segmento evento**: parte distinta di un evento, per esempio liturgia, ricevimento o liturgia + ricevimento.
- **Invito**: associazione tra evento e contatto, con stato di selezione, invio, risposta e partecipazione.
- **Proposta di invito**: indicazione proveniente da un riferimento interno su chi invitare o non invitare.
- **Risposta**: esito comunicato dall'invitato: partecipo, non partecipo, forse o altra opzione da definire.
- **Partecipazione/check-in**: conferma dell'effettiva presenza all'evento o a un segmento.
- **Non attivo**: stato di contatto non operativo, non mostrato normalmente tra i potenziali invitati.
- **Storico/versione**: registrazione delle modifiche nel tempo per sapere cosa e' cambiato, quando e da chi.

## 4. MVP proposto

L'MVP deve coprire il lavoro operativo minimo senza inglobare subito le funzioni piu' complesse. La priorita' e' costruire un archivio contatti affidabile, creare eventi, selezionare invitati con filtri utili e gestire manualmente inviti e risposte.

Scope MVP consigliato:

- autenticazione con Supabase Auth;
- ruoli applicativi iniziali: manager e riferimento interno;
- interfaccia riservata ai manager per creare utenti autorizzati, assegnare il ruolo manager/riferimento e disattivare gli accessi;
- schema database iniziale con contatti, gruppi, riferimenti, eventi, inviti e audit minimo;
- gestione contatti con campi principali: nome, cognome, email, telefono, indirizzo, carica, istituzione, nazione, lingua, note, stato attivo/non attivo, priorita', dati mancanti;
- associazione molti-a-molti tra contatti e gruppi;
- associazione molti-a-molti tra contatti e riferimenti interni;
- viste separate per contatti attivi, contatti non attivi e contatti con dati mancanti;
- CRUD gruppi/categorie, con rinomina e disattivazione logica;
- CRUD riferimenti interni;
- CRUD eventi semplici, senza segmenti obbligatori;
- creazione lista invitati per evento con filtri base: gruppo, riferimento, stato contatto, priorita', dati mancanti;
- filtro per evento passato e stato risposta passato come estensione MVP se tecnicamente semplice, altrimenti milestone immediatamente successiva;
- gestione manuale stato invito/risposta: da invitare, invitato, partecipera', non partecipera', forse, nessuna risposta;
- registrazione manuale del proponente/riferimento che ha suggerito l'invito;
- dashboard base per eventi futuri/attivi e conteggi risposte;
- export/stampa semplice di liste contatti e liste evento;
- audit minimo delle modifiche principali: chi, quando, tabella, record, tipo modifica.

Non entra nell'MVP:

- invio email robusto in produzione con batch/retry;
- link pubblico automatico per le risposte;
- allegati email;
- workflow completo di validazione liste da parte dei riferimenti;
- segmenti evento complessi;
- QR code e check-in;
- alert intelligenti;
- deduplica avanzata;
- modellazione completa persona/carica/istituzione.

## 5. Funzionalita' post-MVP

Le funzioni successive vanno introdotte dopo avere validato l'MVP con dati reali e flussi manuali.

- **Risposta automatica via link email**: pulsanti sicuri per registrare partecipo/non partecipo/forse o scelta segmento.
- **Invio email robusto**: provider da scegliere, invio a batch, code, retry, logging, gestione errori e reinvio.
- **Template email avanzati**: variabili, formule personalizzate, versioni dei template, anteprima e test.
- **Allegati**: gestione file associati a inviti o eventi.
- **Workflow riferimenti**: invio lista potenziale a riferimenti, conferma, esclusione, proposta nuovi contatti e aggiornamento dati.
- **Segmenti evento**: liturgia, ricevimento, combinazioni e risposte per segmento.
- **QR code e check-in**: carta d'ingresso, scansione, registrazione presenza e report presenze.
- **Alert contatti importanti**: avvisi su persone invitate spesso o considerate prioritarie ma escluse da un nuovo evento.
- **Deduplica**: rilevamento contatti simili per email, nome, istituzione, carica o telefono.
- **Storico avanzato persona/carica/istituzione**: separazione piu' precisa tra individuo, ruolo e ufficio.
- **Reportistica avanzata**: analisi per gruppo, riferimento, evento, trend risposte e partecipazioni.
- **Import Excel/CSV**: import guidato con validazione, anteprima e deduplica.
- **Integrazione email/Gmail/provider**: da valutare in base al canale reale di invio e ricezione.
- **Notifiche**: promemoria su dati mancanti, risposte non arrivate, invii falliti o liste da validare.

## 6. Ipotesi di modello dati

Questa e' una bozza concettuale. Non contiene migration SQL e andra' raffinata prima della prima migration.

| Tabella | Scopo | Campi principali | Relazioni | Fase | Dubbi |
| --- | --- | --- | --- | --- | --- |
| `profiles` | Profilo applicativo collegato a Supabase Auth | `id`, `auth_user_id`, `name`, `email`, `role`, `active` | collega utente auth a ruolo | MVP | definire se ruoli multipli o singolo ruolo |
| `contacts` | Versione corrente del contatto/invitato | nome, cognome, email, telefono, indirizzo, carica, istituzione, nazione, lingua, note, stato, priorita' | gruppi, riferimenti, inviti | MVP | separazione persona/carica rimandata o parziale |
| `contact_versions` | Storico dati contatto | `contact_id`, snapshot dati, autore, data, motivo | molti a uno con contatti | MVP minimo | decidere granularita' storico |
| `organizations` | Enti, istituzioni, ambasciate, uffici | nome, tipo, indirizzo, paese, note | contatti e cariche | Post-MVP o MVP leggero | quanto normalizzare subito |
| `positions` | Cariche istituzionali ricorrenti | titolo, organizzazione, dati ufficio, attiva | contatti/persona | Post-MVP | utile per ministri e ruoli che cambiano persona |
| `groups` | Gruppi/categorie flessibili | nome, descrizione, attivo | contatti | MVP | prevedere merge/rinomina senza perdere storico |
| `contact_groups` | Associazione contatti-gruppi | `contact_id`, `group_id`, date, note | molti-a-molti | MVP | storico assegnazioni da confermare |
| `internal_references` | Riferimenti interni organizzativi | `profile_id`, nome, email, attivo | contatti, proposte | MVP | possibile unificarla con `profiles` |
| `contact_references` | Associazione contatti-riferimenti | `contact_id`, `reference_id`, ruolo, note | molti-a-molti | MVP | gestire riferimento principale? |
| `events` | Eventi | titolo, descrizione, date, orari, luogo, stato, note | inviti, segmenti | MVP | definire stati definitivi |
| `event_segments` | Segmenti di evento | `event_id`, nome, data/ora, luogo | inviti/risposte/check-in | Post-MVP | forse introdurla presto per Festa della Comunita' |
| `event_invitations` | Lista invitati per evento | `event_id`, `contact_id`, stato invito, stato risposta, proponente, note | evento, contatto, risposta | MVP | separare invito da risposta in MVP? |
| `invitation_proposals` | Proposte dei riferimenti | evento, contatto, riferimento, decisione, note | evento, riferimento | Post-MVP | workflow e stati da definire |
| `invitation_responses` | Storico risposte | invito, risposta, canale, data, token, note | invito | Post-MVP, manuale in MVP se semplice | stati risposta definitivi |
| `email_templates` | Template inviti/comunicazioni | nome, oggetto, corpo, variabili, attivo | email log/eventi | Post-MVP | provider e editor da scegliere |
| `email_logs` | Log invii email | destinatario, invito, template, stato, errore, provider id | inviti | Post-MVP | necessario per batch/retry |
| `checkins` | Presenze e QR code | invito, segmento, data/ora, operatore, note | inviti/segmenti | Post-MVP | flusso ingresso da progettare |
| `attachments` | Allegati email/eventi | nome file, storage path, tipo, evento/template | eventi/email | Post-MVP | storage e permessi |
| `audit_logs` | Audit generale | tabella, record, azione, prima/dopo, autore, data | tutte le entita' | MVP minimo | evitare log troppo pesanti |

Per l'MVP si puo' tenere `contacts` come record corrente e `contact_versions`/`audit_logs` come storico. La separazione piena tra persona fisica, carica e istituzione va prevista nel design, ma puo' essere implementata con gradualita' per evitare sovraingegnerizzazione iniziale.

## 7. Sicurezza, permessi e RLS Supabase

La sicurezza deve essere progettata dall'inizio, perche' l'app gestisce dati personali, recapiti e informazioni istituzionali.

- usare Supabase Auth per autenticazione;
- creare una tabella `profiles` collegata agli utenti auth;
- gestire ruoli applicativi almeno `manager` e `reference`;
- abilitare Row Level Security sulle tabelle sensibili;
- il manager puo' leggere e modificare tutti i dati operativi;
- il riferimento puo' vedere solo i contatti associati e le funzioni pertinenti;
- proteggere pagine e layout lato server, non solo lato client;
- proteggere server actions/API routes con controllo ruolo;
- consentire la gestione di utenti e ruoli solo ai manager, tramite operazioni server-side;
- impedire che un manager disattivi o declassi accidentalmente l'ultimo manager attivo;
- usare la service role key solo lato server e mai nel client;
- conservare segreti solo in variabili d'ambiente;
- non stampare segreti nei log;
- tracciare modifiche critiche con audit log;
- valutare log accessi per operazioni sensibili;
- prevedere principi GDPR: minimizzazione dati, diritto di rettifica, accesso controllato, retention da definire;
- distinguere dati pubblicabili/stampabili da dati interni;
- verificare le policy RLS con test dedicati per manager e riferimento.

## 8. Milestone operative

### Milestone 1 - Setup repository e progetto

- **Obiettivo**: inizializzare repository e progetto Next.js 16.
- **Scope**: Next.js App Router, React 19, TypeScript, Tailwind CSS 4, convenzioni cartelle, `.env.example`, `.gitignore`, `.vercelignore`.
- **Output atteso**: app avviabile localmente con struttura pulita.
- **Criteri di accettazione**: dev server funzionante, build base riuscita, repo Git inizializzata.
- **Verifiche tecniche**: `git status`, TypeScript, lint, build.
- **Rischi**: mismatch versioni Next/React/Tailwind.
- **Decisioni aperte**: nome definitivo app e convenzioni UI.

### Milestone 2 - Ambiente, Supabase e variabili

- **Obiettivo**: collegare app e Supabase senza modifiche dati rischiose.
- **Scope**: Supabase URL, anon key, service role lato server, ambienti locale/preview/produzione.
- **Output atteso**: connessione documentata e variabili configurate.
- **Criteri di accettazione**: client server e client browser configurati correttamente.
- **Verifiche tecniche**: controllo env, build senza segreti nel bundle, nessuna chiave service role client-side.
- **Rischi**: credenziali mancanti, progetto Supabase non accessibile.
- **Decisioni aperte**: staging separato o solo preview Vercel.

### Milestone 3 - Modellazione database MVP

- **Obiettivo**: creare schema dati iniziale.
- **Scope**: profiles, contacts, groups, contact_groups, internal_references, contact_references, events, event_invitations, audit minimo.
- **Output atteso**: migration controllate e applicabili.
- **Criteri di accettazione**: schema coerente, relazioni molti-a-molti funzionanti, vincoli principali.
- **Verifiche tecniche**: review migration, applicazione locale/staging, test query base.
- **Rischi**: normalizzazione insufficiente o eccessiva.
- **Decisioni aperte**: livello iniziale di separazione persona/carica/istituzione.

### Milestone 4 - Autenticazione, profili e ruoli

- **Stato**: completata il 2026-06-04.
- **Obiettivo**: accesso protetto per manager e riferimenti.
- **Scope**: interfaccia `/login` con inserimento email e feedback di invio/errore; richiesta e invio magic link; callback e sessione; profili, ruoli e navigazione condizionata; provisioning iniziale del primo manager tramite comando amministrativo.
- **Output atteso**: il primo manager provisionato puo' usare l'interfaccia di login e accedere alla dashboard; gli utenti autenticati vedono viste coerenti al ruolo.
- **Criteri di accettazione**: la pagina di login e' utilizzabile su desktop e mobile; solo email autorizzate e attive possono richiedere il magic link; il primo manager completa login e callback; manager vede tutto, riferimento vede solo cio' che gli compete.
- **Verifiche tecniche**: test manuale completo del primo login manager, inclusi richiesta magic link, ricezione email, callback, sessione, dashboard e logout; tentativo con email non autorizzata; test con utenti diversi; test RLS.
- **Rischi**: permessi troppo larghi.
- **Decisioni adottate**: magic link senza password; nessun selettore ruolo al login; accesso consentito solo a profili pre-autorizzati; provisioning utenti tramite comando amministrativo.
- **Stato produzione**: dominio operativo `https://archivio-segreteria.segidio.org`; `APP_URL` Production configurata sul dominio custom; repository pubblica ufficiale unica `giovaniperlapace/segreteria-segidio`, collegata a Vercel sul branch Production `main` con deploy automatico verificato.

### Milestone 5 - Gestione utenti e ruoli da interfaccia manager

- **Stato**: implementata e verificata tecnicamente il 2026-06-04; resta il collaudo operativo con la creazione e il primo login di utenti reali.
- **Obiettivo**: rendere autonoma e sicura l'amministrazione degli accessi applicativi dopo il provisioning iniziale.
- **Scope**: pagina riservata ai manager con elenco utenti; creazione/invito di utenti autorizzati; assegnazione e modifica del ruolo `manager` o `reference`; collegamento del profilo reference al relativo riferimento interno; attivazione/disattivazione accesso.
- **Output atteso**: un manager puo' gestire gli utenti autorizzati senza usare il comando amministrativo, che resta disponibile come strumento di emergenza/bootstrap.
- **Criteri di accettazione**: il primo manager effettua il login tramite l'interfaccia realizzata nella Milestone 4 e accede alla gestione utenti; solo i manager accedono alla pagina e alle operazioni; un nuovo utente creato dal manager puo' ricevere il magic link e accedere con il ruolo assegnato; un utente disattivato non puo' richiedere nuovi magic link; non e' possibile rimuovere o disattivare l'ultimo manager attivo.
- **Verifiche tecniche**: test end-to-end dal login del primo manager alla creazione di un secondo manager e di un reference, seguito dal loro primo login; controlli ruolo lato server; uso della service role solo lato server; validazione email e ruoli; test cambio ruolo, collegamento riferimento, disattivazione e tentativi da utente reference; audit delle modifiche ai profili.
- **Rischi**: escalation di privilegi, account duplicati, perdita dell'ultimo accesso manager, disallineamento tra profilo applicativo e utente Supabase Auth.
- **Decisioni adottate**: la creazione autorizza l'utente, che richiede poi il magic link dalla pagina di login; gli utenti vengono disattivati senza cancellazione definitiva; l'email non e' modificabile dall'interfaccia per evitare disallineamenti con Supabase Auth; un profilo reference puo' essere collegato a un riferimento esistente oppure crearne uno automaticamente.
- **Evoluzione adottata**: nome e cognome dei profili sono salvati separatamente per consentire comunicazioni personalizzate usando soltanto il nome; `full_name` resta sincronizzato per compatibilita' con audit e codice storico.
- **Collaudo operativo residuo**: creare dall'interfaccia almeno un manager e un reference reali, quindi verificare il loro primo login e la visibilita' coerente al ruolo.

### Milestone 6 - CRUD contatti, gruppi e riferimenti

- **Obiettivo**: costruire l'archivio operativo.
- **Scope**: contatti, gruppi, riferimenti, associazioni, attivo/non attivo, dati mancanti.
- **Output atteso**: archivio filtrabile e modificabile.
- **Criteri di accettazione**: creazione/modifica contatto, associazione a piu' gruppi e riferimenti, filtri base.
- **Verifiche tecniche**: validazione form, permessi, responsive UI.
- **Rischi**: campi obbligatori non chiari.
- **Decisioni aperte**: elenco definitivo campi obbligatori e priorita'.

### Milestone 7 - Import contatti dal vecchio Access

- **Obiettivo**: portare nel nuovo archivio i dati reali di contatti, gruppi e referenti interni senza perdere relazioni utili.
- **Stato 2026-06-05**: completata sul database self-hosted.
- **Scope**: esportazione dal database dati reale `old_software/DbSegreteria2.mdb`, revisione CSV, import di contatti/invitati da `Persone`, gruppi da `Gruppi`, relazioni contatto-gruppo derivate da `Persone.IdGruppo`, referenti interni derivati da `Persone.Contatti` e relazioni contatto-referente.
- **Output atteso**: archivio popolato con i contatti legacy e relazioni verificabili nella nuova app.
- **Criteri di accettazione**: `contacts.legacy_access_id` valorizzato e univoco, conteggi coerenti con l'export, nessun dato operativo/evento importato come campo contatto, referenti interni creati da valori distinti di `Contatto`, relazioni preservate in `contact_references`.
- **Verifiche tecniche**: eseguire `scripts/export_legacy_access_contacts.py`, controllare CSV generati in `old_software/export/`, importare in transazione o con script idempotente, confrontare conteggi, testare filtri per gruppo e referente, verificare RLS manager/riferimento sui dati importati.
- **Esito import corretto**: il primo import da `Segreteria2.mdb`/`EXPO2000` era basato su una tabella evento non valida ed e' stato sostituito il 2026-06-05. Il database operativo e' stato ripopolato da `DbSegreteria2.mdb` con 12.956 contatti, 54 gruppi, 12.946 relazioni contatto-gruppo, 297 referenti interni e 13.439 relazioni contatto-referente. I valori `Persone.Contatti` con virgole sono stati splittati in referenti distinti; i punti interrogativi nei nomi referente sono stati rimossi; `Attivo = N/n` e' importato come stato interno `standby`, mostrato nell'app come "Non attivo". Lingue e paesi sono normalizzati solo per alias certi, con `UE`, `SMOM`, `OLP`, `ONU`, `Jugoslavia`, `Polisario` conservati per revisione.
- **Rischi**: duplicati storici, valori sporchi nei referenti, campi obbligatori mancanti, email/telefoni non normalizzati, import ripetuto accidentalmente.
- **Decisioni aperte**: trattamento contatti senza nome/cognome ma con recapito o istituzione, eventuale import separato dello storico inviti Access, revisione manuale dei valori paese non normalizzati.

### Milestone 8 - Storicizzazione minima e audit

- **Obiettivo**: non perdere modifiche importanti.
- **Stato 2026-06-06**: implementata e verificata tecnicamente.
- **Scope**: snapshot contatto o audit log su modifica, autore, data, prima/dopo.
- **Output atteso**: storico consultabile almeno dal manager.
- **Criteri di accettazione**: ogni modifica contatto registra chi/quando/cosa.
- **Verifiche tecniche**: test modifica e recupero storico.
- **Esito**: aggiunta pagina manager `/dashboard/audit` con versioni contatto e audit generale; aggiunto link storico dalla scheda contatto e card dashboard; aggiornata la funzione trigger per attribuire l'autore anche quando le scritture server-side usano la service role; migration applicata al database self-hosted con smoke test in transazione e rollback.
- **Rischi**: audit troppo pesante o incompleto.
- **Decisioni aperte**: possibilita' di ripristino versione precedente gia' in MVP o post-MVP.

### Milestone 9 - CRUD eventi

- **Obiettivo**: creare e gestire eventi semplici.
- **Scope**: titolo, descrizione, date, orari, luogo, note, stato.
- **Output atteso**: lista eventi futuri/attivi/conclusi.
- **Criteri di accettazione**: evento creabile, modificabile, archiviabile.
- **Verifiche tecniche**: validazione date e stati.
- **Rischi**: segmenti evento anticipati troppo presto.
- **Decisioni aperte**: stati definitivi evento.

### Milestone 10 - Lista invitati con filtri base

- **Obiettivo**: ridurre selezione manuale nome per nome.
- **Scope**: selezione contatti per gruppo, riferimento, stato, priorita', dati mancanti; aggiunta massiva a evento.
- **Output atteso**: lista invitati evento costruibile da filtri.
- **Criteri di accettazione**: il manager puo' filtrare, selezionare, aggiungere e rimuovere invitati.
- **Verifiche tecniche**: test combinazioni filtro, no duplicati nello stesso evento.
- **Rischi**: query complesse e UX confusa.
- **Decisioni aperte**: includere subito filtro per evento passato.

### Milestone 11 - Gestione manuale inviti e risposte

- **Obiettivo**: tracciare stato invito e risposta senza automazione email.
- **Scope**: stati invito/risposta, note, proponente, inserimento manuale risposte.
- **Output atteso**: situazione evento sempre aggiornata.
- **Criteri di accettazione**: conteggi corretti per invitati, si', no, forse, nessuna risposta.
- **Verifiche tecniche**: test dashboard e filtri su risposta.
- **Rischi**: stati non allineati al processo reale.
- **Decisioni aperte**: nomenclatura stati risposta.

### Milestone 12 - Dashboard MVP

- **Obiettivo**: dare visione operativa immediata.
- **Scope**: eventi attivi/futuri, conteggi inviti/risposte, dati mancanti, non attivi.
- **Output atteso**: dashboard manager e vista sintetica riferimento.
- **Criteri di accettazione**: numeri coerenti con le liste.
- **Verifiche tecniche**: test query e casi vuoti.
- **Rischi**: dashboard troppo ricca per MVP.
- **Decisioni aperte**: metriche prioritarie.

### Milestone 13 - Export e stampe base

- **Obiettivo**: supportare lavoro offline e condivisione liste.
- **Scope**: export CSV/PDF o stampa browser di contatti, liste evento, risposte.
- **Output atteso**: liste con nome, cognome, carica, gruppo, riferimento, email presente/mancante, telefono presente/mancante.
- **Criteri di accettazione**: export leggibile e filtrato correttamente.
- **Verifiche tecniche**: test su categorie, riferimenti e risposte.
- **Rischi**: formato stampa non adatto agli usi reali.
- **Decisioni aperte**: PDF, CSV, Excel o stampa HTML come priorita'.

### Milestone 14 - Hardening, test, build, deploy

- **Obiettivo**: rendere l'MVP usabile in modo affidabile.
- **Scope**: test, error handling, permessi, build, deploy Vercel, checklist privacy.
- **Output atteso**: MVP deployato e verificato.
- **Criteri di accettazione**: build pulita, RLS testata, flussi principali funzionanti.
- **Verifiche tecniche**: TypeScript, lint, build, test manuali, test RLS, controllo bundle.
- **Rischi**: differenze tra locale e produzione.
- **Decisioni aperte**: dominio e ambiente di staging.

### Milestone 15 - Post-MVP email robuste e template

- **Obiettivo**: inviare comunicazioni dall'app in modo affidabile.
- **Scope**: provider email, template, batch, retry, logging, reinvio.
- **Output atteso**: invii tracciati e gestibili.
- **Criteri di accettazione**: invio a liste grandi senza blocchi, log errori chiaro.
- **Verifiche tecniche**: test sandbox provider, limiti rate, retry.
- **Rischi**: deliverability, limiti provider, gestione allegati.
- **Decisioni aperte**: provider email.

### Milestone 16 - Post-MVP risposte via link pubblico

- **Obiettivo**: registrare risposte direttamente dal destinatario.
- **Scope**: token sicuri, pagina pubblica, scadenza, storico risposte.
- **Output atteso**: click email aggiorna database.
- **Criteri di accettazione**: risposta corretta, token non riusabile impropriamente, modifica gestita.
- **Verifiche tecniche**: test sicurezza link e casi scaduti.
- **Rischi**: privacy e link inoltrati.
- **Decisioni aperte**: opzioni risposta definitive.

### Milestone 17 - Post-MVP workflow riferimenti

- **Obiettivo**: sostituire verifica cartacea con flusso digitale.
- **Scope**: liste proposte, conferma/esclusione, note, nuovi contatti, aggiornamenti dati.
- **Output atteso**: manager consolida liste validate dai riferimenti.
- **Criteri di accettazione**: riferimento vede solo i propri contatti e restituisce decisioni.
- **Verifiche tecniche**: permessi e audit.
- **Rischi**: processo organizzativo non definito.
- **Decisioni aperte**: stati proposta e responsabilita' finale.

### Milestone 18 - Post-MVP segmenti, QR code e check-in

- **Obiettivo**: gestire eventi complessi e presenze reali.
- **Scope**: segmenti, scelta segmento, QR code, scansione, check-in.
- **Output atteso**: presenza registrabile per segmento.
- **Criteri di accettazione**: QR identifica invito corretto e aggiorna presenza.
- **Verifiche tecniche**: test scansione, duplicati, offline/connessione.
- **Rischi**: gestione operativa all'ingresso.
- **Decisioni aperte**: dispositivi e processo check-in.

### Milestone 19 - Post-MVP alert, deduplica e reportistica avanzata

- **Obiettivo**: prevenire dimenticanze e migliorare qualita' dati.
- **Scope**: contatti importanti, inviti ricorrenti, deduplica, report evoluti.
- **Output atteso**: suggerimenti e controlli intelligenti.
- **Criteri di accettazione**: alert motivati da dati chiari e non invasivi.
- **Verifiche tecniche**: test su dataset storico.
- **Rischi**: falsi positivi e regole opache.
- **Decisioni aperte**: criteri di importanza e similarita' eventi.

## 9. Guardrails tecnici

- Non modificare schema database senza migration.
- Applicare le migration `.sql` necessarie e non distruttive dopo review.
- Non applicare migration distruttive senza conferma.
- Non committare chiavi, password, token o file `.env`.
- Non usare la service role key nel client.
- Non bypassare RLS per comodita'.
- Non usare `any` in TypeScript se evitabile.
- Non introdurre librerie pesanti senza motivazione.
- Non fare refactor estesi non richiesti.
- Non mescolare modifiche di UI, schema e logica in un unico blocco se separabili.
- Prima di ogni milestone controllare stato repo.
- Dopo ogni milestone eseguire controlli tecnici.
- Produrre diff comprensibili e reviewabili.
- Fermarsi e chiedere se emergono credenziali mancanti, conflitti o decisioni di prodotto bloccanti.
- Tenere separati ambiente locale, preview/staging e produzione.
- Non toccare produzione per operazioni distruttive, deploy o modifiche fuori scope senza conferma esplicita.
- Documentare ogni variabile d'ambiente in `.env.example`.
- Verificare che i dati personali siano accessibili solo ai ruoli autorizzati.

## 10. Strategia di verifica

Ogni blocco deve avere una verifica proporzionata al rischio.

- **TypeScript check**: obbligatorio dopo modifiche applicative.
- **Lint**: obbligatorio per mantenere qualita' e coerenza.
- **Build**: obbligatoria prima di deploy e dopo milestone rilevanti.
- **Test unitari**: utili per funzioni di filtro, stati, permessi e formattazione dati.
- **Test manuali**: necessari sui flussi principali manager/riferimento.
- **Test RLS**: obbligatori per verificare che il riferimento non veda dati non associati.
- **Verifica migration**: review prima dell'applicazione, test su ambiente non produttivo.
- **Verifica accessi**: interfaccia login, richiesta e ricezione magic link, callback, sessione, dashboard, logout, email non autorizzata, login manager, login riferimento e utente disattivato.
- **Verifica amministrazione utenti**: flusso end-to-end dal login del primo manager alla creazione e al primo login di un secondo manager e di un reference; cambio ruolo, collegamento riferimento, disattivazione, protezione ultimo manager e tentativi senza permesso.
- **Verifica dati seed**: dataset minimo con gruppi, riferimenti, contatti, eventi e inviti.
- **Controllo responsive UI**: desktop e mobile/tablet per dashboard e liste.
- **Controllo error handling**: form invalidi, dati mancanti, rete assente, permessi insufficienti.
- **Checklist pre-commit**: `git status`, diff, test pertinenti, nessun segreto, messaggio commit descrittivo.

## 11. Domande aperte

- Quale provider email usare per inviti e comunicazioni successive?
- Gli invii devono partire da un indirizzo istituzionale gia' esistente?
- Come gestire allegati: caricamento nell'app, file da template o allegati manuali per evento?
- Quali stati risposta definitivi usare: si/no/forse, accompagnatori, segmenti, note?
- Quali campi contatto sono davvero obbligatori nell'MVP?
- Come distinguere nel primo schema persona fisica, carica e istituzione senza rendere il sistema troppo complesso?
- Il ripristino di versioni precedenti deve essere disponibile gia' nell'MVP o solo consultazione storico?
- Oltre a manager e riferimento servono altri ruoli, per esempio operatore check-in o sola lettura?
- Quali regole di pulizia e deduplica applicare all'import dal vecchio Access?
- Quale formato e' prioritario per le stampe/export: CSV, Excel, PDF o stampa HTML?
- Serve un ambiente di staging separato dalla preview Vercel?
- Dominio di produzione adottato: `https://archivio-segreteria.segidio.org`.
- Quali policy GDPR/data retention adottare per contatti non piu' attivi?
- Come definire un "contatto importante" per gli alert?
- Come classificare eventi simili per suggerire persone spesso invitate?
- Il workflow dei riferimenti deve essere obbligatorio o facoltativo per ogni evento?
- I riferimenti possono modificare direttamente i contatti o solo proporre modifiche da approvare?
- I segmenti evento sono necessari subito per casi come la Festa della Comunita' o possono attendere il post-MVP?

## 12. Primo blocco operativo consigliato

Il prossimo blocco operativo dovrebbe avviare la **Milestone 8: Storicizzazione minima e audit**.

Prima di iniziare conviene confermare:

- quali modifiche contatto devono essere visibili nello storico operativo;
- se lo storico deve essere solo consultabile o anche ripristinabile;
- quali schermate devono mostrare audit e autore della modifica;
- se il collaudo reference post-import va completato prima o insieme alla Milestone 8.

Output atteso del prossimo blocco: storico/audit leggibile per le modifiche principali e verifica operativa con almeno un utente reference reale.
