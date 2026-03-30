import { joinRoom, selfId } from '@trystero-p2p/torrent';
// import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';

// store tasks in local storage
// and broadcast them to all peers
// im fucking genius

const newPeerSpan = document.getElementById("new-peer");
const tasksContainer = document.getElementById("tasks");
const chat = document.getElementById("chat");

var db;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("p2pdb", 3);
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
      tasksStore.createIndex("createdAt", "cretedAt", { unique: false });
      tasksStore.createIndex("signature", "signature", { unique: true });
      tasksStore.createIndex("signerPublicKey", "signerPublicKey", { unique: false});

      db.createObjectStore("identity", {keyPath: "id"});
    }
  })
}

let myKeyPair = null;
let myPublicKeyRaw = null;
let myPublicKeyBase64 = null;
const IDENTITY_KEY = "myEd25519Identity";

const publicKeyToPeer = new Map();
const peerToPublicKey = new Map();

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

var myTasks = [];
var otherTasks = [];

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
      // console.log(cursor.key + " " + cursor.value.header + " " + cursor.value.body);
      const task = {
        id: cursor.key,
        header: cursor.value.header,
        body: cursor.value.body
      }

      const exists = myTasks.some(t => t.id === task.id);
      if (!exists) {
        myTasks.push(task);
      }

      cursor.continue();
    } else {
      // console.log("No more entries!");
      updateTaskContainer();
    }
  }
}

whenDBReady(() => {
  getTasksFromDB();
})

const updateTaskContainer = () => {
  const tasks = [...myTasks, ...otherTasks];
  tasksContainer.innerHTML = "";
  tasks.forEach(obj => {
    const task = document.createElement("div");
    task.className = "task"
    const taskHeader = document.createElement("h3");
    taskHeader.textContent = obj.header;

    const taskDesc = document.createElement("p");
    taskDesc.textContent = obj.body;

    task.appendChild(taskHeader);
    task.appendChild(taskDesc);

    const taskId = document.createElement("p");
    taskId.textContent = `taskId: ${obj.id}`
    task.appendChild(taskId);

    tasksContainer.appendChild(task);
  })
}

updateTaskContainer();

const config = {
  appId: 'abebe',
  relayUrls: [`wss://${import.meta.env.VITE_DOMAIN}/ws/`] // <-- change_domain
  // rtcConfig: {
  //   iceServers: [
  //     {  // need this if p2p fails
  //       urls: `turn:${import.meta.env.DOMAIN}:3478`, //  <-- change_domain
  //       username: "stupidboy",
  //       credential: "hardpassword"
  //     }
  //   ]
  // }
};
const room = joinRoom(config, 'yoyo');

const [sendM, getM] = room.makeAction('chat')

room.onPeerJoin(peerId => {
  newPeerSpan.style.display = "block";
  newPeerSpan.textContent = newPeerSpan.textContent + ` new peer: ${peerId}`;
  setTimeout(() => {
    newPeerSpan.style.display = "none";
  }, 5000);
  sendM({type: "ri"}, peerId);
  if (myTasks.length > 0) {
    setTimeout(broadcastTasks, 500);
  }
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
  const recipientId = document.getElementById("recipient").value;
  const message = document.getElementById("message").value;
  if(recipientId) {
    sendM({type: "m", mtype: "private", body: message}, recipientId);
  } else {
    sendM({type: "m", mtype: "global", body: message});
  }

  const mdiv = document.createElement("div");
  mdiv.className = "message";
  mdiv.textContent = recipientId ? `you to ${recipientId}: ${message} ${Date.now()}` : `you to all: ${message} ${Date.now()}`;
  chat.appendChild(mdiv);
}
document.getElementById("send-button").addEventListener("click", sendMessage);

getM(async (data, peerId) => {
  switch(data.type) {
  case "ri":
    sendM({type: "mi", publicKey: myPublicKeyBase64}, peerId);
    break;
  case "mi":
    publicKeyToPeer.set(data.publicKey, peerId);
    peerToPublicKey.set(peerId, data.publicKey);
    break;
  case "b":
    for(const task of data.payload || []) {
      if (myTasks.some(t => t.id === task.id) || 
          otherTasks.some(t => t.id === task.id)) {
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
      const exist = otherTasks.some(t => t.id === task.id);
      if(!exist) {
        otherTasks.push({...task});
      }
    }
    updateTaskContainer();
    break;
  case "m":
    const senderPublicKey = peerToPublicKey.get(peerId) || peerId;

    const message = document.createElement("div");
    message.className = "message";
    message.textContent = data.mtype === "private" ? `${senderPublicKey.slice(0, 16)} to you: ${data.body} ${Date.now()}` : `${senderPublicKey.slice(0, 16)} to all: ${data.body} ${Date.now()}`;
    chat.appendChild(message);
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
  const taskHeader = document.getElementById("task-header").value;
  const taskBody = document.getElementById("task-desc").value;

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

  myTasks.push(signedTask);
  whenDBReady(() => {
    addTaskToDB(signedTask);
  })

  broadcastTasks();
  updateTaskContainer();

  document.getElementById("task-header").value = "";
  document.getElementById("task-desc").value = "";
}

const broadcastTasks = async () => {
  if(myTasks.length === 0) return;
  sendM({type: "b", mtype: "global", payload: myTasks});
}

document.getElementById("task-button").addEventListener("click", createTask);