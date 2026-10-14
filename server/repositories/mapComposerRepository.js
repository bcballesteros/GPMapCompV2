import { connect, query } from '../db/db.js';

export async function createMapComposerRecord({ email, imageData }) {
  const result = await query(
    'INSERT INTO map_composer (email, image_data) VALUES ($1, $2) RETURNING id',
    [email, imageData],
  );

  return result.rows[0];
}

export async function createMapComposerRecords(records, acquireConnection = connect) {
  const client = await acquireConnection();
  try {
    await client.query('BEGIN');
    const inserted = [];
    for (const { email, imageData } of records) {
      const result = await client.query(
        'INSERT INTO map_composer (email, image_data) VALUES ($1, $2) RETURNING id',
        [email, imageData],
      );
      inserted.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original insert/commit failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getMapComposerRecordById(id) {
  const result = await query(
    'SELECT id, email, image_data FROM map_composer WHERE id = $1',
    [id],
  );

  return result.rows[0] ?? null;
}
