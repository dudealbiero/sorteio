"use strict";

const { hashPassword } = require("../services/authService");
const HttpError = require("../utils/HttpError");

function validateUsername(value) {
  if (typeof value !== "string") throw new HttpError(400, "Informe um nome de usuário.");
  const username = value.trim().toLocaleLowerCase("pt-BR");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new HttpError(400, "O usuário deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.");
  }
  return username;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12) {
    throw new HttpError(400, "A senha deve ter no mínimo 12 caracteres.");
  }
  if (value.length > 256) throw new HttpError(400, "A senha pode ter no máximo 256 caracteres.");
  return value;
}

function createUserController(db) {
  return {
    list(req, res) {
      const users = db.prepare(`
        SELECT id, username, role, created_at AS createdAt FROM users ORDER BY id
      `).all();
      res.json({ users });
    },

    create(req, res) {
      const username = validateUsername(req.body?.username);
      const password = validatePassword(req.body?.password);
      try {
        const result = db.prepare(`
          INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'user', ?)
        `).run(username, hashPassword(password), new Date().toISOString());
        const user = db.prepare(`
          SELECT id, username, role, created_at AS createdAt FROM users WHERE id = ?
        `).get(result.lastInsertRowid);
        res.status(201).json({ user });
      } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") throw new HttpError(409, "Esse usuário já existe.");
        throw error;
      }
    },

    resetPassword(req, res) {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identificador de usuário inválido.");
      const password = validatePassword(req.body?.password);
      const updated = db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'user'")
        .run(hashPassword(password), id);
      if (!updated.changes) throw new HttpError(404, "Usuário não encontrado.");
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      res.status(204).end();
    },

    remove(req, res) {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Identificador de usuário inválido.");
      if (id === req.user.id) throw new HttpError(400, "Não é possível excluir a própria conta.");
      const removed = db.prepare("DELETE FROM users WHERE id = ? AND role = 'user'").run(id);
      if (!removed.changes) throw new HttpError(404, "Usuário não encontrado.");
      res.status(204).end();
    }
  };
}

module.exports = { createUserController };
