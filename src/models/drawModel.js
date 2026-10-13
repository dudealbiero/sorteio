"use strict";

function getDraw(db, drawId, userId) {
  const draw = db.prepare("SELECT * FROM draws WHERE id = ? AND user_id = ?").get(drawId, userId);
  if (!draw) return null;
  const groups = db.prepare(`
    SELECT id, name, position FROM draw_groups WHERE draw_id = ? ORDER BY position
  `).all(drawId).map((group) => ({
    id: group.id,
    name: group.name,
    position: group.position,
    members: db.prepare(`
      SELECT dm.id, dm.participant_id AS participantId,
             dm.participant_name AS name, dm.position
      FROM draw_members dm WHERE dm.group_id = ? ORDER BY dm.position
    `).all(group.id)
  }));
  return {
    id: draw.id,
    createdAt: draw.created_at,
    mode: draw.mode,
    setting: draw.setting,
    participantCount: draw.participant_count,
    groupCount: draw.group_count,
    groups
  };
}

function listDraws(db, userId, limit = 100) {
  return db.prepare("SELECT id FROM draws WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit).map(({ id }) => getDraw(db, id, userId));
}

function listDrawParticipants(db, userId) {
  return db.prepare("SELECT id, name FROM participants WHERE user_id = ? ORDER BY id").all(userId);
}

function createDraw(db, { drawId, userId, createdAt, mode, setting, participants, groupSizes }) {
  db.transaction(() => {
    db.prepare(`
      INSERT INTO draws (id, user_id, created_at, mode, setting, participant_count, group_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(drawId, userId, createdAt, mode, setting, participants.length, groupSizes.length);
    let offset = 0;
    groupSizes.forEach((size, index) => {
      const groupResult = db.prepare(`
        INSERT INTO draw_groups (draw_id, name, position) VALUES (?, ?, ?)
      `).run(drawId, `Grupo ${index + 1}`, index);
      const insertMember = db.prepare(`
        INSERT INTO draw_members (group_id, participant_id, participant_name, position)
        VALUES (?, ?, ?, ?)
      `);
      participants.slice(offset, offset + size).forEach((participant, position) => {
        insertMember.run(groupResult.lastInsertRowid, participant.id, participant.name, position);
      });
      offset += size;
    });
  })();
}

function findDrawMembersForSwap(db, drawId, userId, memberAId, memberBId) {
  return db.prepare(`
    SELECT dm.id, dm.group_id AS groupId, dm.position
    FROM draw_members dm
    JOIN draw_groups dg ON dg.id = dm.group_id
    JOIN draws d ON d.id = dg.draw_id
    WHERE dg.draw_id = ? AND d.user_id = ? AND dm.id IN (?, ?)
  `).all(drawId, userId, memberAId, memberBId);
}

function swapDrawMembers(db, members) {
  db.transaction(() => {
    db.prepare("UPDATE draw_members SET group_id = ?, position = ? WHERE id = ?")
      .run(members[1].groupId, members[1].position, members[0].id);
    db.prepare("UPDATE draw_members SET group_id = ?, position = ? WHERE id = ?")
      .run(members[0].groupId, members[0].position, members[1].id);
  })();
}

module.exports = {
  createDraw,
  findDrawMembersForSwap,
  getDraw,
  listDrawParticipants,
  listDraws,
  swapDrawMembers
};
