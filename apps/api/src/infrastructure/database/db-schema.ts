/**
 * Drizzle schema aggregator.
 *
 * The client reads it **only once, at startup**, and it is the only thing that
 * lets it resolve `db.query.<table>` and `with: { relation: true }`. A
 * `*.schema.ts` that is not re-exported here compiles fine and then fails at
 * runtime with:
 *
 *     Cannot read properties of undefined (reading 'referencedTable')
 *
 * the first time someone queries it through a relation. There is no
 * compile-time guard: the rule is that **every new `*.schema.ts`, every
 * `relations()` and every `pgEnum` is re-exported here in the same PR**.
 */

export * from '../../modules/assistant/infrastructure/persistence/assistant.schema';
export * from '../../modules/leads/infrastructure/persistence/leads.schema';
export * from '../../modules/whatsapp/infrastructure/persistence/whatsapp.schema';
