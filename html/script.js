import { joinRoom, selfId } from 'https://esm.run/@trystero-p2p/torrent';
import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';

const client = new WebTorrent();

const bountyData = {
  id: "1",
  text: "cock",
  something: "something"
}

const createBounty = async (bountyData) => {
  const jsonString = JSON.stringify(bountyData, null, 2);
  const fileBlob = new Blob([jsonString], {type: "json/application"});
  const file = new File([fileBlob], 'bounty.json');

  client.seed(file, {
    name: `bounty-${bountyData.id}`,
    announce: [
      'ws://domain:8000'
    ]
  }, (torrent) => {
    console.log(`magnet ${torrent.magnetURI}`);
    console.log(`infoHash ${torrent.infoHash}`);
  })
}

const config = {
  appId: 'abebe',
  relayUrls: [`wss://domain/ws/`],
  rtcConfig: {
    iceServers: [
      {
        urls: `turn:domain:3478`,
        username: "stupidboy",
        credential: "hardpassword"
      }
    ]
  }
};
const room = joinRoom(config, 'yoyo');

console.log(selfId);

const [sendChat, getChat] = room.makeAction('chat')

room.onPeerJoin(peerId => {
  console.log(`new peer: ${peerId}`);
})

const sendMessage = () => {
  sendChat({text: document.getElementById("text").value});
}

document.getElementById("send-button").addEventListener("click", sendMessage);
document.getElementById("bounty-button").addEventListener("click", () => {createBounty(bountyData)});

getChat((data, peerId) => {
  console.log(`new message: ${data.text} from ${peerId}`);
})


const getTorrent = () => {
  const magnetUri = document.getElementById("magnet").value;
  client.add(magnetUri, torrent => {
    console.log(torrent.infoHash);
  })  
}

document.getElementById("magnet-button").addEventListener("click", getTorrent);