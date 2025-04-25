const { getPassDb } = require('./db.js');

const getActivePasses = async () => {
  try {
    const db = await getPassDb();
    const now = Date.parse(new Date());
    const passes = await db.all(`SELECT * FROM pass where ${now} >= startTs AND expired = 0`);
    return passes;
  } catch (error) {
    console.log('Error getting active passes', error);
    return [];
  }
}

const getPendingPasses = async () => {
  try {
    const db = await getPassDb();
    const now = Date.parse(new Date());
    const passes = await db.all(`SELECT * FROM pass where ${now} < startTs AND expired = 0`);
    return passes;
  } catch (error) {
    console.log('Error getting pending passes', error);
    return [];
  }
}

const getExpiredPasses = async () => {
  try {
    const db = await getPassDb();
    const now = Date.parse(new Date());
    const passes = await db.all(`SELECT * FROM pass where expired = 1`);
    return passes;
  } catch (error) {
    console.log('Error getting expired passes', error);
    return [];
  }
}

const getAllPasses = async () => {
  try {
    const db = await getPassDb();
    const passes = await db.all(`SELECT * FROM pass`);
    return passes;
  } catch (error) {
    console.log('Error getting all passes', error);
    return [];
  }
}

const getPasses = async (status) => {
  if (status === 'active') {
    return getActivePasses();
  } else if (status === 'expired') {
    return getExpiredPasses();
  } else if (status === 'pending') {
    return getPendingPasses();
  } else {
    return getAllPasses();
  }
}

const getPass = async (name) => {
  try {
    const db = await getPassDb();
    const pass = await db.get('SELECT * FROM pass WHERE name = ?', [name]);
    return pass;
  } catch (error) {
    console.log('Error getting pass', error);
    return null;
  }
}

const createPass = async (pass) => {
  try {
    const db = await getPassDb();
    var exists = await db.get('SELECT * FROM pass WHERE name = ?', [pass.name]);
    if (exists) {
      return `Pass '${pass.name}' already exists`;
    }

    await db.run('INSERT INTO pass (id, name, url, subscriptions, startDate, startTs, endDate, endTs, \
                                  retentionDate, retentionTs, passObject, createdOn, subscribed, deactivated, deactivationFailed, \
                                  deactivating, activated, activationFailed, \
                                  errors, expired, valid) \
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, \
                                  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \
                                  ?, ?, ?)',
                                [pass.id, pass.name, pass.url, pass.subscriptions, pass.startDate, pass.startTs, pass.endDate, pass.endTs,
                                pass.retentionDate, pass.retentionTs, pass.passObject, new Date().toISOString(), 0, 0, 0, 0, 0, 0,
                                JSON.stringify([]), 0, pass.valid]);

    return false;
  } catch (error) {
    console.log('Error creating pass', error);
    return error;
  }
}

const updatePassValidity = async (pass) => {
  try {
    const db = await getPassDb();
    var exists = await db.get('SELECT * FROM pass WHERE name = ?', [pass.name]);
    if (!exists) {
      return `Pass '${pass.name}' does not exist`;
    }
    await db.run(`UPDATE pass SET name = '${pass.name}', startDate = '${pass.startDate}', startTs = '${pass.startTs}', 
      endDate = '${pass.endDate}', endTs = '${pass.endTs}', retentionDate = '${pass.retentionDate}', retentionTs = '${pass.retentionTs}',
      passObject = '${pass.passObject}',
      valid = ${pass.valid}, expired = ${pass.expired}, subscribed = ${pass.subscribed},
      deactivated = ${pass.deactivated}, deactivating = ${pass.deactivating}, deactivationFailed = ${pass.deactivationFailed},
      activated = ${pass.activated}, activationFailed = ${pass.activationFailed}, 
      errors = '${pass.errors}'
      WHERE name = '${pass.name}'`);
    return false;
  } catch (error) {
    console.log('Error updating pass', error);
    return error;
  }
}

const deletePass = async (name) => {
  try {
    const db = await getPassDb();
    await db.run('DELETE FROM pass WHERE name = ?', [name]);
    return false;
  } catch (error) {
    console.log('Error deleting pass', error);
    return error;
  }
}

module.exports = { getPass, getPasses, getActivePasses, getPendingPasses, getExpiredPasses, createPass, updatePassValidity, deletePass};