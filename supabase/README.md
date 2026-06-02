# Supabase migrations

Questa cartella contiene le migration SQL del progetto.

## Stato Milestone 3

- `20260602163000_initial_mvp_schema.sql` definisce lo schema MVP iniziale.
- La migration include tabelle core, indici, trigger `updated_at`, storico contatti, audit log e RLS.
- Non applicare migration persistenti al database di produzione senza conferma esplicita.

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
