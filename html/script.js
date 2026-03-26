import { joinRoom, selfId } from 'https://esm.run/@trystero-p2p/torrent';
// import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';

// store bounties in local storage
// and broadcast them to all peers
// im fucking genius

const bountyContainer = document.getElementById("bounties");
var myBounties = localStorage.getItem("mb") !== null ? JSON.parse(localStorage.getItem("mb")) : [];

const updateBountyContainer = (bounties) => {
  bountyContainer.innerHTML = "";
  bounties.forEach(obj => {
    console.log(obj);
    const bounty = document.createElement("div");
    const bountyHeader = document.createElement("span");
    bountyHeader.textContent = JSON.parse(obj).header;

    const bountyBody = document.createElement("p");
    bountyBody.textContent = JSON.parse(obj).body;

    bounty.appendChild(bountyHeader);
    bounty.appendChild(bountyBody);

    bountyContainer.appendChild(bounty);
  })
}

updateBountyContainer(myBounties);

const config = {
  appId: 'abebe',
  relayUrls: [`wss://domain/ws/`] // <-- change_domain
  // rtcConfig: {
  //   iceServers: [
  //     {
  //       urls: `turn:domain:3478`, // <-- change_domain
  //       username: "stupidboy",
  //       credential: "hardpassword"
  //     }
  //   ]
  // }
};
const room = joinRoom(config, 'yoyo');
console.log(`id: ${selfId}`);

const [sendM, getM] = room.makeAction('chat')

room.onPeerJoin(peerId => {
  console.log(`new peer: ${peerId}`);
})

const sendMessage = () => {
  sendM({type: "gm", body: document.getElementById("text").value});
}

document.getElementById("send-button").addEventListener("click", sendMessage);

getM((data, peerId) => {
  switch(data.type) {
  case "b":
    console.log("b");
    break;
  case "m":
    console.log(`${peerId}: ${data.body} ${Date.now()} ${data.type}`);
    break;
  default:
    console.log("unknown message type");
    break;
  }
})

const createBounty = () => {
  const bountyHeader = document.getElementById("bounty-header").value;
  const bountyBody = document.getElementById("bounty-body").value;

  const exists = myBounties.some(obj => JSON.parse(obj).header === bountyHeader);
  if (exists) return;

  const bountyObj = JSON.stringify({
    header: bountyHeader,
    body: bountyBody
  });
  myBounties.push(bountyObj);
  localStorage.setItem("mb", JSON.stringify(myBounties));
  sendM({type: "b", body: JSON.stringify(myBounties), peerId: selfId});
  updateBountyContainer(myBounties);
}

document.getElementById("bounty-button").addEventListener("click", createBounty);