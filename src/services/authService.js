"use strict";

const crypto = require("node:crypto");
const HttpError = require("../utils/HttpError");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = "sorteio_session";

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieHeader(token, maxAge, secure) {
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function shouldUseSecureCookie(request) {
  return process.env.NODE_ENV === "production" || request.secure;
}

function readCookie(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function createSession(db, userId, secure) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash(token), userId, expiresAt);
  return { token, expiresAt, cookie: cookieHeader(token, SESSION_TTL_MS / 1000, secure) };
}

function requireAuthentication(db) {
  return (req, res, next) => {
    const token = readCookie(req);
    if (!token) return res.status(401).json({ error: "Faça login para continuar." });
    const session = db.prepare(`
      SELECT u.id, u.username, u.role, s.expires_at AS expiresAt
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(tokenHash(token));
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      if (session) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
      res.setHeader("Set-Cookie", cookieHeader("", 0, shouldUseSecureCookie(req)));
      return res.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
    }
    req.user = { id: session.id, username: session.username, role: session.role };
    return next();
  };
}

function requireAdministrator(req, res, next) {
  if (req.user?.role !== "admin") {
    return next(new HttpError(403, "Acesso restrito ao administrador."));
  }
  return next();
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  createSession,
  cookieHeader,
  hashPassword,
  readCookie,
  requireAdministrator,
  requireAuthentication,
  shouldUseSecureCookie,
  tokenHash,
  verifyPassword
};
