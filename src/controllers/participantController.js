"use strict";

const {
  createParticipant,
  deleteParticipant,
  getDatabaseTables,
  importParticipants,
  listParticipants,
  participantExists,
  updateParticipant
} = require("../models/database");
const { cleanName, readUploadedNames } = require("../services/participantImportService");
const HttpError = require("../utils/HttpError");

function createParticipantController(db) {
  return {
    list(req, res) {
      res.json({ participants: listParticipants(db, req.user.id) });
    },

    create(req, res) {
      const name = cleanName(req.body?.name);
      try {
        res.status(201).json({ participant: createParticipant(db, name, req.user.id) });
      } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
          throw new HttpError(409, "Já existe um participante com esse nome.");
        }
        throw error;
      }
    },

    update(req, res) {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new HttpError(400, "Identificador de participante inválido.");
      }
      const name = cleanName(req.body?.name);
      if (!participantExists(db, id, req.user.id)) throw new HttpError(404, "Participante não encontrado.");
      try {
        res.json({ participant: updateParticipant(db, id, name, req.user.id) });
      } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
          throw new HttpError(409, "Já existe outro participante com esse nome.");
        }
        throw error;
      }
    },

    remove(req, res) {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new HttpError(400, "Identificador de participante inválido.");
      }
      if (!deleteParticipant(db, id, req.user.id)) throw new HttpError(404, "Participante não encontrado.");
      res.status(204).end();
    },

    async import(req, res) {
      if (!req.file) throw new HttpError(400, "Selecione um arquivo CSV, TXT ou XLSX.");
      const names = await readUploadedNames(req.file);
      const added = importParticipants(db, names, req.user.id);
      res.status(200).json({
        imported: added,
        ignored: names.length - added,
        totalInFile: names.length,
        message: `${added} participante(s) adicionado(s); ${names.length - added} duplicado(s) ignorado(s).`
      });
    },

    database(req, res) {
      res.json({ tables: getDatabaseTables(db, req.user.id) });
    }
  };
}

module.exports = { createParticipantController };
