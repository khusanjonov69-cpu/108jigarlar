import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { Server } from 'socket.io';
import { customAlphabet } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, transports: ['websocket','polling'] });
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'mau-mau-uz', version: '3.0.0' }));

const PORT = Number(process.env.PORT || 3000);
const SECRET_CODE = process.env.SECRET_CODE || crypto.randomBytes(32).toString('hex');
const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const playerId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
const rooms = new Map();
const sockets = new Map();
const disconnectTimers = new Map();

const PERSONAS = {
  WATUN: { id:'WATUN', name:'WATUN', color:'#d96b55', asset:'mh_3122.glb' },
  HOKIM: { id:'HOKIM', name:'HOKIM', color:'#b7a26b', asset:'mh_1037.glb' },
  XONZODABEGIM: { id:'XONZODABEGIM', name:'XONZODABEGIM', color:'#c56f9f', asset:'mh_1000.glb' },
  AHROR: { id:'AHROR', name:'AHROR', color:'#7c9da7', asset:'mh_1148.glb' },
  AZIK: { id:'AZIK', name:'AZIK', color:'#7b9270', asset:'mh_3244.glb' },
  BOQQORIN: { id:'BOQQORIN', name:'BOQQORIN', color:'#c68a52', asset:'mh_3549.glb' }
};
const SUITS = {
  BARG: { id:'BARG', name:'Barg', symbol:'♣', color:'#39d2a4' },
  QALAM: { id:'QALAM', name:'Qalam', symbol:'♦', color:'#f1b34c' },
  YURAK: { id:'YURAK', name:'Yurak', symbol:'♥', color:'#ef5d73' },
  GUL: { id:'GUL', name:'Gul', symbol:'✦', color:'#9b8cff' }
};
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const SPECIALS = new Set(['6','7','8','Q','A']);
const CHAT_LINES = [
  'TASHAAAAA TEZROO KO\'T','KALLEZGA QO\'TAGIM SIZI','CHOM NIMA BO\'LDI','QO\'TALA 7 KIMDA','MENDA',
  'QO\'TAGIMMI YEMESANMI SHU GAPIGA','MENDAMAS','SEN HOZ KORASAN','KO\'TLIK QIMA','OG\'ZINGA QO\'TAG\'IM'
];
const EMOJIS = ['😂','🤣','😎','😏','😡','😭','🔥','👏','🤡','💀','😱','👀','🥱','🤝'];
const COINS = [5,3,2,1,1];

const now = () => Date.now();
const player = (room,id) => room?.players.find(p => p.id === id);
const activePlayers = room => room.players.filter(p => p.active && !p.disconnected);
const cardPublic = c => ({ id:c.id, suit:c.suit, rank:c.rank, symbol:SUITS[c.suit].symbol, suitName:SUITS[c.suit].name, color:SUITS[c.suit].color, special:SPECIALS.has(c.rank) });

