export type DrawMode = "groups" | "size";

export interface Participant {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrawMember {
  id: number;
  participantId: number | null;
  name: string;
  position: number;
}

export interface DrawGroup {
  id: number;
  name: string;
  position: number;
  members: DrawMember[];
}

export interface Draw {
  id: string;
  createdAt: string;
  mode: DrawMode;
  setting: number;
  participantCount: number;
  groupCount: number;
  groups: DrawGroup[];
}

export interface DatabaseTables {
  participants: Array<Record<string, string | number | null>>;
  draws: Array<Record<string, string | number | null>>;
  draw_groups: Array<Record<string, string | number | null>>;
  draw_members: Array<Record<string, string | number | null>>;
}
