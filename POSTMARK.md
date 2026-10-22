# Postmark — Segreteria Segidio

## Configurazione del 9 ottobre 2026

Server dedicato `Segreteria Segidio`, ID `21096792`:
https://account.postmarkapp.com/servers/21096792/streams

- `outbound`: magic link, notifiche ai manager, prove richieste dal manager.
- `broadcast`: inviti e comunicazioni evento, con disiscrizione gestita da Postmark.
- Mittente e Reply-To: `segreteriagenerale@santegidio.org`.
- Aperture e tracking dei link disattivati sia sul server sia nelle richieste API.
- `santegidio.org` già verificato: DKIM `20260912140751pm._domainkey`, Return-Path `pm-bounces` CNAME `pm.mtasv.net`, DMARC `p=reject`. Non cambiare MX o SPF principale per questa integrazione.

Variabili server in `.env.example`: `POSTMARK_SERVER_TOKEN`, `POSTMARK_TRANSACTIONAL_STREAM`, `POSTMARK_BROADCAST_STREAM`, `EMAIL_FROM`, `EMAIL_REPLY_TO`. Il token deve appartenere al server dedicato, non al server di iscrizioni-pace. Non pubblicarlo e non usare prefissi `NEXT_PUBLIC_`. La configurazione locale è in `.env.local` gitignored, permessi 600. Le cinque variabili Postmark sono state configurate su Vercel in Production, Development e Preview il 9 ottobre 2026, sul progetto `giovaniperlapaces-projects/segreteria-segidio`. Commit, push e deploy sono stati autorizzati dall’utente. I deployment precedenti mantengono le proprie variabili: verificare che il dominio punti al nuovo deployment dopo il rilascio.

## Comportamento

Nessun fallback Gmail: le API HTTP Postmark eliminano la dipendenza dalle quote SMTP Gmail. Restano le quote del piano e i limiti Postmark. I link continuano a essere generati da Supabase; GET/HEAD di `/auth/callback` mostrano una conferma e non consumano il token. Solo il POST della conferma, dalla stessa origine, verifica il link e imposta la sessione.

La coda applicativa mantiene blocchi di 25 indirizzi e la prosecuzione dalla pagina aperta con pausa di 5 secondi. Non è un worker in background: chiudere la pagina ferma i blocchi successivi. Il trasporto usa `/email/batch`, divide anche per dimensione (10 MB prudenziali per richiesta, massimo 500 messaggi) e analizza ogni risultato individuale. Allegati fino a 6 MiB complessivi; controllo aggiuntivo del messaggio codificato a 9.000.000 byte. La pagina evento ammette 300 secondi per completare azioni con allegati su Vercel.

Ogni indirizzo del contatto ha una riga separata, con deduplicazione degli indirizzi dello stesso contatto. Contatti diversi che condividono un indirizzo mantengono inviti personali distinti. I contatori del batch contano indirizzi, non persone. I batch storici non vengono riscritti. Al momento del controllo precedente all'integrazione non esistevano righe queued/failed/sending. Eventuali vecchie righe multi-indirizzo ancora da inviare vengono rifiutate dal trasporto: ricreare il batch, senza reinviare messaggi già consegnati.

Le risposte `406` (destinatario soppresso) diventano `skipped` e non entrano nei retry. La disiscrizione riguarda solo il flusso broadcast: non disabilita i magic link transazionali. Hard bounce, spam complaint e disiscrizioni sono gestiti da Postmark; non vengono riattivati automaticamente. La gestione locale dei contatti non viene modificata da un webhook in questa fase.

Un lock condizionale sul batch e un claim condizionale su ogni riga impediscono doppio invio tra richieste concorrenti. Un risultato con MessageID viene salvato prima di aggiornare l'invito. `sent` significa accettato dal provider, non prova di consegna in inbox. Il pulsante Retry non include righe già accettate.

Rate limit e manutenzione fermano la prosecuzione automatica; il server applica una pausa di almeno 60 secondi e rispetta Retry-After fino a 24 ore. Dopo la pausa il manager può ritentare. Token/permessi errati richiedono correzione prima del retry. Non ci sono retry automatici di richieste con esito sconosciuto.

## Esiti incerti e interruzioni

Timeout, risposta incompleta, HTTP 5xx ambiguo o mancato salvataggio dopo accettazione lasciano la riga `sending`, e il batch viene bloccato per verifica. Anche l'interruzione del processo dopo un claim resta bloccata: si privilegia evitare un duplicato rispetto al reinvio automatico. Non azzerare questi stati alla cieca.

