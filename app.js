const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const path = require("path");
const { initDb } = require('./sqlite/db.js');
const { createBroker, updateBroker, getBroker, getBrokers, deleteBroker, testBroker } = require('./sqlite/brokers.js');
const { createPass, updatePassValidity, getActivePasses, getPendingPasses, getExpiredPasses, deletePass, getPass } = require('./sqlite/passes.js');
const { getLogEntries, logInfoEntry, logErrorEntry, emptyLogs } = require('./sqlite/logs.js');
const app = express()
const CRON_PASS_CHECK = 30000;

var bodyParser = require('body-parser');
const { create } = require("domain");
const { fail } = require("assert");

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

// Static Files
app.use(express.static(path.join(__dirname, "/static")));

// Set Templating Engine
app
  .use(expressLayouts)
  .set("view engine", "ejs")
  .set("views", path.join(__dirname, "/content"));

app.get("/", async (req, res) => {
  // res.render("index", {
  //   layout: path.join(__dirname, "/layouts/dashboard"),
  //   footer: true,
  // });
  const brokers = await getBrokers();
  res.render("solpass/brokers", {
    layout: path.join(__dirname, "/layouts/dashboard"),
    footer: false,
    brokers
  });  
});

app.get("/settings", (req, res) => {
  res.render("settings", {
    layout: path.join(__dirname, "/layouts/dashboard"),
    footer: true,
  });
});

// ------------------------------------------------ //
// GET RESOURCES

app.get("/getbrokers", async (req, res) => {
  const brokers = await getBrokers();
  return res.send(brokers);
});

app.get("/getclientprofiles", async (req, res) => {
  const broker = await getBroker(req.query.broker);
  var failed = false;
  var clientprofiles = [];
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/clientProfiles`, {
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
      failed = `Error: ${data.meta.error.description}`;
    } else {
      clientprofiles = data.data.filter((profile) => !profile.clientProfileName.startsWith('#'));
    }
  })
  .catch((error) => {
    failed = `${error.toString()}`;
  });

  if (failed) {
    console.log(failed);
    res.statusMessage = `Get Client Profiles failed - '${failed}'`
    res.status(500).end();
  } else {
    if (clientprofiles?.length > 0) {
      res.send(clientprofiles);
    } else {
      res.statusMessage = `Get Client Profiles failed`
      res.status(500).end();      
    }    
  }
});

const getQueueSubscriptions = async (broker, name) => {
  var failed = false;
  var subscriptions = [];
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues/${encodeURIComponent(name)}/subscriptions`, {
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
      failed = `Error: ${data.meta.error.description}`;
    } else {
      var subs = data.data;
      subscriptions = subs.map((sub) => { return sub.subscriptionTopic });
    }
  })
  .catch((error) => {
    failed = `${error.toString()}`;
  });

  return { subscriptions, failed};
};

const getQueues = async (broker) => {
  var failed = false;
  var queues = [];
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues`, {
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
      failed = `Error: ${data.meta.error.description}`;
    } else {
      queues = data.data;
      for (var i=0; i<queues.length; i++) {
        const response = await getQueueSubscriptions(broker, queues[i].queueName);
        if (response.failed) {
          failed = response.failed;
          break;
        } else {
          queues[i].subscriptions = response.subscriptions.join(', ');
        }
      }
    }
  })
  .catch((error) => {
    failed = `${error.toString()}`;
  });

  return { queues, failed};
};

app.get("/getqueuesubscriptions", async (req, res) => {
  const broker = await getBroker(req.query.broker);
  const response = await getQueueSubscriptions(broker, req.query.queue);
  if (response.failed) {
    console.log(response.failed);
    res.statusMessage = `Get REST Delivery Points failed - '${response.failed}'`
    res.status(500).end();
  } else {
    res.send(response.subscriptions);
  }
});

app.get("/getqueues", async (req, res) => {
  const broker = await getBroker(req.query.broker);
  const response = await getQueues(broker, req.query.queue);
  if (response.failed) {
    console.log(response.failed);
    res.statusMessage = `Get REST Delivery Points failed - '${response.failed}'`
    res.status(500).end();
  } else {
    res.send(response.queues);
  }
});

const getRestDeliveryPoints = async (name) => {
  const broker = await getBroker(name);
  var failed = false;
  var rdps = [];
  var url = broker.url.replace('\/config', '\/__private_monitor__');
  await fetch(`${url}/msgVpns/${broker.vpn}/restDeliveryPoints`, {
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
      failed = `Error: ${data.meta.error.description}`;
    } else {
      rdps = data.data;
    }
  })
  .catch((error) => {
    failed = `${error.toString()}`;
  });

  return { rdps, failed};
};

app.get("/getrestdeliverypoints", async (req, res) => {
  const response = await getRestDeliveryPoints(req.query.broker);
  if (response.failed) {
    console.log(response.failed);
    res.statusMessage = `Get REST Delivery Points failed - '${response.failed}'`
    res.status(500).end();
  } else {
    res.send(response.rdps);
  }
});

app.get("/getrdpqueuebindings", async (req, res) => {
  const broker = await getBroker(req.query.broker);  
  var rdps = [];
  const response = await getRestDeliveryPoints(req.query.broker);
  if (response.failed) {
    console.log(response.failed);
    res.statusMessage = `Get REST Delivery Points failed (pre-queue-binding fetch) - '${response.failed}'`
    res.status(500).end();
  } else {
    rdps = response.rdps;
  }

  var rdpQueueBindings = [];
  var failed = false;
  for (var i=0; i<rdps.length; i++) {
    await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints/${rdps[i].restDeliveryPointName}/queueBindings`, {
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
        failed = `Error: ${data.meta.error.description}`;
      } else {
        var qbs = data.data;
        qbs.forEach((qb) => {
           rdpQueueBindings.push(qb);
        });
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) break
  }

  if (failed) {
    console.log(failed);
    res.statusMessage = `Get RDP Queue Bindings failed - '${failed}'`
    res.status(500).end();
  } else {
    if (rdpQueueBindings?.length > 0) {
      res.send(rdpQueueBindings);
    } else {
      res.statusMessage = `Get RDP Queue Bindings failed`
      res.status(500).end();      
    }
  }
});

