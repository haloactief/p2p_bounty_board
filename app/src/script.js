import { joinRoom, selfId } from '@trystero-p2p/torrent';
// import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';

const tasksContainer = document.getElementById("tasks");
const chat = document.getElementById("chat");
let connectedPeers = new Set();
const connectedPeersP = document.getElementById("peers");
const hints = document.querySelectorAll(".hint");
const peersHints = document.querySelectorAll(".peers__hint");

hints.forEach(hint => {
  hint.addEventListener("click", () => {
    hint.style.display = "none";
  });
})

var db;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("p2pdb", 4);
    request.onerror = () => {
      console.log("fuck u");
    }
  
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    }
  
    request.onupgradeneeded = (event) => {
      console.log("thank god");
      db = event.target.result;
  
      const tasksStore = db.createObjectStore("tasks", {keyPath: "id"});
  
      tasksStore.createIndex("header", "header", { unique: false });
      tasksStore.createIndex("body", "body", { unique: false });
      tasksStore.createIndex("createdBy", "createdBy", { unique: false });
      tasksStore.createIndex("createdAt", "createdAt", { unique: false });
      tasksStore.createIndex("signature", "signature", { unique: true });
      tasksStore.createIndex("signerPublicKey", "signerPublicKey", { unique: false});

      db.createObjectStore("identity", {keyPath: "id"});
      db.createObjectStore("usdtAddress", {keyPath: "id"});
    }
  })
}

let myKeyPair = null;
let myPublicKeyRaw = null;
let myPublicKeyBase64 = null;
const IDENTITY_KEY = "myEd25519Identity";

const publicKeyToPeer = new Map();
const peerToPublicKey = new Map();
const publicKeyToAddress = new Map();

const getOrCreateKeyPair = async () => {
  if(myKeyPair) return;

  await dbReady;

  if(!db) {
    throw new Error("Database failed to open");
  }

  const tx = db.transaction("identity", "readonly");
  const store = tx.objectStore("identity");

  const stored = await new Promise((resolve, reject) => {
    const req = store.get(IDENTITY_KEY);
    req.onsuccess = (event) => {
      resolve(event.target.result);
    };
    req.onerror = (event) => {
      resolve(null);
    }
  })

  if(stored && stored.privateKey && stored.publicKey) {
    myKeyPair = {
      privateKey: await crypto.subtle.importKey("jwk", stored.privateKey, {name: "Ed25519"}, false, ["sign"]),
      publicKey: await crypto.subtle.importKey("jwk", stored.publicKey, {name: "Ed25519"}, true, ["verify"])
    };
  } else {
    myKeyPair = await crypto.subtle.generateKey({name: "Ed25519"}, true, ["sign", "verify"]);
    const privateJWK = await crypto.subtle.exportKey("jwk", myKeyPair.privateKey);
    const publicJWK = await crypto.subtle.exportKey("jwk", myKeyPair.publicKey);
  
    const wTx = db.transaction("identity", "readwrite");
    wTx.objectStore("identity").put({
      id: IDENTITY_KEY,
      privateKey: privateJWK,
      publicKey: publicJWK
    });
  }

  myPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", myKeyPair.publicKey));
  myPublicKeyBase64 = btoa(String.fromCharCode(...myPublicKeyRaw));

  document.getElementById("selfId").innerText = `your id: ${myPublicKeyBase64.slice(0, 16)}`;
};

let dbReady = openDB();
dbReady.then(() => {
  getOrCreateKeyPair().catch(err => {
    console.error(err);
  })
})

const whenDBReady = (callback) => {
  dbReady.then(() => callback());
}

let paymentAddress = null;

whenDBReady(async () => {
  const tx = db.transaction("usdtAddress", "readonly");
  const store = tx.objectStore("usdtAddress");

  const stored = await new Promise((resolve, reject) => {
    const req = store.get("myUsdtAddress");
    req.onsuccess = (event) => {
      resolve(event.target.result);
    };
    req.onerror = (event) => {
      resolve(null);
    };
  })

  if(stored && stored.address) {
    paymentAddress = stored.address;
  }
})

