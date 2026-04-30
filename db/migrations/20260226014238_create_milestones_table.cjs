/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Check if the milestones table already exists to avoid conflicts
  const tableExists = await knex.schema.hasTable("milestones");
  if (tableExists) {
    // Table already exists, so this migration has likely been run
    // Just ensure the indexes exist
    await knex.schema.alterTable("milestones", (table) => {
      table.index(["vault_id"], "idx_milestones_vault_id");
      table.index(["status"], "idx_milestones_status");
    });
    return;
  }

  // Check if milestone_status enum already exists and handle accordingly
  const enumExists = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM pg_type 
      WHERE typname = 'milestone_status'
    ) as exists
  `);

  const hasEnum = enumExists.rows[0]?.exists;

  await knex.schema.createTable("milestones", (table) => {
    // Primary key
    table.string("id", 64).primary();

    // Foreign key matching the vaults table ID format
    table
      .string("vault_id", 64)
      .notNullable()
      .references("id")
      .inTable("vaults")
      .onDelete("CASCADE")
      .onUpdate("CASCADE");

    table.string("title", 255).notNullable();
    table.text("description");
    table.string("type", 100).notNullable();

    // JSONB is ideal for storing flexible criteria (hash/document/oracle/verifier)
    table.jsonb("criteria").notNullable();

    table.integer("weight").notNullable().defaultTo(0);
    table.timestamp("due_date", { useTz: true });

    // Handle status enum - use existing one if it exists, otherwise create new one
    if (hasEnum) {
      // Use existing enum (will have the values from the first migration)
      table.string("status", 50).notNullable().defaultTo("pending");
    } else {
      // Create new enum if it doesn't exist
      table
        .enu("status", ["pending", "submitted", "approved", "rejected"], {
          useNative: true,
          enumName: "milestone_status",
        })
        .notNullable()
        .defaultTo("pending");
    }

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Indexes to optimize repository list queries
  await knex.schema.alterTable("milestones", (table) => {
    table.index(["vault_id"], "idx_milestones_vault_id");
    table.index(["status"], "idx_milestones_status");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  // Drop table first
  await knex.schema.dropTableIfExists("milestones");

  // Only drop the enum type if this migration created it
  // Check if there are other tables that might be using this enum
  const enumUsage = await knex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE column_default LIKE '%milestone_status%' 
      OR data_type = 'enum'
      AND table_schema = current_schema()
    ) as in_use
  `);

  const isInUse = enumUsage.rows[0]?.in_use;

  // Only drop the enum if it's not being used by other tables
  if (!isInUse) {
    await knex.raw("DROP TYPE IF EXISTS milestone_status");
  }
};