app.get("/getrdprestconsumers", async (req, res) => {
  const broker = await getBroker(req.query.broker);  
  var rdps = [];
  const response = await getRestDeliveryPoints(req.query.broker);
  if (response.failed) {
    console.log(response.failed);
    res.statusMessage = `Get REST Delivery Points failed (pre-rest-consumers fetch) - '${response.failed}'`
    res.status(500).end();
  } else {
    rdps = response.rdps;
  }

  var rdpRestConsumers = [];
  var failed = false;
  for (var i=0; i<rdps.length; i++) {
    await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints/${rdps[i].restDeliveryPointName}/restConsumers`, {
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
        failed = `Error: ${data.meta.error.description}`;
      } else {
        var qbs = data.data;
        qbs.forEach((qb) => {
          rdpRestConsumers.push(qb);
        });
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) break
  }

  if (failed) {
    console.log(failed);
    res.statusMessage = `Get RDP REST Consumers failed - '${failed}'`
    res.status(500).end();
  } else {
    if (rdpRestConsumers?.length > 0) {
      res.send(rdpRestConsumers);
    } else {
      res.statusMessage = `Get RDP REST Consumers failed`
      res.status(500).end();      
    }
  }
});

// ------------------------------------------------ //
// GET PAGES
app.get("/logs", async (req, res) => {
  const logs = await getLogEntries();
  res.render("solpass/logs", {
    layout: path.join(__dirname, "/layouts/dashboard"),
    footer: false,
    logs
  });
});

app.post('/logs/empty', async (req, res) => {
  await emptyLogs(req.query.ts);
  res.status(200).end();
});

// BROKERS
app.get("/brokers", async (req, res) => {
  const brokers = await getBrokers();
  res.render("solpass/brokers", {
    layout: path.join(__dirname, "/layouts/dashboard"),
    footer: false,
    brokers
  });
});

app.put("/brokers", async (req, res) => {
  const broker = req.body;
  var error = await updateBroker(broker);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `Broker updated`;
    res.status(200).end();
  }
});

app.post("/brokers", async (req, res) => {
  const broker = req.body;
  var error = await createBroker(broker);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `Broker created`;
    res.status(200).end();
  }
});

app.post("/brokers/test", async (req, res) => {
  const broker = req.query.broker;
  var error = await testBroker(broker);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `Broker created`;
    res.status(200).end();
  }
});

app.delete("/brokers", async (req, res) => {
  const name = req.query.broker;
  var error = await deleteBroker(name);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `Broker deleted`;
    res.status(200).end();
  }
});

// CLIENT PROFILES
app.get("/clientprofiles", async (req, res) => {
  var clientprofiles = [];
  var failed = false;
  if (!req.query.broker) {
    res.render("solpass/clientprofiles", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      clientprofiles
    });
    return;
  }

  var broker = await getBroker(req.query.broker);
  try {
    await fetch(`${broker.url}/msgVpns/${broker.vpn}/clientProfiles`, {
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
        failed = `Error: ${data.meta.error.description}`;
      } else {
        clientprofiles = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    } else {
      if (clientprofiles?.length > 0) {
        res.send(clientprofiles);
      } else {
        res.statusMessage = `Get Client Profiles failed`
        res.status(500).end();      
      }  
    }
  } catch (error) {
    console.log(error);
    return error.toString();
  }

  res.render("solpass/clientprofiles", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      clientprofiles
    });
});

// QUEUES
app.get("/queues", async (req, res) => {
  var queues = [];
  var failed = false;
  if (!req.query.broker) {
    res.render("solpass/queues", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      queues
    });
    return;
  }

  var broker = await getBroker(req.query.broker);
  try {
    await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues`, {
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
        failed = `Error: ${data.meta.error.description}`;
      } else {
        queues = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    } else {
      if (queues?.length > 0) {
        res.send(queues);
      } else {
        res.statusMessage = `Get Queues failed`
        res.status(500).end();      
      }
    }
  } catch (error) {
    console.log(error);
    return error.toString();
  }

  res.render("solpass/queues", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      queues
    });
});

