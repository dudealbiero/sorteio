"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const ExcelJS = require("exceljs");
const Database = require("better-sqlite3");
const { createApplication } = require("../server");

async function withServer(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sorteio-grupos-"));
  const dbPath = path.join(directory, "test.sqlite");
  const adminUsername = "admin";
  const adminPassword = "test-admin-password-2026";
  let service = createApplication({ dbPath, adminUsername, adminPassword });
  let server = await new Promise((resolve) => {
    const runningServer = service.app.listen(0, "127.0.0.1", () => resolve(runningServer));
  });
  let baseUrl = `http://127.0.0.1:${server.address().port}`;
  const rawRequest = (route, options) => fetch(`${baseUrl}${route}`, options);
  const loginResponse = await jsonRequest(rawRequest, "/api/auth/login", "POST", {
    username: adminUsername,
    password: adminPassword
  });
  if (loginResponse.response.status !== 200) throw new Error("Could not log in as test administrator.");
  const adminCookie = loginResponse.response.headers.get("set-cookie").split(";")[0];

  const requestAs = (cookie, route, options = {}) => {
    const headers = new Headers(options.headers);
    if (cookie) headers.set("cookie", cookie);
    return fetch(`${baseUrl}${route}`, { ...options, headers });
  };
  const request = (route, options = {}) => requestAs(adminCookie, route, options);

  const restart = async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    service.db.close();
    service = createApplication({ dbPath, adminUsername, adminPassword });
    server = await new Promise((resolve) => {
      const runningServer = service.app.listen(0, "127.0.0.1", () => resolve(runningServer));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  };

  try {
    await run({
      request,
      rawRequest,
      requestAs,
      adminPassword,
      adminUsername,
      restart,
      closeDatabase: () => service.db.close()
    });
  } finally {
    await new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });
    try {
      service.db.close();
    } catch (error) {
      if (!String(error.message).includes("not open")) throw error;
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function jsonRequest(request, route, method, body) {
  const response = await request(route, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, body: response.status === 204 ? null : await response.json() };
}

test("authenticates users, restricts administration, and isolates user data", async () => {
  await withServer(async ({ request, rawRequest, requestAs, adminUsername, adminPassword }) => {
    const anonymous = await rawRequest("/api/participants");
    assert.equal(anonymous.status, 401);

    const invalidLogin = await jsonRequest(rawRequest, "/api/auth/login", "POST", {
      username: adminUsername,
      password: "wrong-password"
    });
    assert.equal(invalidLogin.response.status, 401);

    const created = await jsonRequest(request, "/api/users", "POST", {
      username: "isolated.user",
      password: "user-password-2026"
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.user.role, "user");
    assert.equal(created.body.user.username, "isolated.user");

    const userLogin = await jsonRequest(rawRequest, "/api/auth/login", "POST", {
      username: "isolated.user",
      password: "user-password-2026"
    });
    assert.equal(userLogin.response.status, 200);
    const userCookie = userLogin.response.headers.get("set-cookie").split(";")[0];

    const userList = await requestAs(userCookie, "/api/participants");
    assert.deepEqual((await userList.json()).participants, []);
    const userParticipant = await jsonRequest(requestAs.bind(null, userCookie), "/api/participants", "POST", {
      name: "Participante exclusivo"
    });
    assert.equal(userParticipant.response.status, 201);
    const sameNameInAdminWorkspace = await jsonRequest(request, "/api/participants", "POST", {
      name: "Participante exclusivo"
    });
    assert.equal(sameNameInAdminWorkspace.response.status, 201);
    const duplicateInUserWorkspace = await jsonRequest(requestAs.bind(null, userCookie), "/api/participants", "POST", {
      name: "participante exclusivo"
    });
    assert.equal(duplicateInUserWorkspace.response.status, 409);

    const adminParticipants = await request("/api/participants");
    assert.equal((await adminParticipants.json()).participants.length, 13);
    const forbidden = await requestAs(userCookie, "/api/users");
    assert.equal(forbidden.status, 403);

    const adminDraw = await jsonRequest(request, "/api/draws", "POST", { mode: "groups", setting: 2 });
    const userCanNotReadAdminDraw = await requestAs(userCookie, `/api/draws/${adminDraw.body.draw.id}`);
    assert.equal(userCanNotReadAdminDraw.status, 404);

    const reset = await jsonRequest(request, `/api/users/${created.body.user.id}/password`, "PATCH", {
      password: "reset-password-2026"
    });
    assert.equal(reset.response.status, 204);
    assert.equal((await requestAs(userCookie, "/api/participants")).status, 401);
    const updatedLogin = await jsonRequest(rawRequest, "/api/auth/login", "POST", {
      username: "isolated.user",
      password: "reset-password-2026"
    });
    const updatedCookie = updatedLogin.response.headers.get("set-cookie").split(";")[0];
    const removed = await request(`/api/users/${created.body.user.id}`, { method: "DELETE" });
    assert.equal(removed.status, 204);
    assert.equal((await requestAs(updatedCookie, "/api/participants")).status, 401);
  });
});

test("migrates legacy participants and draws into the administrator workspace", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sorteio-migration-"));
  const dbPath = path.join(directory, "legacy.sqlite");
  const legacyDb = new Database(dbPath);
  legacyDb.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE draws (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('groups', 'size')),
      setting INTEGER NOT NULL CHECK (setting > 0),
      participant_count INTEGER NOT NULL CHECK (participant_count > 0),
      group_count INTEGER NOT NULL CHECK (group_count > 0)
    );
    CREATE TABLE draw_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draw_id TEXT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
      name TEXT NOT NULL, position INTEGER NOT NULL
    );
    CREATE TABLE draw_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL REFERENCES draw_groups(id) ON DELETE CASCADE,
      participant_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
      participant_name TEXT NOT NULL, position INTEGER NOT NULL
    );
    INSERT INTO participants (id, name, normalized_name, created_at, updated_at)
    VALUES (1, 'Pessoa antiga', 'pessoa antiga', '2025-01-01', '2025-01-01');
    INSERT INTO app_metadata (key, value) VALUES ('initialized', 'true');
    INSERT INTO draws (id, created_at, mode, setting, participant_count, group_count)
    VALUES ('legacy-draw', '2025-01-02', 'groups', 1, 1, 1);
    INSERT INTO draw_groups (id, draw_id, name, position) VALUES (1, 'legacy-draw', 'Grupo 1', 0);
    INSERT INTO draw_members (id, group_id, participant_id, participant_name, position)
    VALUES (1, 1, 1, 'Pessoa antiga', 0);
  `);
  legacyDb.close();

  const service = createApplication({
    dbPath,
    adminUsername: "admin",
    adminPassword: "test-admin-password-2026"
  });
  try {
    const adminId = service.db.prepare("SELECT id FROM users WHERE username = 'admin'").get().id;
    assert.equal(service.db.prepare("SELECT user_id FROM participants WHERE id = 1").get().user_id, adminId);
    assert.equal(service.db.prepare("SELECT user_id FROM draws WHERE id = 'legacy-draw'").get().user_id, adminId);
    assert.equal(service.db.prepare("SELECT participant_name FROM draw_members WHERE id = 1").get().participant_name, "Pessoa antiga");
    assert.deepEqual(service.db.pragma("foreign_key_check"), []);
  } finally {
    service.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("serves the browser application from the backend", async () => {
  await withServer(async ({ request }) => {
    const response = await request("/");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.match(html, /<div id="root"><\/div>/);
    const scriptPath = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(scriptPath, "production HTML references its React application bundle");
    const script = await request(scriptPath);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /javascript/);
  });
});

test("supports participant creation, update, deletion, and duplicate validation", async () => {
  await withServer(async ({ request }) => {
    const initial = await request("/api/participants");
    assert.deepEqual(
      (await initial.json()).participants.map((participant) => participant.name),
      ["Dude", "Sofia", "Marcio", "Pedro", "Wilson", "Ana", "Luis", "Caique", "Ellon", "Samuel", "Vinícius", "Kauan"]
    );

    const created = await jsonRequest(request, "/api/participants", "POST", { name: "  Pessoa de Teste  " });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.participant.name, "Pessoa de Teste");

    const duplicate = await jsonRequest(request, "/api/participants", "POST", { name: "pessoa de teste" });
    assert.equal(duplicate.response.status, 409);

    const updated = await jsonRequest(
      request,
      `/api/participants/${created.body.participant.id}`,
      "PUT",
      { name: "Nome atualizado" }
    );
    assert.equal(updated.body.participant.name, "Nome atualizado");

    const deleted = await request(`/api/participants/${created.body.participant.id}`, { method: "DELETE" });
    assert.equal(deleted.status, 204);
    const missing = await request(`/api/participants/${created.body.participant.id}`);
    assert.equal(missing.status, 404);
  });
});

test("exposes the stored SQLite table records for visualization", async () => {
  await withServer(async ({ request }) => {
    const created = await jsonRequest(request, "/api/draws", "POST", { mode: "groups", setting: 2 });
    assert.equal(created.response.status, 201);

    const response = await request("/api/database");
    assert.equal(response.status, 200);
    const { tables } = await response.json();
    assert.equal(tables.participants.length, 12);
    assert.equal(tables.draws.length, 1);
    assert.equal(tables.draw_groups.length, 2);
    assert.equal(tables.draw_members.length, 12);
    assert.equal(tables.draws[0].id, created.body.draw.id);
  });
});

test("rejects invalid draw configurations and swaps within the same group", async () => {
  await withServer(async ({ request }) => {
    for (const payload of [
      { mode: "invalid", setting: 2 },
      { mode: "groups", setting: 0 },
      { mode: "groups", setting: 13 },
      { mode: "size", setting: 1.5 }
    ]) {
      const result = await jsonRequest(request, "/api/draws", "POST", payload);
      assert.equal(result.response.status, 400);
      assert.equal(typeof result.body.error, "string");
    }

    const created = await jsonRequest(request, "/api/draws", "POST", { mode: "groups", setting: 2 });
    const draw = created.body.draw;
    const sameGroupMembers = draw.groups[0].members.slice(0, 2);
    const invalidSwap = await jsonRequest(request, `/api/draws/${draw.id}/swap`, "PATCH", {
      memberAId: sameGroupMembers[0].id,
      memberBId: sameGroupMembers[1].id
    });
    assert.equal(invalidSwap.response.status, 400);

    const unchanged = await request(`/api/draws/${draw.id}`);
    assert.deepEqual((await unchanged.json()).draw, draw);
  });
});

test("imports CSV, TXT, and XLSX, adding new names and ignoring duplicates", async () => {
  await withServer(async ({ request }) => {
    const csvForm = new FormData();
    csvForm.append("file", new Blob(["Nome;Setor\r\nHelena;A\r\nDude;B\r\nHelena;C"], { type: "text/csv" }), "pessoas.csv");
    const csvResponse = await request("/api/participants/import", { method: "POST", body: csvForm });
    assert.equal(csvResponse.status, 200);
    assert.deepEqual(await csvResponse.json(), {
      imported: 1,
      ignored: 2,
      totalInFile: 3,
      message: "1 participante(s) adicionado(s); 2 duplicado(s) ignorado(s)."
    });

    const textForm = new FormData();
    textForm.append("file", new Blob(["Ivo\nJoana\n"], { type: "text/plain" }), "pessoas.txt");
    const textResponse = await request("/api/participants/import", { method: "POST", body: textForm });
    assert.equal((await textResponse.json()).imported, 2);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Participantes");
    sheet.addRows([["Participante"], ["Marta"], ["Renato"]]);
    const spreadsheet = await workbook.xlsx.writeBuffer();
    const xlsxForm = new FormData();
    xlsxForm.append(
      "file",
      new Blob([spreadsheet], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "pessoas.xlsx"
    );
    const xlsxResponse = await request("/api/participants/import", { method: "POST", body: xlsxForm });
    assert.equal((await xlsxResponse.json()).imported, 2);
  });
});

test("creates, swaps, deletes a participant, and preserves history across restarts", async () => {
  await withServer(async ({ request, restart }) => {
    const drawResult = await jsonRequest(request, "/api/draws", "POST", { mode: "groups", setting: 3 });
    assert.equal(drawResult.response.status, 201);
    const draw = drawResult.body.draw;
    assert.equal(draw.groups.length, 3);
    assert.equal(draw.groups.flatMap((group) => group.members).length, 12);

    const firstMember = draw.groups[0].members[0];
    const secondMember = draw.groups[1].members[0];
    const swappedResponse = await jsonRequest(request, `/api/draws/${draw.id}/swap`, "PATCH", {
      memberAId: firstMember.id,
      memberBId: secondMember.id
    });
    assert.equal(swappedResponse.response.status, 200);
    const swappedDraw = swappedResponse.body.draw;
    assert.equal(swappedDraw.groups[0].members[0].id, secondMember.id);
    assert.equal(swappedDraw.groups[1].members[0].id, firstMember.id);

    const deleted = await request(`/api/participants/${firstMember.participantId}`, { method: "DELETE" });
    assert.equal(deleted.status, 204);
    await restart();

    const persistedDraw = await request(`/api/draws/${draw.id}`);
    assert.equal(persistedDraw.status, 200);
    const reloaded = (await persistedDraw.json()).draw;
    const historicParticipant = reloaded.groups.flatMap((group) => group.members)
      .find((member) => member.id === firstMember.id);
    assert.equal(historicParticipant.name, firstMember.name);
    assert.equal(historicParticipant.participantId, null);

    const participants = await request("/api/participants");
    assert.equal((await participants.json()).participants.length, 11);
    const history = await request("/api/draws");
    assert.equal((await history.json()).draws[0].id, draw.id);
  });
});

test("does not reseed default participants after the participant list is emptied", async () => {
  await withServer(async ({ request, restart }) => {
    const response = await request("/api/participants");
    const { participants } = await response.json();
    for (const participant of participants) {
      const deleted = await request(`/api/participants/${participant.id}`, { method: "DELETE" });
      assert.equal(deleted.status, 204);
    }

    await restart();
    const afterRestart = await request("/api/participants");
    assert.equal((await afterRestart.json()).participants.length, 0);
  });
});
