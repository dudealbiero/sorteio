"use strict";

const express = require("express");
const multer = require("multer");
const { createDrawController } = require("../controllers/drawController");
const { createParticipantController } = require("../controllers/participantController");
const { createAuthController } = require("../controllers/authController");
const { createUserController } = require("../controllers/userController");
const { requireAdministrator, requireAuthentication } = require("../services/authService");

function createApiRouter(db) {
  const router = express.Router();
  const participants = createParticipantController(db);
  const draws = createDrawController(db);
  const auth = createAuthController(db);
  const users = createUserController(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
  });

  router.get("/health", (req, res) => res.json({ status: "ok" }));
  router.post("/auth/login", auth.login);
  router.get("/auth/me", requireAuthentication(db), auth.current);
  router.post("/auth/logout", requireAuthentication(db), auth.logout);
  router.use(requireAuthentication(db));
  router.get("/users", requireAdministrator, users.list);
  router.post("/users", requireAdministrator, users.create);
  router.patch("/users/:id/password", requireAdministrator, users.resetPassword);
  router.delete("/users/:id", requireAdministrator, users.remove);
  router.get("/database", participants.database);
  router.get("/participants", participants.list);
  router.post("/participants", participants.create);
  router.put("/participants/:id", participants.update);
  router.delete("/participants/:id", participants.remove);
  router.post("/participants/import", upload.single("file"), participants.import);
  router.get("/draws", draws.list);
  router.post("/draws", draws.create);
  router.get("/draws/:id", draws.get);
  router.patch("/draws/:id/swap", draws.swap);
  return router;
}

module.exports = { createApiRouter };
