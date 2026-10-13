"use strict";

const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { createDatabase } = require("./models/database");
const { createApiRouter } = require("./routes/apiRoutes");
const HttpError = require("./utils/HttpError");

function createApplication(options = {}) {
  const dbPath = options.dbPath || process.env.DB_PATH || path.join(__dirname, "..", "database", "sorteio.sqlite");
  const clientDist = path.join(__dirname, "..", "frontend", "dist");
  const db = createDatabase(dbPath, {
    username: options.adminUsername,
    password: options.adminPassword
  });
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createApiRouter(db));
  app.use(express.static(clientDist));
  app.get("/", (req, res) => res.sendFile(path.join(clientDist, "index.html")));
  app.use((req, res) => res.status(404).json({ error: "Rota não encontrada." }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "O arquivo não pode ultrapassar 5 MB."
        : "Não foi possível receber o arquivo enviado.";
      return res.status(400).json({ error: message });
    }
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error("Erro inesperado na API.", error);
    return res.status(500).json({ error: "Ocorreu um erro interno. Consulte o log do servidor." });
  });
  return { app, db };
}

module.exports = { createApplication };
