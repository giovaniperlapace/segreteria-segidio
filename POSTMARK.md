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
