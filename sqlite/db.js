const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
// import sqlite3 from 'sqlite3'
// import { open } from 'sqlite'

const dbs = {};

const initDb = async () => {
  dbs.passDb = await open({
    filename: 'database/pass.db',
    driver: sqlite3.Database
  })

  try {
    await dbs.passDb.exec('CREATE TABLE pass ( \
                              id TEXT, \
                              name TEXT, \
                              url TEXT, \
                              subscriptions TEXT, \
                              startDate TEXT, endDate TEXT, \
                              startTs INT, endTs INT, \
                              retentionDate TEXT, retentionTs INT, \
                              passObject TEXT, \
                              createdOn TEXT, \
                              subscribed INT, \
                              activated INT, \
                              activationFailed INT, \
                              deactivated INT, \
                              deactivating INT, \
                              deactivationFailed INT, \
                              errors TEXT, \
                              expired INT, \
                              valid INT)')
  } catch (error) {
    if (error.message !== 'SQLITE_ERROR: table pass already exists') {
      console.log(error);
      process.exit(1);
    }
  }
  
  dbs.brokerDb = await open({
    filename: 'database/broker.db',
    driver: sqlite3.Database
  })
  
  try {
    await dbs.brokerDb.exec('CREATE TABLE broker ( \
                              id TEXT, \
                              name TEXT, url TEXT, vpn TEXT, user TEXT, pass TEXT, status INT, \
                              createdOn TEXT, lastTested TEXT)')
  } catch (error) {
    if (error.message !== 'SQLITE_ERROR: table broker already exists') {
      console.log(error);
      process.exit(1);
    }
  }

  dbs.logDb = await open({
    filename: 'database/log.db',
    driver: sqlite3.Database
  })

  try {
    await dbs.logDb.exec('CREATE TABLE log ( \
                              id TEXT, \
                              type TEXT, \
                              action TEXT, \
                              entry TEXT, \
                              entryDate TEXT, \
                              entryTs INT )');
  } catch (error) {
    if (error.message !== 'SQLITE_ERROR: table log already exists') {
      console.log(error);
      process.exit(1);
    }
  }

  console.log('Databases initialized');
}

const getPassDb = () => {
  return dbs.passDb;
}

const getLogDb = () => {
  return dbs.logDb;
}

const getBrokerDb = () => {
  return dbs.brokerDb;
}

module.exports = { initDb, getPassDb, getLogDb, getBrokerDb };