// REST DELIVERY POINTS
app.get("/restdeliverypoints", async (req, res) => {
  var restDeliveryPoints = [];
  var failed = false;
  if (!req.query.broker) {
    res.render("solpass/rdps", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      rdps: restDeliveryPoints
    });
    return;
  }

  var broker = await getBroker(req.query.broker);
  try {
    await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints`, {
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
        failed = `Error: ${data.meta.error.description}`;
      } else {
        restDeliveryPoints = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    } else {
      if (restDeliveryPoints?.length > 0) {
        res.send(restDeliveryPoints);
      } else {
        res.statusMessage = `Get REST Delivery Points failed`
        res.status(500).end();      
      }
    }
  } catch (error) {
    console.log(error);
    return error.toString();
  }

  res.render("solpass/rdps", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      rdps: restDeliveryPoints
    });
});

// RDP QUEUE BINDINGS
app.get("/rdpqueuebindings", async (req, res) => {
  var rdpQueueBindings = [];
  var failed = false;
  if (!req.query.broker) {
    res.render("solpass/rdpqueuebindings", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      rdpQueueBindings
    });
    return;
  }

  var broker = await getBroker(req.query.broker);
  var rdp = req.query.rdp;
  try {
    await fetch(`${broker.url}/msgVpns/${broker.vpn}/${rdp}/queueBindings`, {
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
        failed = `Error: ${data.meta.error.description}`;
      } else {
        rdpQueueBindings = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    } else {
      if (rdpQueueBindings?.length > 0) {
        res.send(rdpQueueBindings);
      } else {
        res.statusMessage = `Get RDP Queue Bindings failed`
        res.status(500).end();      
      }
    }
  } catch (error) {
    console.log(error);
    return error.toString();
  }

  res.render("solpass/rdpqueuebindings", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      rdpQueueBindings
    });
});

// RDP REST CONSUMERS
app.get("/rdprestconsumers", async (req, res) => {
  var rdpQueueBindings = [];
  var failed = false;
  if (!req.query.broker) {
    res.render("solpass/rdprestconsumers", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      rdpQueueBindings
    });
    return;
  }

  var broker = await getBroker(req.query.broker);
  var rdp = req.query.rdp;
  try {
    await fetch(`${broker.url}/msgVpns/${broker.vpn}/${rdp}/queueBindings`, {
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
        failed = `Error: ${data.meta.error.description}`;
      } else {
        rdpQueueBindings = data.data;
        console.log('Result:', result);
      }
    })
    .catch((error) => {
      failed = `${error.toString()}`;
    });

    if (failed) {
      console.log('Broker validation failed:', failed);
      return failed;
    } else {
      if (rdpQueueBindings?.length > 0) {
        res.send(rdpQueueBindings);
      } else {
        res.statusMessage = `Get RDP Queue Bindings failed`
        res.status(500).end();      
      }
    }
  } catch (error) {
    console.log(error);
    return error.toString();
  }

  res.render("solpass/rdpqueuebindings", {
      layout: path.join(__dirname, "/layouts/dashboard"),
      footer: false,
      rdpQueueBindings
    });
});

//  PASSES
app.get("/passes/active", async (req, res) => {
  const passes = await getActivePasses();
  res.render("solpass/passes", {
    layout: path.join(__dirname, "/layouts/dashboard"),
    footer: false,
    passes
  });
});

app.get("/passes/pending", async (req, res) => {
  const passes = await getPendingPasses();
  res.render("solpass/passes", {
    layout: path.join(__dirname, "/layouts/dashboard"),
    footer: false,
    passes
  });
});

app.get("/passes/expired", async (req, res) => {
  const passes = await getExpiredPasses();
  res.render("solpass/passes", {
    layout: path.join(__dirname, "/layouts/dashboard"),
    footer: false,
    passes
  });
});

app.put("/passes/validity", async (req, res) => {
  const pass = req.body;
  var error = await updatePassValidity(pass);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `SolPass validity updated`;
    res.status(200).end();
  }
});

app.get("/passes/checkname", async (req, res) => {
  var pass = await getPass(req.query.pass);
  if (pass) {
    if (pass.valid) {
      res.statusMessage = `SolPass name exists, and currently in use`;
      res.status(500).end();
    } else {
      res.statusMessage = `SolPass name exists, and currently not in use (expired). Delete the pass to reuse the name`;
      res.status(500).end();
    }
  } else {
    res.status(200).end();
  }
});

const expirePass = async (pass, flags) => {
  var passObject = JSON.parse(pass.passObject);
  var broker = await getBroker(passObject.step2.currentBroker);
  
  pass.deactivating = 1;
  await updatePassValidity(pass);

  var failed = false;
  if (!failed && flags.deleteRDP) {
    failed = await deleteRDP(broker, passObject.step3.rdpName);
    if (failed)
      logErrorEntry(`Failed to delete RDP for pass '${pass.name}' - '${failed}'`, 'deleteRDP')
    else
      logInfoEntry(`Successfully deleted RDP for pass '${pass.name}'`, 'deleteRDP')
  }

  if (!failed && flags.deleteQ && passObject.step2.qMode === 'create') {
    failed = await deleteQueue(broker, passObject.step2.currentQueue);
    if (failed)
      logErrorEntry(`Failed to delete queue for pass '${pass.name}' - '${failed}'`, 'deleteQueue')
    else
      logInfoEntry(`Successfully deleted queue for pass '${pass.name}'`, 'deleteQueue')
  }

  if (!failed && flags.deleteCP && passObject.step2.cpMode === 'create') {
    failed = await deleteClientProfile(broker, passObject.step2.currentClientProfile);
    if (failed)
      logErrorEntry(`Failed to delete client profile for pass '${pass.name}' - '${failed}'`, 'deleteClientProfile') 
    else
      logInfoEntry(`Successfully deleted client profile for pass '${pass.name}'`, 'deleteClientProfile')
  }

  if (!failed && !flags.deleteQ) {
    var subs = passObject.step3.subscriptions ? passObject.step3.subscriptions.split(',').map(t => t.trim()) : []; 
    failed = await removeQueueSubscriptions(broker, passObject.step2.currentQueue, subs);
    if (failed)
      logErrorEntry(`Failed to delete queue subscriptions for pass '${pass.name}' - '${failed}'`, 'deleteQueueSubscriptions')
    else
      logInfoEntry(`Successfully deleted queue subscriptions for pass '${pass.name}'`, 'deleteQueueSubscriptions')
  }

  pass.expired = 1;
  pass.deactivated = 1;
  pass.subscribed = 0;
  pass.deactivationFailed = failed ? 1 : 0;

  await updatePassValidity(pass);
  return failed;
}

app.post("/passes/expire", async (req, res) => {
  var pass = await getPass(req.query.pass);
  const flags = req.body;
  var error = await expirePass(pass, flags);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `SolPass expired forcefully`;
    res.status(200).end();
  }
});

app.post("/passes", async (req, res) => {
  const pass = req.body;
  var error = await createPass(pass);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `SolPass created`;
    res.status(200).end();
  }
});

app.post("/passes/reactivate", async (req, res) => {
  const pass = req.body;
  var error = await updatePassValidity(pass);
  if (error) {
    console.log(error);
    res.statusMessage = `${error.toString()}`
    res.status(500).end();
  } else {
    res.statusMessage = `SolPass reactivated`;
    res.status(200).end();
  }
});

app.delete("/passes", async (req, res) => {
  var pass = await getPass(req.query.pass);
  var passObject = JSON.parse(pass.passObject);
  var broker = await getBroker(passObject.step2.currentBroker);
  var failed = false;
  req.body.deleteRDP && await deleteRDP(broker, passObject.step3.rdpName);
  req.body.deleteQ && passObject.step2.qMode === 'create' && await deleteQueue(broker, passObject.step2.currentQueue);
  req.body.deleteCP && passObject.step2.cpMode === 'create' && await deleteClientProfile(broker, passObject.step2.currentClientProfile);

  if (!failed) {
    var error = await deletePass(req.query.pass);
    if (error) {
      console.log(error);
      res.statusMessage = `${error.toString()}`
      res.status(500).end();
    } else {
      res.statusMessage = `SolPass deleted`;
      res.status(200).end();
    }
  } else {
    console.log(failed);
    res.statusMessage = `${failed}`
    res.status(500).end();
  }
});

app.post("/webhook", async (req, res) => {
  const data = req.body;
  console.log('Webhook invoked with data: ', data);
  res.status(200).end();
});

// initialize db
initDb();

// ------------------------------------------------ //
// EXECUTION
// test solpass steps
app.post("/exec/broker/test", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  await fetch(`${broker.url}/msgVpns/${broker.vpn}`, {
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
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      res.status(200).end();
    }
  })
  .catch((error) => {
    res.statusMessage = `Failed: '${error.toString()}'`
    res.status(500).end();
  });  
});

// test solpass steps - client profile
const testClientProfile = async (broker, clientProfileName) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/clientProfiles/${clientProfileName}`, {
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
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

app.post("/exec/clientprofile/test", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var result = await testClientProfile(broker, req.query.clientprofile);
  if (result.success) {
    res.status(200).end();
  } else {
    res.statusMessage = `Failed: '${result.error.toString()}'`
    res.status(500).end();
  }
});

const createClientProfile = async (broker, clientProfileObject) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/clientProfiles`, {
    method: "POST",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      ...clientProfileObject
    })
  })
  .then(async (response) => {
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  

}

// create solpass setps - client profile
app.post("/exec/clientprofile/create", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var result = await createClientProfile(broker, req.body);
  if (result.success) {
    const data = await result.response.json();
    if (data.meta.error) {
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      res.status(200).end();
    }
  } else {
    res.statusMessage = `Failed: '${result.error.toString()}'`
    res.status(500).end();
  }
});

// delete solpass steps - client profile
const deleteClientProfile = async (broker, clientprofile) => {
  var failed = false;
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/clientProfiles/${clientprofile}`, {
    method: "DELETE",
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
    if (data.meta.error && !data.meta.error.description.startsWith('Could not find match for')) {
      failed = `Failed: '${data.meta.error.description}'`;
    }
  })
  .catch((error) => {
    failed = `Failed: '${error.toString()}'`
  });

  return failed;
}