const saveAddress = async () => {
  const address = document.getElementById("recipient-address").value.trim();
  whenDBReady(() => {
    const tx = db.transaction("usdtAddress", "readwrite");
    tx.objectStore("usdtAddress").put({
      id: "myUsdtAddress",
      address: address
    });
  })
  paymentAddress = address;
}
document.getElementById("save-address-button").addEventListener("click", () => {
  saveAddress();
  sendM({type: "mi", mtype: "myUsdtAddress", address: paymentAddress});
})

var myTasks = new Set();
var otherTasks = new Set();

const getTasksFromDB = () => {
  if(!db) {
    console.warn("Database is not ready!");
    whenDBReady(() => {
      getTasksFromDB();
    })
  }

  const objectStore = db.transaction("tasks").objectStore("tasks");
  objectStore.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if(cursor) {
      const task = cursor.value;

      const exists = Array.from(myTasks).some(t => t.id === task.id);
      if (!exists) {
        myTasks.add(task);
      }

      cursor.continue();
    } else {
      updateTaskContainer();
    }
  }
}

whenDBReady(() => {
  getTasksFromDB();
})

const el = (tag, props = {}, children = []) => {
  const element = Object.assign(document.createElement(tag), props);
  if(!Array.isArray(children)) children = [children];
  element.append(...children);
  return element;
}

const deleteByProperty = (set, key, value) => {
  for(const item of set) {
    if(item[key] === value) {
      set.delete(item);
    }
    return true;
  }
  return false;
}

let currentTaskActions = null;
let currentPeerActions = null;

const openTaskActions = (taskData) => {
  if(currentTaskActions) currentTaskActions.remove();
  const actionsDiv = document.getElementById("task__actions")
  const isOwner = taskData.createdBy === myPublicKeyBase64;

  const actionButtons = el("div", {
    className: "action-buttons"
  })
  actionButtons.append(
    ...(isOwner ? [
      el("div", {
        textContent: "Delete",
        onclick: () => {
          deleteByProperty(myTasks, "id", taskData.id);
          updateTaskContainer();
          whenDBReady(() => {
            const tx = db.transaction(["tasks"], "readwrite");
            const store = tx.objectStore("tasks");

            store.delete(taskData.id);
          })
          sendM({type: "rb", mtype: "global", payload: taskData.id});
        },
        className: "button clickable"
      })
    ] : []),
    el("div", {
      textContent: "action",
      onclick: () => {
        console.log("clicked task action")
      },
      className: "button clickable"
    }),
    el("div", {
      textContent: "action2",
      onclick: () => {
        console.log("clicked task action2")
      },
      className: "button clickable"
    })
  )

  const actions = el("div");
  actions.append(
    el("div", {
      textContent: `Task: ${taskData.id.slice(-12)}`
    }),
    actionButtons
  );

  actionsDiv.replaceChildren(actions);

  currentTaskActions = actions;
}

const openPeerActions = (peerPublicKey) => {
  if(currentPeerActions) currentPeerActions.remove();
  const actionsDiv = document.getElementById("peer__actions");

  const actionButtons = el("div", {
    className: "action-buttons"
  })
  actionButtons.append(
    el("div", {
      textContent: "Send message",
      className: "clickable button",
      onclick: () => {
        document.getElementById("message__recipient").value = peerPublicKey;
      }
    }),
    el("div", {
      textContent: "Copy payment address",
      className: "clickable button",
      onclick: () => {
        navigator.clipboard.writeText(publicKeyToAddress.get(peerPublicKey));
      }
    })
  )

  const actions = el("div");
  actions.append(
    el("div", {
      textContent: `Task: ${peerPublicKey.slice(0, 16)}`
    }),
    actionButtons
  )

  actionsDiv.replaceChildren(actions);

  currentPeerActions = actions;
}

