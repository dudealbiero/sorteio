"use strict";

const {
  createSession,
  cookieHeader,
  readCookie,
  shouldUseSecureCookie,
  tokenHash,
  verifyPassword
} = require("../services/authService");
const HttpError = require("../utils/HttpError");

function createAuthController(db) {
  return {
    login(req, res) {
      const username = typeof req.body?.username === "string"
        ? req.body.username.trim().toLocaleLowerCase("pt-BR")
        : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const user = db.prepare("SELECT id, username, password_hash AS passwordHash, role FROM users WHERE username = ?")
        .get(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new HttpError(401, "Usuário ou senha inválidos.");
      }
      const session = createSession(db, user.id, shouldUseSecureCookie(req));
      res.setHeader("Set-Cookie", session.cookie);
      res.json({ user: { id: user.id, username: user.username, role: user.role } });
    },

    current(req, res) {
      res.json({ user: req.user });
    },

    logout(req, res) {
      const token = readCookie(req);
      if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
      res.setHeader("Set-Cookie", cookieHeader("", 0, shouldUseSecureCookie(req)));
      res.status(204).end();
    }
  };
}

module.exports = { createAuthController };