app.post("/exec/clientprofile/delete", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var failed = await deleteClientProfile(broker, req.query.clientprofile);
  if (failed) {
    res.statusMessage = failed;
    res.status(500).end();
  } else {
    res.status(200).end();
  }
});

// test solpass steps - queue
const testQueue = async (broker, queueName) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues/${queueName}`, {
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
    var curr = await getQueueSubscriptions(broker, queueName);
    if (curr.failed) {
      res.statusMessage = `Failed: could not get current subscriptions of queue ${req.query.queue} on broker ${req.query.broker}`;
      res.status(500).end();
    }

    curr.subscriptions.forEach(async (sub) => {
      await removeSubscription(broker, queueName, sub);
    });

    return { success: true };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

app.post("/exec/queue/test", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var result =  await testQueue(broker, req.query.queue);
  if (result.success) {
    res.status(200).end();
  } else {
    res.statusMessage = `Failed: could not verify queue ${req.query.queue} on broker ${req.query.broker}`;
    res.status(500).end();
  }
});

const addQueueSubscriptions = async (broker, queue, subscriptions) => {
  var success = true
  for (var i=0; i<subscriptions.length; i++) {
    addSubscription(broker, queue, subscriptions[i]);
    // var result = false;
    // if (!result) {
    //   for (var j=0; j<i; j++) {
    //     await removeSubscription(broker, queue, subscriptions[j]);
    //   }
    //   success = false;
    //   break;
    // }
  }

  return success;
}

const addSubscription = async (broker, queue, subscription) => {
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues/${queue}/subscriptions`, {
    method: "POST",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      queueName: queue,
      subscriptionTopic: subscription
    })
  })
  .then(async (response) => {
    const data = await response.json();
    if (data?.meta?.error) {
      logErrorEntry(`Failed to add subscription '${subscription}' to queue '${queue}' on broker '${broker.vpn}' - ${data.meta.error.description}'`, 'subscribe');
      console.log(`Failed to add subscription '${subscription}' to queue '${queue}' on broker '${broker.vpn}' - ${data.meta.error.description}'`);
      return false;
    }

    return true;
  })
  .catch((error) => {
    logErrorEntry(`Failed to add subscription '${subscription}' to queue '${queue}' on broker '${broker.vpn}' - ${error.toString()}`, 'subscribe');
    console.log(`Failed to add subscription '${subscription}' to queue '${queue}' on broker '${broker.vpn}' - ${error.toString()}`);
    return false;
  });  
}

