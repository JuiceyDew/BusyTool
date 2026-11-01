import type { DatabaseSync } from 'node:sqlite'
import { tx } from '../db'
import type { VideoTypeRow } from '../../shared/types'
import { boolInt, num, str, type Row } from '../rows'

export interface VideoTypeInput {
  name: string
  defaultPriceCents: number
}

function mapVideoType(row: Row): VideoTypeRow {
  return {
    id: num(row.id),
    name: str(row.name),
    defaultPriceCents: num(row.defaultPriceCents),
    archived: boolInt(row.archived),
    videoCount: num(row.videoCount)
  }
}

const COLUMNS = `t.id AS id, t.name AS name, t.default_price_cents AS defaultPriceCents, t.archived AS archived,
  (SELECT COUNT(*) FROM videos v WHERE v.video_type_id = t.id) AS videoCount`

export function listVideoTypes(db: DatabaseSync, includeArchived = false): VideoTypeRow[] {
  const sql = `SELECT ${COLUMNS} FROM video_types t
    ${includeArchived ? '' : 'WHERE t.archived = 0'}
    ORDER BY t.archived ASC, t.name COLLATE NOCASE ASC`
  return db.prepare(sql).all().map(mapVideoType)
}

export function getVideoType(db: DatabaseSync, id: number): VideoTypeRow | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM video_types t WHERE t.id = ?`).get(id)
  return row ? mapVideoType(row) : null
}

export function createVideoType(db: DatabaseSync, input: VideoTypeInput): VideoTypeRow {
  const result = db
    .prepare('INSERT INTO video_types(name, default_price_cents) VALUES (?, ?)')
    .run(input.name.trim(), input.defaultPriceCents)
  const created = getVideoType(db, Number(result.lastInsertRowid))
  if (!created) throw new Error('Video type could not be created.')
  return created
}

export function updateVideoType(db: DatabaseSync, id: number, input: VideoTypeInput): VideoTypeRow {
  db.prepare('UPDATE video_types SET name = ?, default_price_cents = ? WHERE id = ?').run(
    input.name.trim(),
    input.defaultPriceCents,
    id
  )
  const updated = getVideoType(db, id)
  if (!updated) throw new Error('Video type not found.')
  return updated
}

export function setVideoTypeArchived(db: DatabaseSync, id: number, archived: boolean): VideoTypeRow {
  db.prepare('UPDATE video_types SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
  const updated = getVideoType(db, id)
  if (!updated) throw new Error('Video type not found.')
  return updated
}

export function deleteVideoType(db: DatabaseSync, id: number): void {
  tx(db, () => {
    const used = db.prepare('SELECT COUNT(*) FROM videos WHERE video_type_id = ?').get(id)
    const count = used ? num(Object.values(used)[0]) : 0
    if (count > 0) throw new Error(`Used by ${count} videos; archive instead.`)
    db.prepare('DELETE FROM video_types WHERE id = ?').run(id)
  })
}
