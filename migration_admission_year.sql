-- Migration file to rename passout_year to admission_year

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='batches' AND column_name='passout_year'
  ) THEN
    ALTER TABLE batches RENAME COLUMN passout_year TO admission_year;
  END IF;
END $$;