const removeQueueSubscriptions = async (broker, queue, subscriptions) => {
  var success = true
  for (var i=0; i<subscriptions.length; i++) {
    await removeSubscription(broker, queue, subscriptions[i]);
    // var result = false;
    // if (!result) {
    //   for (var j=0; j<i; j++) {
    //     await addSubscription(broker, queue, subscriptions[j]);
    //   }
    //   success = false;
    //   break;
    // }
  }

  return success;
}

const removeSubscription = async (broker, queue, subscription) => { 
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues/${queue}/subscriptions/${encodeURIComponent(subscription)}`, {
    method: "DELETE",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    }
  })
  .then(async (response) => {
    const data = await response.json();
    if (data?.meta?.error) {
      logErrorEntry(`Failed to remove subscription '${subscription}' to queue '${queue} on broker '${broker.vpn} - ${data.meta.error.description}'`, 'unsubscribe');
      console.log(`Failed to remove subscription '${subscription}' to queue '${queue} on broker '${broker.vpn} - ${data.meta.error.description}'`);
    }
  })
  .catch((error) => {
    logErrorEntry(`Failed to remove subscription '${subscription}' to queue '${queue} on broker '${broker.vpn}' - ${error.toString()}`, 'unsubscribe');
    console.log(`Failed to remove subscription '${subscription}' to queue '${queue} on broker '${broker.vpn}' - ${error.toString()}`);
  });  
}

