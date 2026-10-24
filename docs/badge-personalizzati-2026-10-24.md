# Badge personalizzati nelle email evento

Implementazione del 24 ottobre 2026. Commit, push e deploy in produzione autorizzati dall’utente il 24 ottobre.

## Utilizzo

Nel pannello Email inviti scegliere i destinatari e caricare il JPG nel riquadro Badge personalizzato. L’anteprima segnaposti funziona anche prima di scegliere i destinatari. I cursori regolano separatamente posizione orizzontale/verticale di nome e cognome e dimensione del testo; un clic sull’immagine riposiziona il campo selezionato.

“Mostra primo destinatario” usa il primo indirizzo valido della selezione, nell’ordine ID invito, con i dati del delegato quando è il destinatario effettivo. “Validare” abilita la preparazione con badge. Cambiamenti al file, posizioni o destinatari richiedono una nuova validazione. Il server verifica inoltre una firma legata a immagine, posizioni e lista completa dei nomi/indirizzi, rilevando modifiche avvenute nel database dopo l’anteprima.

“Prepara invio” genera un JPG distinto per destinatario. Non invia email. Il flusso di invio e retry già esistente allega la copia salvata. “Vedi testo” permette di visualizzare/scaricare il badge del singolo messaggio. “Rimuovi badge” torna al normale invio con soli allegati comuni.

## Rendering e limiti

Modello di riferimento: JPG 800 × 1205 fornito dall’utente, nome centrato al 50%/87% e cognome al 50%/93%; carattere iniziale 5% della larghezza. Font Noto Sans distribuito con licenza OFL per mantenere il rendering coerente. Il renderer Sharp è una dipendenza esplicita alla versione già presente in Next.js (0.34.5).

JPG massimo 4 MiB, massimo 24 milioni di pixel in ingresso; orientamento EXIF applicato, ridimensionamento massimo 1600 × 2400 senza ingrandimento. I nomi lunghi vengono ridotti per rientrare nell’immagine. Nome e cognome mancanti bloccano la preparazione. Massimo totale 6 MiB di allegati per messaggio, badge incluso. I badge vengono generati durante la preparazione: liste grandi richiedono più tempo e spazio rispetto a un allegato comune.

## Dati, permessi e archivio

Migration additiva `20261024170000_personalized_badges.sql`: colonna JSONB nullable `email_logs.personalized_badge` con nome file, MIME, dimensione e byte base64. I log precedenti restano invariati. Le policy manager e RLS della tabella restano attive. Anteprime e lettura del badge salvato richiedono `requireManager`.

Il badge è uno snapshot immutato dal flusso applicativo: modifiche successive a contatti/delegati non alterano un batch già preparato. La ricostruzione dei MIME Postmark troncati include i byte esatti del badge del singolo log.

Migration verificata con record validi/invalidi su database temporaneo separato, poi applicata al database condiviso. Verificati colonna e policy `is_manager`; database temporaneo rimosso. Nessun batch di prova reale preparato, nessuna email evento inviata.

Verificato il servizio Hetzner `segidio-email-archive.service`: il timer richiama tramite `run.py` l’endpoint pubblico `/api/email-archive`, quindi usa automaticamente il codice aggiornato dal deploy Vercel. Non esiste una copia separata del worker da aggiornare. La ricostruzione archivio riusa i byte del badge salvato e non richiede Sharp. I font sono inclusi nel tracing Next.js. Nessun nuovo segreto o variabile d’ambiente.

## Verifiche

- Lint, TypeScript e build Next.js.
- `node scripts/tests/personalized-badge.mjs`: JPG, accenti, nomi lunghi, dati mancanti, prova firmata, rendering deterministico e ricostruzione archivio.
- `node scripts/tests/postmark-batch.mjs`: anteprima senza scritture, permessi, delegati, invalidazione per nomi modificati, badge distinti e identici byte al retry, oltre alle regressioni invio esistenti.
- `node scripts/tests/email-batch-test.mjs` e `node scripts/tests/email-sent-archive.mjs`: regressioni di invio prova e archivio. Le modifiche preesistenti nel test archivio sono state conservate.
- Anteprima generata dal JPG dell’utente e controllata visivamente. Accesso manager e presenza del nuovo pannello verificati su localhost; il selettore file nativo non ha completato il caricamento tramite automazione, quindi il collaudo interattivo completo resta da effettuare.