const createTaskElement = (obj) => {
  const task = document.createElement("div");
  const timestamp = new Date(obj.createdAt).toLocaleString();

  task.className = "task";
  task.onclick = (e) => {
    e.stopPropagation();
    openTaskActions(obj);
  }
  task.append(
    el("h3", {textContent: obj.header}),
    el("div", {textContent: `desc: ${obj.body}`}),
    el("div", {textContent: `id: ${obj.id}`}),
    el("div", {}, [
      el("span", {textContent: "by: "}),
      el("span", {
        textContent: obj.createdBy,
        className: "clickable",
        onclick: () => {
          openPeerActions(obj.createdBy);
        }
      })
    ]),
    el("p", {textContent: `at: ${timestamp}`})
  );

  return task;
}

const updateTaskContainer = () => {
  const tasks = [...myTasks, ...otherTasks];
  tasksContainer.replaceChildren(
    ...tasks.map(createTaskElement)
  );
}

const updateConnectedPeers = () => {
  connectedPeersP.innerHTML = connectedPeers.size > 0 ? "" : "No peers";
  if(connectedPeers.size > 0) {
    peersHints.forEach(hint => {
      hint.style.display = "none";
    });
  }

  connectedPeers.forEach(peerId => {
    connectedPeersP.appendChild(el("div", {
      textContent: peerToPublicKey.get(peerId).slice(0, 16),
      onclick: () => {
        openPeerActions(peerToPublicKey.get(peerId));
      },
      className: "clickable peer"
    }));
  })
}

updateTaskContainer();

const config = {
  appId: 'abebe',
  relayUrls: [`wss://${import.meta.env.VITE_DOMAIN}/ws/`],
  rtcConfig: {
    iceServers: [
      {  // need this if p2p fails
        urls: `turn:${import.meta.env.DOMAIN}:3478`,
        username: "stupidboy",
        credential: "hardpassword"
      }
    ]
  }
};
const room = joinRoom(config, 'yoyo');

const [sendM, getM] = room.makeAction('chat');

room.onPeerJoin(peerId => {
  connectedPeers.add(peerId);
  sendM({type: "ri"}, peerId);
  whenDBReady(() => {
    if (myTasks.size > 0) broadcastTasks();
  });
})

room.onPeerLeave(peerId => {
  connectedPeers.delete(peerId);
  updateConnectedPeers();
})

const signMessage = async (data) => {
  if (!myKeyPair) await getOrCreateKeyPair();

  const encoder = new TextEncoder();
  const dataBuffer = typeof(data) === "string" ? encoder.encode(data) : encoder.encode(JSON.stringify(data));

  const signature = await crypto.subtle.sign({name: "Ed25519"}, myKeyPair.privateKey, dataBuffer);

  return {
    signature: Array.from(new Uint8Array(signature)),
    publicKey: Array.from(myPublicKeyRaw),
    timestamp: Date.now()
  }
}

const verifySignature = async (data, signatureArr, publicKeyArr) => {
  try {
    const publicKey = await crypto.subtle.importKey("raw", new Uint8Array(publicKeyArr), {name: "Ed25519"}, true, ["verify"]);

    const encoder = new TextEncoder();
    const dataBuffer = typeof(data) === "string" ? encoder.encode(data) : encoder.encode(JSON.stringify(data));

    return await crypto.subtle.verify({name: "Ed25519"}, publicKey, new Uint8Array(signatureArr), dataBuffer);
  } catch (e) {
    console.warn("Signature verification failed ", e);
    return false;
  }
}

const sendMessage = () => {
  const recipientId = publicKeyToPeer.get(document.getElementById("message__recipient").value);
  const message = document.getElementById("message__content").value;
  const isPrivate = recipientId ? true : false;
  const time = new Date().toLocaleTimeString();

  if(isPrivate) {
    sendM({type: "m", mtype: "private", body: message}, recipientId);
  } else {
    sendM({type: "m", mtype: "global", body: message});
  }

  const mdiv = document.createElement("div");
  mdiv.className = isPrivate ? "message private" : "message";

  mdiv.append(
    el("span", {textContent: isPrivate ? "you to " : "you to all: "}),

    ...(isPrivate ? [
      el("span", {
        textContent: document.getElementById("message__recipient").value.slice(0, 16),
        className: "clickable",
        onclick: () => {
          openPeerActions(peerToPublicKey.get(recipientId));
        }
      })
    ] : []),

    el("span", {textContent: isPrivate ? `: ${message} ${time}` : ` ${message} ${time}`})
  )

  chat.appendChild(mdiv);
}
document.getElementById("send-button").addEventListener("click", sendMessage);