app.post("/exec/webhook/test", async (req, res) => {
  var { target, method, host, port, tls } = req.body;
  target = target.startsWith('/') ? target.slice(1) : target;
  var url = `${tls ? 'https' : 'http'}://${host}:${port}/${target}`;
  try {
    await fetch(url, {
      method: method,
      credentials: 'same-origin',
      cache: 'no-cache',
      mode: "cors",
      headers: {
        accept: 'application/json;charset=UTF-8',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ message: "Testing webhook endpoint for SolPass"})
    })
    res.send('Webhook test successful');
  } catch (error) {
    res.statusMessage = `Failed: Unable to reach webhook URL ${url} - ${error.toString()}`;
    res.status(500).end();
  }
});

// create solpass steps - queue
const createOrUpdateQueue = async (broker, queueObj, activation = false) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues`, {
    method: activation ? "PUT" : "POST",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      ...queueObj
    })
  })
  .then(async (response) => {
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

// create solpass steps - activate queue
const activateQueue = async (broker, queueObj, subs = '') => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues/${queueObj.queueName}`, {
    method: "PATCH",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      ...queueObj
    })
  })
  .then(async (response) => {
    var subscriptions = subs.split(',').map(sub => sub.trim());
    if (subscriptions.length) {
      subsResult = await addQueueSubscriptions(broker, queueObj.queueName, subscriptions);
      if (!subsResult) {
        logErrorEntry(`Failed to add subscriptions for queue '${queueObj.queueName}' on broker '${broker.vpn}'`, 'subscribe')
        return { success: false, error: `Failed to add subscriptions` };  
      }
    }
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

const deactivateQueue = async (broker, queueObj, subs = '') => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues/${queueObj.queueName}`, {
    method: "PATCH",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      ...queueObj
    })
  })
  .then(async (response) => {
    var subscriptions = subs.split(',').map(sub => sub.trim());
    if (subscriptions.length) {
      subsResult = await removeQueueSubscriptions(broker, queueObj.queueName, subscriptions);
      if (!subsResult) {
        logErrorEntry(`Failed to add subscriptions for queue '${queueObj.queueName}' on broker '${broker.vpn}'`, 'subscribe')
        return { success: false, error: `Failed to add subscriptions` };  
      }
    }
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

const emptyRetainedMessages = async (broker, queueObj) => {
  const url = broker.url.split('/');
  url.pop();
  url.push('action');

  let failed = false;
  return await fetch(`${url.join('/')}/msgVpns/${broker.vpn}/queues/${queueObj.queueName}/deleteMsgs`, {
    method: "PUT",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    }
  })
  .then(async (response) => {
    const data = await response.json();
    if (data.meta.error) {
      failed = `Failed: '${data.meta.error.description}'`;
    }
    return { success: !failed, response: failed ? failed : data };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

app.post("/exec/queue/create", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var queueObj = req.body;
  var subscriptions = queueObj.subscriptions ? queueObj.subscriptions.split(', ') : [];
  delete queueObj.subscriptions;

  var result = await createOrUpdateQueue(broker, req.body)
  if (result.success) {
    const data = await result.response.json();
    if (data.meta.error) {
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      if (subscriptions.length) {
        subsResult = await addQueueSubscriptions(broker, queueObj.queueName, subscriptions);
        if (!subsResult) {
          logErrorEntry(`Failed to add subscriptions for queue '${queueObj.queueName}' on broker '${broker.vpn}'`, 'subscribe')
        }
      }

      res.status(200).end();
    }
  } else {
    res.statusMessage = `Failed: to create/update queue '${result.error.toString()}'`
    res.status(500).end();
  }
});

// delete solpass steps - queue
const deleteQueue = async (broker, queueName) => {
  var failed = false;
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/queues/${queueName}`, {
    method: "DELETE",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    }
  })
  .then(async (response) => {
    const data = await response.json();
    if (data.meta.error && !data.meta.error.description.startsWith('Could not find match for')) {
      failed = `Failed: '${data.meta.error.description}'`;
    }
  })
  .catch((error) => {
    failed = `Failed: '${error.toString()}'`
  });

  return failed;
}

