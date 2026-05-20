export async function up(pgm) {
  pgm.sql(`
    ALTER TABLE assumption_extraction_records
      ADD COLUMN IF NOT EXISTS visibility text CHECK (visibility IS NULL OR visibility IN ('explicit', 'unstated', 'implicit', 'contextual')),
      ADD COLUMN IF NOT EXISTS lens text CHECK (lens IS NULL OR lens IN ('selection', 'identity', 'incentive', 'temporal', 'taboo', 'optionality', 'second_order')),
      ADD COLUMN IF NOT EXISTS load_bearing boolean;

    ALTER TABLE deliberation_traces
      ADD COLUMN IF NOT EXISTS pipeline_amplification jsonb NOT NULL DEFAULT '{}'::jsonb;
  `);
}

export async function down(pgm) {
  pgm.sql(`
    ALTER TABLE deliberation_traces DROP COLUMN IF EXISTS pipeline_amplification;
    ALTER TABLE assumption_extraction_records
      DROP COLUMN IF EXISTS visibility,
      DROP COLUMN IF EXISTS lens,
      DROP COLUMN IF EXISTS load_bearing;
  `);
}
