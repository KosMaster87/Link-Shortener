export async function getUserLinks(pool, userId) {
  const result = await pool.query(
    'SELECT * FROM short_links WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return { success: true, data: result.rows };
}
