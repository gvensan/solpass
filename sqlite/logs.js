const { getLogDb } = require('./db.js');

const getLogEntries = async () => {
  const db = await getLogDb();
  const entries = await db.all(`SELECT * FROM log ORDER BY entryTs DESC`);
  return entries;
}

const logInfoEntry = async (entry, action = "") => {
  const ts = Date.now();
  const db = await getLogDb();
  await db.run('INSERT INTO log (type, action, entry, entryDate, entryTs) \
                VALUES (?, ?, ?, ?, ?)',
                ['info', action, entry, new Date(ts).toLocaleString(), ts]);
  return;
}

const logErrorEntry = async (entry, action = "") => {
  const ts = Date.now();
  const db = await getLogDb();
  await db.run('INSERT INTO log (type, action, entry, entryDate, entryTs) \
                VALUES (?, ?, ?, ?, ?)',
                ['error', action, entry, new Date(ts).toLocaleString(), ts]);
  return;
}
const emptyLogs = async (ts) => {
  const db = await getLogDb();
  if (ts)
    await db.run('DELETE FROM log WHERE entryTs < ?', [ts]);
  else
    await db.run('DELETE FROM log');
  return;
}

module.exports = { getLogEntries, logInfoEntry, logErrorEntry, emptyLogs };