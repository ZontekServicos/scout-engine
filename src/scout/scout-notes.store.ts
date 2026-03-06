type ScoutNote = {
  id: string;
  playerId: string;
  note: string;
  createdBy: string;
  createdAt: string;
};

const notes: ScoutNote[] = [];

export function addScoutNote(playerId: string, note: string, createdBy: string): ScoutNote {
  const entry: ScoutNote = {
    id: `${playerId}-${Date.now()}`,
    playerId,
    note,
    createdBy,
    createdAt: new Date().toISOString(),
  };

  notes.unshift(entry);
  return entry;
}

export function getScoutNotes(playerId: string): ScoutNote[] {
  return notes.filter((item) => item.playerId === playerId);
}

