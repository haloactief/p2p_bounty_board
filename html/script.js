import { joinRoom, selfId } from 'https://esm.run/@trystero-p2p/torrent';
// import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';

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

console.log(selfId);

const [sendChat, getChat] = room.makeAction('chat')

room.onPeerJoin(peerId => {
  console.log(`new peer: ${peerId}`);
})

const sendMessage = () => {
  sendChat({text: document.getElementById("text").value});
}

document.getElementById("send-button").addEventListener("click", sendMessage);

getChat((data, peerId) => {
  console.log(`new message: ${data.text} from ${peerId}`);
})