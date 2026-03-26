import { joinRoom, selfId } from 'https://esm.run/@trystero-p2p/torrent';
// import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';

// store tasks in local storage
// and broadcast them to all peers
// im fucking genius

const newPeerSpan = document.getElementById("new-peer");
const tasksContainer = document.getElementById("tasks");
const chat = document.getElementById("chat");
var myTasks = localStorage.getItem("mt") !== null ? JSON.parse(localStorage.getItem("mt")) : [];
var otherTasks = [];

const updateTaskContainer = () => {
  const tasks = [...myTasks, ...otherTasks];
  tasksContainer.innerHTML = "<h1>Tasks</h1>";
  tasks.forEach(obj => {
    const task = document.createElement("div");
    const taskHeader = document.createElement("h1");
    taskHeader.textContent = obj.header;

    const taskDesc = document.createElement("p");
    taskDesc.textContent = obj.body;

    task.appendChild(taskHeader);
    task.appendChild(taskDesc);

    const peer = document.createElement("span");
    peer.textContent = obj.peerId ? `peer: ${obj.peerId}` : `peer: me`;
    task.appendChild(peer);

    tasksContainer.appendChild(task);
  })
}

updateTaskContainer();

const config = {
  appId: 'abebe',
  relayUrls: [`wss://domain/ws/`] // <-- change_domain
  // rtcConfig: {
  //   iceServers: [
  //     {  // need this if p2p fails
  //       urls: `turn:domain:3478`, //  <-- change_domain
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
  mdiv.textContent = recipientId ? `you to ${recipientId}: ${message} ${Date.now()}` : `you to all: ${message} ${Date.now()}`;
  chat.appendChild(mdiv);
}
document.getElementById("send-button").addEventListener("click", sendMessage);

getM((data, peerId) => {
  switch(data.type) {
  case "b":
    data.body.forEach(task => {
      const exist = otherTasks.some(obj => obj.header === task.header);
      if(!exist) {
        const taskWPeer = {...task, peerId: data.peerId};
        otherTasks.push(taskWPeer);
      }
      updateTaskContainer();
    })
    break;
  case "m":
    const message = document.createElement("div");
    message.textContent = data.mtype === "private" ? `${peerId} to you: ${data.body} ${Date.now()}` : `${peerId} to all: ${data.body} ${Date.now()}`;
    chat.appendChild(message);
    break;
  default:
    console.log("unknown message type");
    break;
  }
})

const createTask = () => {
  const taskHeader = document.getElementById("task-header").value;
  const taskBody = document.getElementById("task-desc").value;

  const exists = myTasks.some(obj => obj.header === taskHeader);
  if (exists) return;

  const taskObj = {
    header: taskHeader,
    body: taskBody
  };
  myTasks.push(taskObj);
  localStorage.setItem("mt", JSON.stringify(myTasks));
  sendMyTasks();
  updateTaskContainer();
}

const sendMyTasks = () => {
  sendM({type: "b", mtype: "global", body: myTasks, peerId: selfId});
}

document.getElementById("task-button").addEventListener("click", createTask);