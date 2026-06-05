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
- Le migration necessarie e non distruttive possono essere applicate dopo review; chiedere conferma esplicita per migration distruttive o modifiche fuori scope.

## Utenti autorizzati

Ogni utente deve avere sia un record Supabase Auth sia un record `profiles` con lo stesso UUID. Il provisioning amministrativo si esegue dalla root:

```bash
npm run user:provision -- email@example.org manager Nome Cognome
npm run user:provision -- email@example.org reference Nome Cognome
```

## Import Access

Il vecchio file `old_software/Segreteria2.mdb` non va versionato. La tabella principale e' `EXPO2000`.

Mappatura contatti prevista:

- `EXPO2000.ID` -> `contacts.legacy_access_id`
- `EXPO2000.Titolo` -> `contacts.honorific_title`
- `EXPO2000.Nome` -> `contacts.first_name`
- `EXPO2000.Cognome` -> `contacts.last_name`
- `EXPO2000.Qualifica` -> `contacts.institutional_role`
- `EXPO2000.Recapito` -> `contacts.mailing_name`
- `EXPO2000.Via` -> `contacts.address_line`
- `EXPO2000.Cap` -> `contacts.postal_code`
- `EXPO2000.Citta'` -> `contacts.city`
- `EXPO2000.Paese` -> `contacts.country`
- `EXPO2000.Tel_Fisso` -> `contacts.phone`
- `EXPO2000.Tel_Cellulare` -> `contacts.mobile_phone`
- `EXPO2000.Fax` -> `contacts.fax`
- `EXPO2000.E-Mail` -> `contacts.email`
- `EXPO2000.Sito_Web` -> `contacts.website`
- `EXPO2000.CampoNote` -> `contacts.notes`

Mappatura referenti prevista:

- per ogni valore non vuoto distinto di `EXPO2000.Contatto`, creare un record in `internal_references`;
- dividere i valori `Contatto` separati da virgola in riferimenti atomici;
- popolare `internal_references.first_name` e `internal_references.last_name`, mantenendo `full_name` sincronizzato;
- salvare il valore originale/normalizzato in `internal_references.legacy_access_contact_name`;
- collegare ogni contatto al suo referente con `contact_references`, usando `contacts.legacy_access_id` per mantenere la relazione con la riga Access originale.

Lo script locale di export:

```bash
python3 scripts/export_legacy_access_contacts.py
```

genera CSV di revisione in `old_software/export/`, cartella ignorata da Git. Alla prima verifica ha prodotto:

- 3033 contatti;
- 27 gruppi usati dai contatti;
- 3033 relazioni contatto-gruppo;
- 260 referenti interni normalizzati da `EXPO2000.Contatto`;
- 2447 relazioni contatto-referente.

Lo script di import persistente:

```bash
python3 scripts/import_legacy_access_contacts.py --apply --allow-insecure-tls
```

L'import e' stato eseguito sul database self-hosted il 2026-06-05 con questi conteggi verificati:

- 3033 contatti, tutti con `legacy_access_id` valorizzato e univoco;
- 27 gruppi;
- 3033 relazioni `contact_groups`;
- 260 riferimenti interni normalizzati attivi;
- 2447 relazioni `contact_references`.
- i riferimenti legacy composti con virgola sono stati splittati, deduplicati e rimossi quando non piu' collegati.

`EXPO2000` non contiene una colonna lingua; `contacts.spoken_language` resta vuoto. Il paese viene normalizzato solo per alias certi verso i nomi usati dall'autocomplete UI. Valori conservati per revisione post-import: `OLP`, `UE`, `ONU`, `Jugoslavia`, `Corea`, `SMOM`, `Polisario`.

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