Controllare l'attività del server Postmark usando i metadati `email_log_id`, `batch_id` ed `event_id` e l'orario del tentativo. Se il provider ha accettato, riconciliare MessageID, stato sent e stato invito; rimettere in coda solo dopo evidenza che non è stato inviato. Non ricreare un intero batch incerto come scorciatoia. La riconciliazione è un'operazione amministrativa controllata, non è esposta come pulsante di reinvio.

## Verifiche

- `node scripts/tests/postmark.mjs`: payload, stream, privacy, limiti, batch parziali, suppression, cooldown ed esiti incerti, con fetch simulato.
- `node scripts/tests/postmark-batch.mjs`: autorizzazione, concorrenza, contatori oltre 1000, log per indirizzo, salvataggi falliti e retry, con database simulato.
- `node scripts/tests/magic-link-confirmation.mjs`: GET non consumante, POST, origine, escaping e redirect, senza token reali.
- `node scripts/tests/email-batch-test.mjs`: prova manager senza modificare batch o token degli invitati.
- TypeScript, lint e build Next.js.

Prove tecniche del 9 ottobre 2026 accettate dal server dedicato su entrambi i flussi, con allegato, esclusivamente verso `test@blackhole.postmarkapp.com`. Non sono prove di recapito presso Gmail/Outlook. Prima di un invio ampio usare un piccolo gruppo atteso e controllato, verificare gli esiti e rivedere gli indirizzi legacy non aggiornati. Nessun provider garantisce l'assenza di spam: autenticazione e separazione dei flussi vanno accompagnate da liste aggiornate e messaggi attesi.

Collaudo autenticazione locale completato con il profilo controllato: GET/HEAD non consumano il token, POST imposta i cookie e la dashboard risponde 200. Nessuna email di login inviata durante questa prova. La sola sessione di collaudo è stata chiusa. Verificata nel browser anche la gestione del link non valido. Build e controllo bundle senza segreti server completati.

## Archivio Posta inviata e riscontri — 22 ottobre 2026

Le comunicazioni evento accettate da Postmark accodano una copia tramite trigger
`email_logs_queue_archive`. La coda è indipendente dall'invio: nessun errore Gmail
rende reinviabile il messaggio. Magic link e notifiche transazionali sono esclusi.

Il worker scarica il MIME originale da Postmark (intestazioni, data, allegati e link
personalizzati), lo conserva in `email_sent_archives` e lo inserisce tramite IMAP
APPEND nella cartella Gmail identificata da `\Sent`. Non usa SMTP. La copia è segnata
come letta. Prima di ogni APPEND cerca il Message-ID originale e dopo lo rilegge:
interruzioni o salvataggi DB falliti si riconciliano senza aggiungere una nuova copia.
Il MIME conservato permette nuovi tentativi anche dopo la scadenza su Postmark.
Postmark tronca i dump MIME a 512 KiB. Il worker rifiuta questi sorgenti incompleti:
recupera i corpi completi verificati da Postmark e gli allegati del batch, verificando
nomi, numero e dimensioni. La copia così ricostruita conserva data e contenuti,
usa un Message-ID di archivio e registra l'ID originale in `X-Original-Message-ID`
con `X-Archive-Reconstructed`. Se le fonti non coincidono, l'archiviazione si ferma.
Non si inventano allegati o contenuti mancanti.

`EMAIL_SENT_ARCHIVE_ENABLED=true`, `GMAIL_USER=segreteriagenerale@santegidio.org`
e `GMAIL_APP_PASSWORD` attivano la funzione. L'identità della casella è vincolata al
mittente del progetto. Le credenziali IMAP sono già state verificate localmente.
Nessuna credenziale o contenuto originale viene scritto nei log applicativi.

Ogni blocco invii avvia un worker dopo la risposta HTTP, con massimo 25 copie.
I job hanno lease di 10 minuti, sessione IMAP limitata a 60 secondi e backoff
progressivo da 10 minuti a 24 ore. Un worker interrotto conserva il job recuperabile.
Per il recupero automatico quando la pagina è chiusa, configurare un timer ogni
5 minuti che chiami `POST https://archivio-segreteria.segidio.org/api/email-archive`
con `Authorization: Bearer <EMAIL_ARCHIVE_CRON_SECRET>`. Il segreto deve essere
casuale, lungo almeno 32 caratteri e conservato in un file protetto sul runner.
La richiesta può durare 300 secondi; non eseguire `curl -v` né stampare il segreto.
Il timer è una configurazione di rilascio, non è già attivo per il solo commit.

