"use strict";

const crypto = require("node:crypto");
const {
  createDraw: persistDraw,
  findDrawMembersForSwap,
  getDraw,
  listDrawParticipants,
  listDraws,
  swapDrawMembers
} = require("../models/drawModel");
const HttpError = require("../utils/HttpError");

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = crypto.randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function calculateGroupSizes(participantCount, mode, setting) {
  if (!Number.isInteger(setting) || setting < 1 || setting > participantCount) {
    throw new HttpError(400, `O valor deve estar entre 1 e ${participantCount}.`);
  }
  if (mode === "groups") {
    const base = Math.floor(participantCount / setting);
    const remainder = participantCount % setting;
    return Array.from({ length: setting }, (_, index) => base + (index < remainder ? 1 : 0));
  }
  if (mode === "size") {
    const sizes = [];
    for (let left = participantCount; left > 0; left -= setting) sizes.push(Math.min(setting, left));
    return sizes;
  }
  throw new HttpError(400, "Modo inválido. Use 'groups' ou 'size'.");
}

function createDrawController(db) {
  return {
    list(req, res) {
      res.json({ draws: listDraws(db, req.user.id) });
    },

    create(req, res) {
      const { mode, setting } = req.body || {};
      const participants = listDrawParticipants(db, req.user.id);
      if (participants.length === 0) {
        throw new HttpError(400, "Cadastre pelo menos um participante antes de sortear.");
      }
      if (mode !== "groups" && mode !== "size") {
        throw new HttpError(400, "Modo inválido. Use 'groups' ou 'size'.");
      }
      const numericSetting = Number(setting);
      if (!Number.isSafeInteger(numericSetting)) {
        throw new HttpError(400, "Informe uma quantidade inteira válida para a divisão.");
      }
      const groupSizes = calculateGroupSizes(participants.length, mode, numericSetting);
      const shuffled = shuffle(participants);
      const drawId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      persistDraw(db, {
        drawId,
        userId: req.user.id,
        createdAt,
        mode,
        setting: numericSetting,
        participants: shuffled,
        groupSizes
      });
      res.status(201).json({ draw: getDraw(db, drawId, req.user.id) });
    },

    get(req, res) {
      const draw = getDraw(db, req.params.id, req.user.id);
      if (!draw) throw new HttpError(404, "Sorteio não encontrado.");
      res.json({ draw });
    },

    swap(req, res) {
      const drawId = req.params.id;
      const memberAId = Number(req.body?.memberAId);
      const memberBId = Number(req.body?.memberBId);
      if (!Number.isSafeInteger(memberAId) || !Number.isSafeInteger(memberBId) || memberAId < 1 || memberBId < 1) {
        throw new HttpError(400, "Selecione dois participantes válidos para trocar.");
      }
      if (memberAId === memberBId) throw new HttpError(400, "Escolha dois participantes diferentes.");
      const members = findDrawMembersForSwap(db, drawId, req.user.id, memberAId, memberBId);
      if (members.length !== 2) {
        throw new HttpError(404, "Um ou ambos os participantes não pertencem a este sorteio.");
      }
      if (members[0].groupId === members[1].groupId) {
        throw new HttpError(400, "Arraste o participante para alguém de outro grupo.");
      }
      swapDrawMembers(db, members);
      res.json({ draw: getDraw(db, drawId, req.user.id) });
    }
  };
}

module.exports = { createDrawController };
