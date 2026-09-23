import { query } from '../db/db.js';

export async function createMapComposerRecord({ email, imageData }) {
  const result = await query(
    'INSERT INTO map_composer (email, image_data) VALUES ($1, $2) RETURNING id',
    [email, imageData],
  );

  return result.rows[0];
}

export async function getMapComposerRecordById(id) {
  const result = await query(
    'SELECT id, email, image_data FROM map_composer WHERE id = $1',
    [id],
  );

  return result.rows[0] ?? null;
}
