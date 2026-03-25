import { joinRoom, selfId } from 'https://esm.run/@trystero-p2p/torrent';

const config = {
  appId: 'abebe',
  relayUrls: ["wss://domain/ws/"],
  rtcConfig: {
    iceServers: [
      {
        urls: "turn:domain:3478",
        username: "stupidboy",
        credentials: "hardpassword"
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

getChat((data, peerId) => {
  console.log(`new message: ${data.text} from ${peerId}`);
})