app.post("/exec/queue/delete", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var failed = await deleteQueue(broker, req.query.queue);
  if (failed) {
      res.statusMessage = failed;
      res.status(500).end();
  } else {
    res.status(200).end();
  }
});

// create solpass steps - rdp
const createRDP = async (broker, rdpObject) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints`, {
    method: "POST",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      ...rdpObject
    })
  })
  .then(async (response) => {
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
};

app.post("/exec/rdp/create", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var result = await createRDP(broker, req.body);
  if (result.success) {
    const data = await result.response.json();
    if (data.meta.error) {
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      res.status(200).end();
    }
  } else {
    res.statusMessage = `Failed: '${result.error.toString()}'`
    res.status(500).end();
  }
});

// delete solpass steps - rdp
const deleteRDP = async (broker, rdpName) => {
  var failed = false;
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints/${rdpName}`, {
    method: "DELETE",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    }
  })
  .then(async (response) => {
    const data = await response.json();
    if (data.meta.error && !data.meta.error.description.startsWith('Could not find match for')) {
      failed = `Failed: '${data.meta.error.description}'`;
    }
  })
  .catch((error) => {
    failed = `Failed: '${error.toString()}'`
  });

  return failed;
}

app.post("/exec/rdp/delete", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var failed = await deleteRDP(broker, req.query.rdp);
  if (failed) {
      res.statusMessage = failed;
      res.status(500).end();
  } else {
    res.status(200).end();
  }
});

// create solpass steps - rdp queue binding
const createQueueBinding = async (broker, rdpName, queueBindingObject) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints/${rdpName}/queueBindings`, {
    method: "POST",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      ...queueBindingObject
    })
  })
  .then(async (response) => {
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

app.post("/exec/rdpqueuebinding/create", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var result = await createQueueBinding(broker, req.query.rdp, req.body);
  if (result.success) {
    const data = await result.response.json();
    if (data.meta.error) {
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      res.status(200).end();
    }
  } else {
    res.statusMessage = `Failed: '${result.error.toString()}'`
    res.status(500).end();
  }
});


// delete solpass steps - rdp queue binding
const deleteQueueBinding = async (broker, rdpName, queueBindingName) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints/${rdpName}/queueBindings/${queueBindingName}`, {
    method: "DELETE",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    }
  })
  .then(async (response) => {
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
}

app.post("/exec/rdpqueuebinding/delete", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var result = await deleteQueueBinding(broker, req.query.rdp, req.query.queuebinding);
  if (result.success) {
    const data = await result.response.json();
    if (data.meta.error) {
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      res.status(200).end();
    }
  } else {
    res.statusMessage = `Failed: '${result.error.toString()}'`
    res.status(500).end();
  }
});

