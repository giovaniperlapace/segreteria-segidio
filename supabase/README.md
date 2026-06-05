# Supabase migrations

Questa cartella contiene le migration SQL del progetto.

## Stato Milestone 3

- `20260602163000_initial_mvp_schema.sql` definisce lo schema MVP iniziale.
- La migration include tabelle core, indici, trigger `updated_at`, storico contatti, audit log e RLS.
- `20260603090000_add_legacy_access_contact_fields.sql` aggiunge i campi anagrafici necessari per importare i contatti dal vecchio Access senza perdere informazioni utili.
- `20260603090000_add_legacy_access_contact_fields.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-03.
- `20260604120000_auth_profiles_hardening.sql` rende obbligatoria e univoca l'email dei profili autorizzati al magic link.
- `20260604120000_auth_profiles_hardening.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-04.
- `20260604180000_manager_user_administration.sql` aggiunge l'amministrazione atomica e auditata dei profili, protegge l'ultimo manager attivo e collega i profili reference ai riferimenti interni.
- `20260604180000_manager_user_administration.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-04.
- `20260605100000_split_profile_names.sql` separa nome e cognome dei profili, mantenendo `full_name` sincronizzato per compatibilita'.
- `20260605100000_split_profile_names.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260605120000_contact_language_settings.sql` aggiunge le lingue configurabili per il selettore contatti.
- `20260605120000_contact_language_settings.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260605130000_legacy_access_import_upsert.sql` aggiunge l'indice unico pieno su `contacts.legacy_access_id` richiesto dagli upsert PostgREST.
- `20260605130000_legacy_access_import_upsert.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260605140000_reference_user_conversion.sql` aggiorna l'RPC amministrativa per convertire un riferimento interno esistente in utente `reference` senza creare duplicati.
- `20260605140000_reference_user_conversion.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260605150000_split_internal_reference_names.sql` aggiunge `first_name` e `last_name` ai riferimenti interni, sincronizza `full_name` e normalizza i riferimenti legacy composti.
- `20260605150000_split_internal_reference_names.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260605151000_clean_trailing_comma_internal_references.sql` pulisce i riferimenti legacy con virgola finale non significativa.
- `20260605151000_clean_trailing_comma_internal_references.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260605152000_dedupe_internal_references_by_name.sql` deduplica riferimenti interni con lo stesso nome normalizzato, preservando relazioni contatto-riferimento.
- `20260605152000_dedupe_internal_references_by_name.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260606100000_soft_delete_contacts_references.sql` aggiunge soft delete operativo per contatti e riferimenti interni, nascondendoli dalle viste senza perdere storico o relazioni.
- `20260606100000_soft_delete_contacts_references.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- `20260606120000_real_access_import_fields.sql` aggiunge i campi legacy necessari per conservare i dati completi di `DbSegreteria2.mdb/Persone`.
- `20260606120000_real_access_import_fields.sql` e' stata applicata in modo persistente al database self-hosted il 2026-06-05.
- Le migration necessarie e non distruttive possono essere applicate dopo review; chiedere conferma esplicita per migration distruttive o modifiche fuori scope.

## Utenti autorizzati

Ogni utente deve avere sia un record Supabase Auth sia un record `profiles` con lo stesso UUID. Il provisioning amministrativo si esegue dalla root:

```bash
npm run user:provision -- email@example.org manager Nome Cognome
npm run user:provision -- email@example.org reference Nome Cognome
```

## Import Access

Il vecchio file `old_software/Segreteria2.mdb` e' il database interfaccia: non contiene l'archivio completo e non va usato come fonte dati. La fonte corretta e' `old_software/DbSegreteria2.mdb`, con tabella principale `Persone`.

Mappatura principale:

- `Persone.IdPersona` -> `contacts.legacy_access_id`
- `Persone.IdOldArchivio` -> `contacts.legacy_access_old_archive_id`
- `Persone.Attivo = S` -> `contacts.status = 'active'`
- `Persone.Attivo = N/n` -> `contacts.status = 'standby'`, mostrato nell'app come "Non attivo"
- `Persone.Nome`, `Cognome`, `Titolo`, `Carica`, `NomeUfficio`, recapiti, indirizzi casa/ufficio, lingue, note e date legacy -> campi `contacts` dedicati
- `Gruppi` e `Ruoli` -> `groups`
- `Persone.IdGruppo` e `PersoneGruppi.IdRuolo` -> `contact_groups`
- `Persone.Contatti` -> `internal_references` e `contact_references`

Mappatura referenti:

- dividere `Persone.Contatti` sulle virgole;
- rimuovere `?` dai nomi dei referenti (`Vincenzo?` = `Vincenzo`);
- creare un record `internal_references` per ogni referente atomico distinto;
- popolare `first_name`, `last_name`, `full_name` e `legacy_access_contact_name`;
- collegare ogni contatto ai suoi referenti con `contact_references`.

Lo script locale di export:

```bash
python3 scripts/export_legacy_access_contacts.py --mdb old_software/DbSegreteria2.mdb --out old_software/export
```

genera CSV di revisione in `old_software/export/`, cartella ignorata da Git. L'export corretto produce:

- 12.956 contatti;
- 57 gruppi;
- 15.087 relazioni contatto-gruppo;
- 297 referenti interni normalizzati;
- 13.439 relazioni contatto-referente.

Prima del reimport corretto del 2026-06-05 e' stato eseguito il reset una tantum delle tabelle operative con:

```bash
ssh root@178.105.59.79 "docker exec -i supabase-db-c13y7vgiy5k5gbs9r9edpgeu psql -U postgres -d postgres" < scripts/reset_legacy_archive_data.sql
```

Lo script di import persistente:

```bash
python3 scripts/import_legacy_access_contacts.py --export-dir old_software/export --apply --allow-insecure-tls
```

L'import corretto e' stato eseguito sul database self-hosted il 2026-06-05 con questi conteggi verificati:

- 12.956 contatti, tutti con `legacy_access_id` valorizzato e univoco;
- 4.104 contatti attivi e 8.852 contatti non attivi;
- 57 gruppi;
- 15.087 relazioni `contact_groups`;
- 297 riferimenti interni normalizzati;
- 13.439 relazioni `contact_references`;
- 0 riferimenti con punto interrogativo residuo.

Lingue e paesi vengono normalizzati solo per alias certi verso i nomi usati dall'UI. Valori conservati per revisione post-import: `UE`, `SMOM`, `OLP`, `ONU`, `Jugoslavia`, `Polisario`.

## Verifica sicura

Per validare una migration sul database self-hosted senza persistere modifiche, eseguirla in transazione con `rollback`.

Il database self-hosted di questo progetto e' nello stack Coolify con suffix:

```text
c13y7vgiy5k5gbs9r9edpgeu
```

Container database:

```text
supabase-db-c13y7vgiy5k5gbs9r9edpgeu
```
