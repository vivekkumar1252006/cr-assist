/** Appends an audit-log row. Pass the transaction connection when inside one. */
export async function audit(db, req, action, entityType, entityId, details = null) {
  await db.execute(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user?.id ?? null, action, entityType, entityId ?? null, details ? JSON.stringify(details) : null, req.ip ?? null],
  );
}
