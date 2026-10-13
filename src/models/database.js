"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { hashPassword } = require("../services/authService");

const DEFAULT_PARTICIPANTS = [
  "Dude", "Sofia", "Marcio", "Pedro", "Wilson", "Ana",
  "Luis", "Caique", "Ellon", "Samuel", "Vinícius", "Kauan"
];

function normalizeName(name) {
  return name.trim().normalize("NFC").toLocaleLowerCase("pt-BR");
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

function createDatabase(dbPath, admin = {}) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, normalized_name)
    );
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS draws (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('groups', 'size')),
      setting INTEGER NOT NULL CHECK (setting > 0),
      participant_count INTEGER NOT NULL CHECK (participant_count > 0),
      group_count INTEGER NOT NULL CHECK (group_count > 0)
    );
    CREATE TABLE IF NOT EXISTS draw_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draw_id TEXT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS draw_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES draw_groups(id) ON DELETE CASCADE,
      participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
      participant_name TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_draw_groups_draw ON draw_groups(draw_id, position);
    CREATE INDEX IF NOT EXISTS idx_draw_members_group ON draw_members(group_id, position);
  `);

  let adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  if (!adminUser) {
    const username = String(admin.username || process.env.ADMIN_USERNAME || "").trim().toLocaleLowerCase("pt-BR");
    const password = admin.password || process.env.ADMIN_PASSWORD || "";
    if (!/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 12 || password.length > 256) {
      db.close();
      throw new Error("Configure ADMIN_USERNAME válido (3 a 40 caracteres) e ADMIN_PASSWORD (12 a 256 caracteres) para criar o administrador inicial.");
    }
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)
    `).run(username, hashPassword(password), new Date().toISOString());
    adminUser = { id: result.lastInsertRowid };
  }

  if (!hasColumn(db, "participants", "user_id")) {
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      db.exec(`
        CREATE TABLE participants_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (user_id, normalized_name)
        );
      `);
      db.prepare(`
        INSERT INTO participants_new (id, user_id, name, normalized_name, created_at, updated_at)
        SELECT id, ?, name, normalized_name, created_at, updated_at FROM participants
      `).run(adminUser.id);
      db.exec("DROP TABLE participants; ALTER TABLE participants_new RENAME TO participants;");
    })();
    db.pragma("foreign_keys = ON");
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_user_name ON participants(user_id, normalized_name);
  `);
  if (!hasColumn(db, "draws", "user_id")) {
    db.exec("ALTER TABLE draws ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
    db.prepare("UPDATE draws SET user_id = ? WHERE user_id IS NULL").run(adminUser.id);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_draws_user_created_at ON draws(user_id, created_at DESC)");

  const initialization = db.prepare("SELECT value FROM app_metadata WHERE key = 'initialized'").get();
  if (!initialization) {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO participants (user_id, name, normalized_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      const participantCount = db.prepare("SELECT COUNT(*) AS count FROM participants").get().count;
      if (participantCount === 0) {
        DEFAULT_PARTICIPANTS.forEach((name) => insert.run(adminUser.id, name, normalizeName(name), now, now));
      }
      db.prepare("INSERT INTO app_metadata (key, value) VALUES ('initialized', 'true')").run();
    })();
  }
  return db;
}

function listParticipants(db, userId) {
  return db.prepare(`
    SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
    FROM participants WHERE user_id = ?
    ORDER BY id
  `).all(userId);
}

function participantExists(db, id, userId) {
  return Boolean(db.prepare("SELECT id FROM participants WHERE id = ? AND user_id = ?").get(id, userId));
}

function createParticipant(db, name, userId) {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO participants (user_id, name, normalized_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, name, normalizeName(name), now, now);
  return db.prepare(`
    SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
    FROM participants WHERE id = ?
  `).get(result.lastInsertRowid);
}

function updateParticipant(db, id, name, userId) {
  db.prepare("UPDATE participants SET name = ?, normalized_name = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(name, normalizeName(name), new Date().toISOString(), id, userId);
  return db.prepare(`
    SELECT id, name, created_at AS createdAt, updated_at AS updatedAt
    FROM participants WHERE id = ? AND user_id = ?
  `).get(id, userId);
}

function deleteParticipant(db, id, userId) {
  return db.prepare("DELETE FROM participants WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

function importParticipants(db, names, userId) {
  const insert = db.prepare(`
    INSERT INTO participants (user_id, name, normalized_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, normalized_name) DO NOTHING
  `);
  const now = new Date().toISOString();
  return db.transaction(() => names.reduce((added, name) => {
    return added + insert.run(userId, name, normalizeName(name), now, now).changes;
  }, 0))();
}

function getDatabaseTables(db, userId) {
  return {
    participants: db.prepare(`
      SELECT id, name, normalized_name, created_at, updated_at FROM participants WHERE user_id = ? ORDER BY id
    `).all(userId),
    draws: db.prepare(`
      SELECT id, created_at, mode, setting, participant_count, group_count
      FROM draws WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId),
    draw_groups: db.prepare(`
      SELECT dg.id, dg.draw_id, dg.name, dg.position FROM draw_groups dg
      JOIN draws d ON d.id = dg.draw_id WHERE d.user_id = ? ORDER BY dg.id
    `).all(userId),
    draw_members: db.prepare(`
      SELECT dm.id, dm.group_id, dm.participant_id, dm.participant_name, dm.position
      FROM draw_members dm JOIN draw_groups dg ON dg.id = dm.group_id
      JOIN draws d ON d.id = dg.draw_id WHERE d.user_id = ? ORDER BY dm.id
    `).all(userId)
  };
}

module.exports = {
  createDatabase,
  createParticipant,
  deleteParticipant,
  getDatabaseTables,
  importParticipants,
  listParticipants,
  normalizeName,
  participantExists,
  updateParticipant
};