function makeDeck(){
  const d=[];
  for(const suit of Object.keys(SUITS)) for(const rank of RANKS) {
    d.push({ id:`${suit}-${rank}-${crypto.randomBytes(4).toString('hex')}`, suit, rank });
  }
  return d;
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=crypto.randomInt(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function nextIndex(room, steps=1){
  const ordered = room.players.map((p,i)=>({p,i})).filter(x=>x.p.active && !x.p.disconnected);
  if(!ordered.length) return -1;
  let idx = ordered.findIndex(x=>x.i === room.turnIndex);
  if(idx < 0) idx = 0;
  idx = (idx + room.direction * steps) % ordered.length;
  if(idx < 0) idx += ordered.length;
  return ordered[idx].i;
}
function refillDeck(room){
  if(room.deck.length || room.discard.length <= 1) return;
  const top = room.discard.pop();
  room.deck = shuffle(room.discard);
  room.discard = [top];
}
function drawCards(room,p,count){
  const got=[];
  for(let i=0;i<count;i++){
    refillDeck(room);
    if(!room.deck.length) break;
    got.push(room.deck.pop());
  }
  p.hand.push(...got);
  return got;
}
function currentCard(room){ return room.discard.at(-1) || null; }
function isPlayable(room,p,c){
  if(!p?.active || room.players[room.turnIndex]?.id !== p.id) return false;
  if(room.penalty > 0) return c.rank === '7';
  if(room.eightMode) return c.suit === room.eightSuit;
  const top=currentCard(room); if(!top) return true;
  const suit=room.chosenSuit || top.suit;
  return c.suit===suit || c.rank===top.rank;
}
function publicState(room, viewerId){
  const me=player(room,viewerId), active=activePlayers(room);
  return {
    code:room.code, phase:room.phase, hostId:room.hostId,
    players:room.players.map(p=>({ id:p.id,name:p.name,persona:p.persona,ready:p.ready,active:p.active,finished:p.finished,disconnected:p.disconnected,coins:p.coins,order:p.order,handCount:p.hand.length,color:PERSONAS[p.persona].color,asset:PERSONAS[p.persona].asset })),
    me:me?{id:me.id,name:me.name,persona:me.persona,ready:me.ready,active:me.active,finished:me.finished,coins:me.coins}:null,
    top:currentCard()?cardPublic(currentCard(room)):null,
    deckCount:room.deck.length, discardCount:room.discard.length,
    currentPlayerId:active.length>0?active.find((_,i)=>room.players[room.turnIndex]===active[i])?.id || room.players[room.turnIndex]?.id:null,
    direction:room.direction, chosenSuit:room.chosenSuit, penalty:room.penalty, eightMode:room.eightMode, eightSuit:room.eightSuit,
    pendingQueen:!!room.pendingQueen, drawnPlayable:!!room.drawnPlayable, lastAction:room.lastAction, bubble:room.bubble,
    roundResults:room.roundResults, gameWinnerOrder:room.gameWinnerOrder,
    hand:me?me.hand.map(cardPublic):[], secret:false
  };
}
function emitRoom(room,event='state'){
  for(const p of room.players){
    if(p.socketId && io.sockets.sockets.has(p.socketId)) io.to(p.socketId).emit(event,publicState(room,p.id));
  }
}
function bubble(room,text,pid){
  room.bubble={text,pid,until:now()+3500};
  emitRoom(room);
  setTimeout(()=>{ if(room.bubble?.until<=now()){ room.bubble=null; emitRoom(room); } },3600);
}
function action(room,text,type='info'){ room.lastAction={text,type,at:now()}; }
function finishPlayer(room,p){
  const wasCurrent=room.players[room.turnIndex]?.id===p.id;
  p.active=false; p.finished=true; p.order=room.finishedOrder.length+1; room.finishedOrder.push(p.id);
  bubble(room,'SOG\' BO\'LASILAR',p.id);
  const total=room.players.filter(x=>!x.disconnected).length;
  if(room.finishedOrder.length===total-1){
    const loser=activePlayers(room)[0];
    if(loser){ loser.active=false; loser.finished=true; loser.order=room.finishedOrder.length+1; room.finishedOrder.push(loser.id); room.gameWinnerOrder=loser.id; bubble(room,'MARIPNI KUYOVI',loser.id); }
    endRound(room); return;
  }
  if(wasCurrent) room.turnIndex=nextIndex(room,1);
}
function endRound(room){
  room.phase='finished';
  room.roundResults=room.finishedOrder.map((id,i)=>{
    const p=player(room,id); const loser=id===room.gameWinnerOrder; const award=loser?0:(i<COINS.length?COINS[i]:1);
    if(p) p.coins += award;
    return {id,name:p?.name,persona:p?.persona,order:i+1,coins:award,loser};
  });
  action(room,'Raund tugadi. Tangalar berildi.','finish');
  for(const p of room.players) p.ready=false;
}
function setupRound(room){
  const ps=room.players.filter(p=>!p.disconnected);
  if(ps.length<2) return false;
  room.phase='playing'; room.deck=shuffle(makeDeck()); room.discard=[]; room.direction=1; room.penalty=0; room.chosenSuit=null; room.eightMode=false; room.eightSuit=null; room.pendingQueen=false; room.drawnPlayable=false; room.finishedOrder=[]; room.roundResults=null; room.gameWinnerOrder=null; room.bubble=null;
  for(const p of room.players){p.hand=[];p.active=true;p.finished=false;p.order=null;p.ready=false;}
  for(let i=0;i<5;i++) for(const p of ps) drawCards(room,p,1);
  let first=room.deck.pop();
  while(first?.rank==='7'){ room.deck.unshift(first); shuffle(room.deck); first=room.deck.pop(); }
  if(!first) throw new Error('Deck initialization failed');
  room.discard.push(first); room.turnIndex=room.players.indexOf(ps[0]);
  action(room,'Kartalar tarqatildi. O\'yin boshlandi.','start');
  return true;
}
function afterNormalPlay(room,p,c){
  room.drawnPlayable=false;
  if(c.rank==='7'){ room.penalty += 2; bubble(room,room.penalty>=4?'XAXAXA ASADNI AMI':'AMINI YE!',p.id); room.turnIndex=nextIndex(room,1); return; }
  if(c.rank==='6'){
    const ni=nextIndex(room,1), target=player(room,room.players[ni]?.id);
    if(target){ drawCards(room,target,1); bubble(room,'SEN QARAB TUR',target.id); }
    room.turnIndex=nextIndex(room,2); return;
  }
  if(c.rank==='8'){ room.eightMode=true; room.eightSuit=c.suit; room.chosenSuit=c.suit; return; }
  if(c.rank==='Q'){ room.chosenSuit=null; room.pendingQueen=true; return; }
  if(c.rank==='A'){ bubble(room,'AMIZI QISIB TURING',p.id); room.turnIndex=nextIndex(room,2); return; }
  room.chosenSuit=null; room.eightMode=false; room.eightSuit=null; room.turnIndex=nextIndex(room,1);
}
function playCard(room,p,cardId){
  if(room.phase!=='playing' || room.players[room.turnIndex]?.id!==p.id || !p.active) return {ok:false,error:'Hozir sizning navbatingiz emas.'};
  if(room.pendingQueen) return {ok:false,error:'Avval Q uchun mast tanlang.'};
  const idx=p.hand.findIndex(c=>c.id===cardId); if(idx<0) return {ok:false,error:'Karta topilmadi.'};
  const c=p.hand[idx]; if(!isPlayable(room,p,c)) return {ok:false,error:'Bu kartani tashlab bo‘lmaydi.'};
  p.hand.splice(idx,1); room.discard.push(c); room.chosenSuit=null;
  action(room,`${p.name} ${c.rank}${SUITS[c.suit].symbol} tashladi`,'play');
  if(room.penalty>0 && c.rank==='7'){
    room.penalty += 2; room.eightMode=false; room.eightSuit=null;
    if(room.penalty>=4) bubble(room,'XAXAXA ASADNI AMI',p.id); else bubble(room,'AMINI YE!',p.id);
    room.turnIndex=nextIndex(room,1);
  } else {
    afterNormalPlay(room,p,c);
  }
  if(p.hand.length===0) finishPlayer(room,p);
  return {ok:true};
}
function draw(room,p){
  if(room.phase!=='playing' || room.players[room.turnIndex]?.id!==p.id || !p.active) return {ok:false,error:'Hozir sizning navbatingiz emas.'};
  if(room.pendingQueen) return {ok:false,error:'Q uchun mast tanlang.'};
  room.drawnPlayable=false;
  if(room.penalty>0){
    const n=room.penalty; drawCards(room,p,n); room.penalty=0; room.turnIndex=nextIndex(room,1); action(room,`${p.name} ${n} ta jarima karta oldi`,'draw'); return {ok:true,drawn:n,playable:false};
  }
  const got=drawCards(room,p,1)[0];
  if(!got){ room.turnIndex=nextIndex(room,1); action(room,`${p.name} karta ola olmadi`,'draw'); return {ok:true,drawn:0,playable:false}; }
  const playable=isPlayable(room,p,got);
  room.drawnPlayable=playable;
  action(room,`${p.name} 1 ta karta oldi${playable?' — mos karta, darhol tashlashi mumkin':''}`,'draw');
  if(!playable){ room.eightMode=false; room.eightSuit=null; room.chosenSuit=null; room.turnIndex=nextIndex(room,1); }
  return {ok:true,drawn:1,playable};
}
function queen(room,p,suit){
  if(room.phase!=='playing'||!room.pendingQueen||room.players[room.turnIndex]?.id!==p.id) return {ok:false,error:'Mast tanlash vaqti emas.'};
  if(!SUITS[suit]) return {ok:false,error:'Noto‘g‘ri mast.'};
  room.chosenSuit=suit; room.pendingQueen=false; room.drawnPlayable=false; bubble(room,'MONIMGA O\'YNELAR',p.id); action(room,`${p.name} mastni ${SUITS[suit].name} tanladi`,'queen');
  if(p.hand.length===0) finishPlayer(room,p); else room.turnIndex=nextIndex(room,1);
  return {ok:true};
}
function sanitizeName(){ return ''; }
function removeRoomIfEmpty(room){ if(room.players.every(p=>p.disconnected)) rooms.delete(room.code); }
function sendError(socket,msg){ socket.emit('toast',{type:'error',text:msg}); }

io.on('connection',(socket)=>{
  sockets.set(socket.id,{room:null,pid:null,secret:false,secretTapCount:0,lastSecretTap:0});
  socket.on('createRoom',({persona},cb)=>{
    if(!PERSONAS[persona]) return cb?.({ok:false,error:'Personajni tanlang.'});
    let code; do{code=roomCode();}while(rooms.has(code));
    const pid=playerId();
    const room={code,hostId:pid,phase:'lobby',players:[],deck:[],discard:[],turnIndex:0,direction:1,penalty:0,chosenSuit:null,eightMode:false,eightSuit:null,pendingQueen:false,drawnPlayable:false,lastAction:null,bubble:null,finishedOrder:[],roundResults:null,gameWinnerOrder:null,createdAt:now()};
    const p={id:pid,name:persona,persona,ready:false,active:true,finished:false,order:null,hand:[],coins:0,socketId:socket.id,disconnected:false,lastSeen:now()};
    room.players.push(p); rooms.set(code,room); sockets.get(socket.id).room=code; sockets.get(socket.id).pid=pid; socket.join(code); cb?.({ok:true,code,pid}); emitRoom(room);
  });
  socket.on('joinRoom',({code,persona},cb)=>{
    const room=rooms.get(String(code||'').toUpperCase().trim());
    if(!room) return cb?.({ok:false,error:'Bunday xona topilmadi.'});
    if(room.phase!=='lobby') return cb?.({ok:false,error:'O‘yin boshlangan. Yangi o‘yinchi kira olmaydi.'});
    if(room.players.length>=6) return cb?.({ok:false,error:'Xona to‘la.'});
    if(!PERSONAS[persona]) return cb?.({ok:false,error:'Personajni tanlang.'});
    if(room.players.some(p=>p.persona===persona&&!p.disconnected)) return cb?.({ok:false,error:'Bu personaj band.'});
    const pid=playerId(),p={id:pid,name:persona,persona,ready:false,active:true,finished:false,order:null,hand:[],coins:0,socketId:socket.id,disconnected:false,lastSeen:now()};
    room.players.push(p); sockets.get(socket.id).room=room.code; sockets.get(socket.id).pid=pid; socket.join(room.code); cb?.({ok:true,code:room.code,pid}); emitRoom(room);
  });
  socket.on('reconnectRoom',({code,pid},cb)=>{
    const room=rooms.get(String(code||'').toUpperCase()),p=player(room,pid);
    if(!room||!p) return cb?.({ok:false,error:'Qayta ulanish ma’lumoti topilmadi.'});
    p.socketId=socket.id;p.disconnected=false;p.lastSeen=now();clearTimeout(disconnectTimers.get(pid));
    sockets.get(socket.id).room=room.code;sockets.get(socket.id).pid=pid;socket.join(room.code);cb?.({ok:true});emitRoom(room);
  });
  socket.on('ready',()=>{ const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid); if(!room||!p||room.phase!=='lobby')return; p.ready=!p.ready; emitRoom(room); if(room.players.length>=2&&room.players.every(x=>x.ready&&!x.disconnected)){setupRound(room);emitRoom(room);} });
  socket.on('playCard',({cardId})=>{const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;const r=playCard(room,p,cardId);if(!r.ok)sendError(socket,r.error);emitRoom(room);});
  socket.on('draw',()=>{const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;const r=draw(room,p);if(!r.ok)sendError(socket,r.error);emitRoom(room);});
  socket.on('queenSuit',({suit})=>{const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;const r=queen(room,p,suit);if(!r.ok)sendError(socket,r.error);emitRoom(room);});
  socket.on('chat',({kind,value})=>{const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;if(kind==='line'&&!CHAT_LINES.includes(value))return;if(kind==='emoji'&&!EMOJIS.includes(value))return;bubble(room,value,p.id);});
  socket.on('secretTap',()=>{const s=sockets.get(socket.id);if(!s)return;const t=now();if(s.secretTapCount>0&&t-s.lastSecretTap>1500)s.secretTapCount=0;s.lastSecretTap=t;s.secretTapCount++;if(s.secretTapCount===6){s.secret=!s.secret;s.secretTapCount=0;s.secretProof=s.secret?crypto.createHmac('sha256',SECRET_CODE).update(`${socket.id}:${s.pid}`).digest('hex'):null;socket.emit('secretResult',{ok:true,enabled:s.secret});}});
  socket.on('secretReveal',({targetId})=>{const s=sockets.get(socket.id),room=rooms.get(s?.room);if(!room||!s.secret||!s.secretProof)return;const expected=crypto.createHmac('sha256',SECRET_CODE).update(`${socket.id}:${s.pid}`).digest('hex');if(!crypto.timingSafeEqual(Buffer.from(s.secretProof),Buffer.from(expected)))return;const target=player(room,targetId);if(!target)return;socket.emit('secretHand',{targetId:target.id,hand:target.hand.map(cardPublic)});});
  socket.on('secretDisable',()=>{const s=sockets.get(socket.id);if(s){s.secret=false;s.secretProof=null;}});
  socket.on('newRound',()=>{const s=sockets.get(socket.id),room=rooms.get(s?.room);if(!room||room.phase!=='finished'||room.hostId!==s.pid)return;for(const p of room.players)p.ready=false;room.phase='lobby';room.roundResults=null;room.gameWinnerOrder=null;emitRoom(room);});
  socket.on('disconnect',()=>{const s=sockets.get(socket.id);if(!s)return;const room=rooms.get(s.room),p=player(room,s.pid);if(p){p.disconnected=true;p.lastSeen=now();const t=setTimeout(()=>{const r=rooms.get(s.room);if(!r)return;const pp=player(r,s.pid);if(pp?.disconnected){pp.socketId=null;removeRoomIfEmpty(r);emitRoom(r);}},120000);disconnectTimers.set(p.id,t);emitRoom(room);}sockets.delete(socket.id);});
});
setInterval(()=>{for(const room of rooms.values()){if(now()-room.createdAt>24*3600*1000&&room.phase!=='playing')rooms.delete(room.code);}},3600000);
server.listen(PORT,()=>console.log(`Mau-Mau UZ 3D running on :${PORT}`));