Gli esiti sono append-only in `email_delivery_events`. Configurare un webhook
Postmark sul flusso `broadcast`, URL `/api/postmark/events`, header
`X-Postmark-Webhook-Secret: <POSTMARK_WEBHOOK_SECRET>` (segreto distinto di almeno
32 caratteri). Abilitare Delivery, Bounce e SpamComplaint, senza IncludeContent;
lasciare Open e Click disattivati. La route risponde 200 solo dopo salvataggio;
503 conserva i retry Postmark. Sono gestiti duplicati, eventi fuori ordine e
notifiche arrivate prima del salvataggio dell'accettazione. La consegna indica
accettazione da parte del server destinatario, non lettura né arrivo in inbox.

Le due tabelle hanno RLS e nessun accesso anonimo/autenticato diretto. Le azioni
server manager espongono soltanto stato ed esiti; il MIME resta server-side.
Dalla finestra “Vedi testo” è possibile recuperare una copia storica e aggiornare
gli esiti. L'operazione non invia email e i recuperi storici sono contrassegnati.
La data originale rimane invariata; `created_at`/`archived_at` documentano il recupero.
Nessun recupero massivo del passato viene avviato automaticamente.

Utility amministrativa locale (non invia email):

```bash
node --env-file=.env.local scripts/email-archive.mjs --check
node --env-file=.env.local scripts/email-archive.mjs --run
node --env-file=.env.local scripts/email-archive.mjs --recover-log=123
```

Verifiche: `node scripts/tests/email-sent-archive.mjs`; la verifica SQL
`scripts/tests/email-sent-archive.sql` richiede un database isolato con la migration
applicata e una fixture minima `email_logs(id bigint primary key, status text,
provider_message_id text)`. Non eseguirla nel database operativo.

La migration additiva `20261022120000_email_sent_archive.sql` è stata verificata
in un database isolato e applicata al database condiviso il 22 ottobre 2026.
Rilascio in produzione autorizzato il 22 ottobre 2026: flag e segreti dedicati
su Vercel Production, webhook broadcast e timer permanente Hetzner
`segidio-email-archive.timer` ogni cinque minuti. Il worker automatico esclude
i recuperi storici (`recovered=true`), gestiti dal job dedicato o singolarmente.


### Recupero storico richiesto il 22 ottobre 2026

Perimetro: 9 ottobre ore 00:00 Europe/Rome fino al 22 ottobre ore 12:39:20.
219 comunicazioni evento Postmark, 75 notifiche automatiche di risposta agli inviti;
3 invii SMTP del periodo erano già presenti nella Posta inviata. Escluse due prove
Postmark blackhole. Nessun invio ai destinatari.

Il recupero ha rilevato dump troncati per gli inviti con due immagini allegate:
la ricostruzione è stata verificata confrontando gli hash SHA-256 degli allegati
letti da Gmail con i file originali del batch. Le copie incomplete del primo
passaggio vengono spostate nel Cestino solo dopo verifica della copia completa.

Gmail limita l'upload IMAP a 500 MB/giorno; il totale supera il limite. Il lavoro è
suddiviso in passaggi con budget conservativo. Sul server Hetzner è predisposto il
job temporaneo `segidio-archive-backfill.timer`: dal 23 ottobre, ogni giorno alle
12:00 UTC (14:00 a Roma il 23 ottobre), fino al completamento. Non è il timer
permanente dell'app. Dati operativi in `/root/segidio-backfill-20261022/report.json`;
il report registra la rilettura delle copie da Gmail. Al completamento il job
disabilita il proprio timer ed elimina il file temporaneo delle credenziali.
Il recupero storico resta separato dal rilascio dell'app in produzione.

Stato verificato il 22 ottobre alle 13:03 Europe/Rome: 122 comunicazioni evento
più 75 notifiche, totale 197 copie complete rilette nella Posta inviata; restano
97 comunicazioni accodate. Le 30 copie troncate prodotte nel primo passaggio sono
state rimosse dalla Posta inviata e spostate nel Cestino. Prossima esecuzione del
recupero verificata in systemd: 23 ottobre 2026, ore 12:00 UTC / 14:00 Europe/Rome.
Il totale comprende la copia già recuperata durante il collaudo iniziale.