getM(async (data, peerId) => {
  switch(data.type) {
  case "ri":
    sendM({type: "mi", mtype: "myEd25519Identity", publicKey: myPublicKeyBase64}, peerId);
    sendM({type: "mi", mtype: "myUsdtAddress", address: paymentAddress}, peerId);
    break;
  case "mi":
    switch(data.mtype) {
    case "myEd25519Identity":
      publicKeyToPeer.set(data.publicKey, peerId);
      peerToPublicKey.set(peerId, data.publicKey);
      updateConnectedPeers();
      break;
    case "myUsdtAddress":
      const senderPublicKey = peerToPublicKey.get(peerId);
      publicKeyToAddress.set(senderPublicKey, data.address);
      break;
    default:
      console.warn("negodnik")
    }
    break;
  case "b":
    for(const task of data.payload || []) {
      if (Array.from(myTasks).some(t => t.id === task.id) || 
          Array.from(otherTasks).some(t => t.id === task.id)) {
        continue;
      }

      if(task.signature && task.signerPublicKey) {
        let isValid = true;
        const dataToVerify = {
          id: task.id,
          header: task.header,
          body: task.body,
          createdBy: task.createdBy,
          createdAt: task.createdAt
        };
        isValid = await verifySignature(dataToVerify, task.signature, task.signerPublicKey);

        if(!isValid) {
          console.warn("Invalid signature on task ", task.id);
          continue;
        }
      } else {
        console.warn("Task without signature: ", task.id);
      }
      const exist = Array.from(otherTasks).some(t => t.id === task.id);
      if(!exist) {
        otherTasks.add({...task});
      }
    }
    updateTaskContainer();
    break;
  case "rb":
    deleteByProperty(otherTasks, "id", data.payload);
    updateTaskContainer();
    break;
  case "m":
    const senderPublicKey = peerToPublicKey.get(peerId) || peerId;
    const isPrivate = data.mtype === "private";
    const time = new Date().toLocaleTimeString();

    const mdiv = document.createElement("div");
    mdiv.className = isPrivate ? "message private" : "message";

    mdiv.append(
      el("span", {
        textContent: senderPublicKey.slice(0, 16),
        className: "clickable",
        onclick: () => {
          openPeerActions(senderPublicKey);
        }
      }),

      el("span", {textContent: isPrivate ? ` to you: ${data.body} ${time}` : ` to all: ${data.body} ${time}`})
    );

    chat.appendChild(mdiv);
    break;
  default:
    console.log("unknown message type");
    break;
  }
})

const addTaskToDB = (task) => {
  const tx = db.transaction(["tasks"], "readwrite");
  const store = tx.objectStore("tasks");

  store.add(task);
}

const createTask = async () => {
  const taskHeader = document.getElementById("task__header").value;
  const taskBody = document.getElementById("task__desc").value;

  const taskObj = {
    id: crypto.randomUUID(),
    header: taskHeader,
    body: taskBody,
    createdBy: myPublicKeyBase64,
    createdAt: Date.now()
  };

  const sigData = {...taskObj};
  const signed = await signMessage(sigData);

  const signedTask = {
    ...taskObj,
    signature: signed.signature,
    signerPublicKey: signed.publicKey
  }

  myTasks.add(signedTask);
  whenDBReady(() => {
    addTaskToDB(signedTask);
  })

  broadcastTasks();
  updateTaskContainer();

  document.getElementById("task__header").value = "";
  document.getElementById("task__desc").value = "";
}

const broadcastTasks = async () => {
  if(myTasks.size === 0) return;
  sendM({type: "b", mtype: "global", payload: Array.from(myTasks)});
}

document.getElementById("task__button").addEventListener("click", createTask);

const files = import.meta.glob('./assets/images/*', {eager: true, import: 'default'});

Object.values(files).forEach(file => {
  document.getElementById("bullshit").appendChild(el("img", {
    src: file,
    className: "dancing"
  }));
});