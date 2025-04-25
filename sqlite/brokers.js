const { getBrokerDb } = require('./db.js');

const getBrokers = async () => {
  const db = await getBrokerDb();
  const brokers = await db.all('SELECT * FROM broker');
  return brokers;
}

const getBroker = async (name) => {
  const db = await getBrokerDb();
  const brokers = await db.all('SELECT * FROM broker WHERE name = ?', [name]);
  return brokers && brokers.length > 0 ? brokers[0] : null;
}

const createBroker = async (broker) => {
  const db = await getBrokerDb();
  var exists = await db.get('SELECT * FROM broker WHERE name = ?', [broker.name]);
  if (exists) {
    return `Broker '${broker.name}' already exists`;
  }

  var failed = false;
  try {
    await fetch(`${broker.url}/about/user/msgVpns/${broker.vpn}`, {
      method: "GET",
      credentials: 'same-origin',
      cache: 'no-cache',
      mode: "cors",      
      headers: {
        accept: 'application/json;charset=UTF-8',
        'content-type': 'application/json',
        'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
      },
    })
    .then(async (response) => {
      const data = await response.json();
      if (data.meta.error) {
        failed = `Error: ${data.meta.error.description.split('Problem with GET: ').pop()}`;
      } else {
        let result = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    }

    await db.run('INSERT INTO broker (id, name, url, vpn, user, pass, status, createdOn, lastTested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                [broker.id, broker.name, broker.url, broker.vpn, broker.user, broker.pass, 1, new Date().toISOString(), new Date().toISOString()]);
    return;
  } catch (error) {
    console.log(error);
    return error.toString();
  }
  
}

const updateBroker = async (broker) => {
  const db = await getBrokerDb();
  var exists = await db.get('SELECT * FROM broker WHERE name = ?', [broker.name]);
  if (!exists) {
    return `Broker '${broker.name}' does not exist`;
  }

  var failed = false;
  try {
    await fetch(`${broker.url}/about/user/msgVpns/${broker.vpn}`, {
      method: "GET",
      credentials: 'same-origin',
      cache: 'no-cache',
      mode: "cors",      
      headers: {
        accept: 'application/json;charset=UTF-8',
        'content-type': 'application/json',
        'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
      },
    })
    .then(async (response) => {
      const data = await response.json();
      if (data.meta.error) {
        failed = `Error: ${data.meta.error.description.split('Problem with GET: ').pop()}`;
      } else {
        let result = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    }
    await db.run(`UPDATE broker SET id = '${broker.id}', name = '${broker.name}', \
                    url = '${broker.url}', vpn = '${broker.vpn}', user = '${broker.user}', pass = '${broker.pass}', \
                    status = 1, lastTested = '${new Date().toISOString()}' WHERE name = '${broker.name}'`);
    return;
  } catch (error) {
    console.log(error);
    return error.toString();
  }
  
}

const testBroker = async (name) => {
  const db = await getBrokerDb();
  var broker = await db.get('SELECT * FROM broker WHERE name = ?', [name]);
  
  var failed = false;
  try {
    await fetch(`${broker.url}/about/user/msgVpns/${broker.vpn}`, {
      method: "GET",
      credentials: 'same-origin',
      cache: 'no-cache',
      mode: "cors",      
      headers: {
        accept: 'application/json;charset=UTF-8',
        'content-type': 'application/json',
        'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
      },
    })
    .then(async (response) => {
      const data = await response.json();
      if (data.meta.error) {
        failed = `Error: ${data.meta.error.description.split('Problem with GET: ').pop()}`;
      } else {
        let result = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    await db.run(`UPDATE broker SET status = ${failed ? 0 : 1}, lastTested = '${new Date().toISOString()}' WHERE name = '${broker.name}'`);
    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    }
  } catch (error) {
    console.log(error);
    return error.toString();
  }
  
}

const deleteBroker = async (name) => {
  const db = await getBrokerDb();
  await db.run('DELETE FROM broker WHERE name = ?', [name]);
}

module.exports = { getBroker, getBrokers, createBroker, updateBroker, testBroker, deleteBroker};