import { joinRoom, selfId } from 'https://esm.run/@trystero-p2p/torrent';
// import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';

// store bounties in local storage
// and broadcast them to all peers
// im fucking genius

const bountyContainer = document.getElementById("bounties");
var myBounties = localStorage.getItem("mb") !== null ? JSON.parse(localStorage.getItem("mb")) : [];
var otherBounties = [];

const updateBountyContainer = () => {
  const bounties = [...myBounties, ...otherBounties];
  bountyContainer.innerHTML = "";
  bounties.forEach(obj => {
    const bounty = document.createElement("div");
    const bountyHeader = document.createElement("span");
    bountyHeader.textContent = obj.header;

    const bountyBody = document.createElement("p");
    bountyBody.textContent = obj.body;

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
  sendBounties();
})

const sendMessage = () => {
  sendM({type: "gm", body: document.getElementById("text").value});
}
document.getElementById("send-button").addEventListener("click", sendMessage);

getM((data, peerId) => {
  switch(data.type) {
  case "b":
    data.body.forEach(bounty => {
      const exist = otherBounties.some(obj => obj.header === bounty.header);
      if(!exist) {
        otherBounties.push(bounty);
      }
      updateBountyContainer();
    })
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

  const exists = myBounties.some(obj => obj.header === bountyHeader);
  if (exists) return;

  const bountyObj = {
    header: bountyHeader,
    body: bountyBody
  };
  myBounties.push(bountyObj);
  localStorage.setItem("mb", JSON.stringify(myBounties));
  sendBounties();
  updateBountyContainer();
}

const sendBounties = () => {
  sendM({type: "b", body: myBounties, peerId: selfId});
}

document.getElementById("bounty-button").addEventListener("click", createBounty);