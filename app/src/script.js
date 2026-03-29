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
    }
  })
}

let dbReady = openDB();

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

    const peer = document.createElement("p");
    peer.textContent = obj.peerId ? `peer: ${obj.peerId}` : `peer: me`;
    task.appendChild(peer);

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
document.getElementById("selfId").innerText = `your id: ${selfId}`;

const [sendM, getM] = room.makeAction('chat')

room.onPeerJoin(peerId => {
  newPeerSpan.style.display = "block";
  newPeerSpan.textContent = newPeerSpan.textContent + ` new peer: ${peerId}`;
  setTimeout(() => {
    newPeerSpan.style.display = "none";
  }, 5000);
  sendMyTasks();
})

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

getM((data, peerId) => {
  switch(data.type) {
  case "b":
    data.body.forEach(task => {
      const exist = otherTasks.some(obj => obj.id === task.id);
      if(!exist) {
        const taskWPeer = {...task, peerId: data.peerId};
        otherTasks.push(taskWPeer);
      }
      updateTaskContainer();
    })
    break;
  case "m":
    const message = document.createElement("div");
    message.className = "message";
    message.textContent = data.mtype === "private" ? `${peerId} to you: ${data.body} ${Date.now()}` : `${peerId} to all: ${data.body} ${Date.now()}`;
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

const createTask = () => {
  const id = crypto.randomUUID();
  const taskHeader = document.getElementById("task-header").value;
  const taskBody = document.getElementById("task-desc").value;

  const exists = myTasks.some(obj => obj.id === id);
  if (exists) return;

  const taskObj = {
    id: id,
    header: taskHeader,
    body: taskBody
  };
  whenDBReady(() => {
    addTaskToDB(taskObj);
  })

  broadcastTasks();
  updateTaskContainer();
}

const broadcastTasks = () => {
  sendM({type: "b", mtype: "global", body: myTasks, peerId: selfId}); // gonna leave it like this for now
}

document.getElementById("task-button").addEventListener("click", createTask);