// create solpass steps - rdp rest consumer
const createRestConsumer = async (broker, rdpName, restConsumerObject) => {
  return await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints/${rdpName}/restConsumers`, {
    method: "POST",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    },
    body: JSON.stringify({
      msgVpnName: broker.vpn,
      ...restConsumerObject
    })
  })
  .then(async (response) => {
    return { success: true, response };
  })
  .catch((error) => {
    return { success: false, error };
  });  
};

app.post("/exec/rdprestconsumer/create", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  var result = await createRestConsumer(broker, req.query.rdp, req.body);
  if (result.success) {
    const data = await result.response.json();
    if (data.meta.error) {
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      res.status(200).end();
    }
  } else {
    res.statusMessage = `Failed: '${result.error.toString()}'`
    res.status(500).end();
  }

});

// delete solpass steps - rdp rest consumer
app.post("/exec/rdprestconsumer/delete", async (req, res) => {
  var broker = await getBroker(req.query.broker);
  await fetch(`${broker.url}/msgVpns/${broker.vpn}/restDeliveryPoints/${req.query.rdp}/restConsumers/${req.query.restconsumer}`, {
    method: "DELETE",
    credentials: 'same-origin',
    cache: 'no-cache',
    mode: "cors",      
    headers: {
      accept: 'application/json;charset=UTF-8',
      'content-type': 'application/json',
      'Authorization': 'Basic ' + btoa(broker.user + ":" + broker.pass)
    }
  })
  .then(async (response) => {
    const data = await response.json();
    if (data.meta.error && !data.meta.error.description.startsWith('Could not find match for')) {
      res.statusMessage = `Failed: '${data.meta.error.description}'`;
      res.status(500).end();
    } else {
      res.status(200).end();
    }
  })
  .catch((error) => {
    res.statusMessage = `Failed: '${error.toString()}'`
    res.status(500).end();
  });  
});

// TIMER
var time = new Date();
var secondsRemaining = (30 - time.getSeconds() % 30) * 1000;
setTimeout(() => {
  setInterval(() => {
      (async () => {
        // console.log('Checking passes...', new Date().toLocaleString());
        var activePasses = await getActivePasses();
        activePasses.forEach(async (pass) => {
          var now = Date.now();

          // Activate passes
          if (now >= pass.startTs && pass.valid && !pass.activated && !pass.activationFailed && !pass.expired) {
            var failed = false;
            if (!pass.activated && !pass.activationFailed) {
              failed = await (async() => {
                var executionFailed = false;
                var result = null;
                var passObject = JSON.parse(pass.passObject);
                var broker = await getBroker(passObject.step2.currentBroker);
                var queueObject = {
                  accessType: passObject.step2.accessType.toLowerCase(),
                  egressEnabled: true,
                  ingressEnabled: true,
                  respectTtlEnabled: passObject.step2.respectTTL,
                  maxTtl: parseInt(passObject.step2.maxTTL),
                  permission: "consume",
                  queueName: passObject.step2.currentQueue
                }
                result = await activateQueue(broker, queueObject, passObject.step3.subscriptions);

                if (result && result.success) {
                  const data = await result.response.json();
                  if (data.meta.error) {
                    logErrorEntry(`Failed to activate Queue for pass '${pass.name}' - '${data.meta.error.description}'`, 'create');
                    pass.activated = false;
                    pass.activationFailed = true;
                    executionFailed = true;
                  } else {
                    pass.activated = true;
                    pass.activationFailed = false;
                    logInfoEntry(`Successfully activated Queue for pass '${pass.name}'`, 'created');
                  }
                } else if (result && !result.success) {
                  logErrorEntry(`Failed to activate Queue for pass '${pass.name}' - '${result.error}'`, 'create');
                  pass.activated = false;
                  pass.activationFailed = true;
                  executionFailed = true;
                }

                updatePassValidity(pass);
                return executionFailed;
              })();
            }            
          }

          // check for expiration of pass validity
          if (now >= pass.endTs && pass.activated && !pass.activationFailed && !pass.expired) {
            console.log(`SolPass ${pass.name} expired...`);
            pass.expired = 1;
            updatePassValidity(pass);
            logInfoEntry(`SolPass '${pass.name}' expired`, 'expired');

            await (async () => {
              var passObject = JSON.parse(pass.passObject);
              var broker = await getBroker(passObject.step2.currentBroker);
              var queueObject = {
                // egressEnabled: false,
                // ingressEnabled: false,
                queueName: passObject.step2.currentQueue
              }

              result = await deactivateQueue(broker, queueObject, passObject.step3.subscriptions);

              if (result && result.success) {
                const data = await result.response.json();
                if (data.meta.error) {
                  logErrorEntry(`Failed to deactivate Queue for pass '${pass.name}' - '${data.meta.error.description}'`, 'deactivate');
                  pass.activated = false;
                  pass.activationFailed = true;
                  executionFailed = true;
                } else {
                  pass.activated = true;
                  pass.activationFailed = false;
                  logInfoEntry(`Successfully deactivated Queue for pass '${pass.name}'`, 'deactivated');
                }
              }

              updatePassValidity(pass);
            })();
          }
        });

        var expiredPasses = await getExpiredPasses();
        expiredPasses.forEach((pass) => {
          var now = Date.now();
          if (pass.retentionTs <= now && !pass.deactivated && !pass.deactivating) {
            pass.deactivating = 1;
            updatePassValidity(pass);
            logInfoEntry(`SolPass '${pass.name}' deactivating`, 'deactivated');

            (async () => {
              var passObject = JSON.parse(pass.passObject);
              var broker = await getBroker(passObject.step2.currentBroker);
              var queueObject = {
                // egressEnabled: false,
                // ingressEnabled: false,
                queueName: passObject.step2.currentQueue
              }              
              console.log(`SolPass ${pass.name} retention period ended...`);
              result = await emptyRetainedMessages(broker, queueObject);
              if (result.success) {
                console.log(`SolPass ${pass.name}: Retained messages deleted successfully`);
              } else {
                console.log(`SolPass ${pass.name}: Failed to delete retained messages`);
              }
              pass.activated = 0;
              pass.activationFailed = 0;
              pass.deactivated = result.success ? 1 : 0;
              pass.deactivationFailed = result.success ? 0 : 1;
              pass.deactivating = 0;
              pass.subscribed = 0;
              pass.valid = 1;
              updatePassValidity(pass);
              logInfoEntry(`SolPass '${pass.name}' resources cleaned up`, 'cleanedup');
            })();
          }
        });
      })();
  }, CRON_PASS_CHECK);
}, secondsRemaining);

// start server
app.listen(4000, () => {
  console.log("Server running on port 4000");
});
