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
app.get('/health', (_req, res) => res.json({ ok: true, service: 'mau-mau-uz', version: '2.0.0' }));

const PORT = Number(process.env.PORT || 3000);
const SECRET_CODE = process.env.SECRET_CODE || 'CHANGE_THIS_SECRET_CODE';
const roomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const playerId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);
const rooms = new Map();
const sockets = new Map();

const PERSONAS = {
  WATUN: { id:'WATUN', name:'WATUN', color:'#e74c3c', emoji:'💃', role:'dramatik' },
  HOKIM: { id:'HOKIM', name:'HOKIM', color:'#5b6ee1', emoji:'🕴️', role:'boyvachcha' },
  XONZODABEGIM: { id:'XONZODABEGIM', name:'XONZODABEGIM', color:'#d35aa6', emoji:'👸', role:'bezakchi' },
  AHROR: { id:'AHROR', name:'AHROR', color:'#72a7b9', emoji:'😶', role:'kuchsiz' },
  AZIK: { id:'AZIK', name:'AZIK', color:'#a87342', emoji:'🤡', role:'hazilkash' },
  BOQQORIN: { id:'BOQQORIN', name:'BOQQORIN', color:'#ef9b35', emoji:'🍗', role:'ochofat' }
};
const SUITS = {
  BARG: { id:'BARG', name:'Barg', symbol:'♣', color:'#28c7a2', bg:'#dffaf2' },
  QALAM: { id:'QALAM', name:'Qalam', symbol:'♦', color:'#f3a43b', bg:'#fff1d8' },
  YURAK: { id:'YURAK', name:'Yurak', symbol:'♥', color:'#ef5b70', bg:'#ffe1e5' },
  GUL: { id:'GUL', name:'Gul', symbol:'✦', color:'#7a72e8', bg:'#e8e7ff' }
};
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const SPECIALS = new Set(['6','7','8','Q','A']);
const CHAT_LINES = [
  'TASHAAAAA TEZROO KO\'T','KALLEZGA QO\'TAGIM SIZI','CHOM NIMA BO\'LDI','QO\'TALA 7 KIMDA','MENDA',
  'QO\'TAGIMMI YEMESANMI SHU GAPIGA','MENDAMAS','SEN HOZ KORASAN','KO\'TLIK QIMA','OG\'ZINGA QO\'TAG\'IM'
];
const EMOJIS = ['😂','🤣','😎','😏','😡','😭','🔥','👏','🤡','💀','😱','👀','🥱','🤝'];
const COINS = [5,3,2,1,1];
const disconnectTimers = new Map();

function now(){ return Date.now(); }
function makeDeck(){
  const d=[];
  for(const suit of Object.keys(SUITS)) for(const rank of RANKS) d.push({ id:`${suit}-${rank}-${crypto.randomBytes(3).toString('hex')}`, suit, rank });
  return d;
}
function shuffle(a){
  for(let i=a.length-1;i>0;i--){ const j=crypto.randomInt(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function publicPersona(p){ return PERSONAS[p]; }
function activePlayers(room){ return room.players.filter(p=>p.active && !p.disconnected); }
function connectedPlayers(room){ return room.players.filter(p=>!p.disconnected); }
function player(room,id){ return room.players.find(p=>p.id===id); }
function spectator(room,p){ return !p.active || p.finished;
}
function publicState(room, viewerId){
  const me = player(room, viewerId);
  const active = activePlayers(room);
  return {
    code: room.code, phase: room.phase, hostId: room.hostId,
    players: room.players.map(p=>({ id:p.id,name:p.name,persona:p.persona,ready:p.ready,active:p.active,finished:p.finished,disconnected:p.disconnected,coins:p.coins,order:p.order,handCount:p.hand.length,color:PERSONAS[p.persona].color })),
    me: me ? {id:me.id, name:me.name, persona:me.persona, ready:me.ready, active:me.active, finished:me.finished, coins:me.coins} : null,
    top: room.discard.at(-1) ? cardPublic(room.discard.at(-1)) : null,
    deckCount: room.deck.length,
    discardCount: room.discard.length,
    currentPlayerId: active.length ? active[room.turnIndex]?.id : null,
    direction: room.direction,
    chosenSuit: room.chosenSuit,
    penalty: room.penalty,
    eightMode: room.eightMode,
    pendingQueen: !!room.pendingQueen,
    lastAction: room.lastAction,
    bubble: room.bubble,
    roundResults: room.roundResults,
    gameWinnerOrder: room.gameWinnerOrder,
    hand: me ? me.hand.map(cardPublic) : [],
    secret: false
  };
}
function cardPublic(c){ return { id:c.id,suit:c.suit,rank:c.rank,symbol:SUITS[c.suit].symbol,suitName:SUITS[c.suit].name,color:SUITS[c.suit].color,bg:SUITS[c.suit].bg,special:SPECIALS.has(c.rank) }; }
function emitRoom(room, event='state'){
  for(const p of room.players){
    if(p.socketId && io.sockets.sockets.has(p.socketId)) io.to(p.socketId).emit(event, publicState(room,p.id));
  }
}
function bubble(room,text,pid){ room.bubble={text,pid,until:now()+3500}; setTimeout(()=>{if(room.bubble?.until<=now()){room.bubble=null; emitRoom(room);}},3600); }
function nextIndex(room, steps=1){
  const a=activePlayers(room); if(!a.length) return -1;
  const currentPos=room.turnIndex;
  const ordered=room.players.map((p,i)=>({p,i})).filter(x=>x.p.active&&!x.p.disconnected);
  let idx=ordered.findIndex(x=>x.i===currentPos);
  if(idx<0){ idx=ordered.findIndex(x=>x.i>currentPos); if(idx<0) idx=0; }
  idx=(idx + room.direction*steps)%ordered.length; if(idx<0) idx+=ordered.length;
  return ordered[idx].i;
}
function refillDeck(room){
  if(room.deck.length>0) return;
  if(room.discard.length<=1) return;
  const top=room.discard.pop(); room.deck=shuffle(room.discard); room.discard=[top];
}
function drawCards(room,p,count){
  const got=[];
  for(let i=0;i<count;i++){
    refillDeck(room);
    if(!room.deck.length) break;
    got.push(room.deck.pop());
  }
  p.hand.push(...got); return got;
}
function isPlayable(room,p,c){
  if(!p.active || p.id!==room.players[room.turnIndex]?.id) return false;
  if(room.penalty>0) return c.rank==='7';
  if(room.eightMode) return c.suit===room.eightSuit;
  const top=room.discard.at(-1); if(!top) return true;
  const suit=room.chosenSuit || top.suit;
  return c.suit===suit || c.rank===top.rank;
}
function setupRound(room){
  const ps=room.players.filter(p=>!p.disconnected);
  if(ps.length<2) return false;
  room.phase='playing'; room.deck=shuffle(makeDeck()); room.discard=[]; room.direction=1; room.penalty=0; room.eightMode=false; room.eightSuit=null; room.chosenSuit=null; room.finishedOrder=[]; room.roundResults=null; room.gameWinnerOrder=null; room.bubble=null;
  for(const p of room.players){p.hand=[];p.active=true;p.finished=false;p.order=null;p.ready=false;}
  for(let i=0;i<5;i++) for(const p of ps) drawCards(room,p,1);
  let first=room.deck.pop();
  while(first && first.rank==='7') { room.deck.unshift(first); shuffle(room.deck); first=room.deck.pop(); }
  room.discard.push(first); room.turnIndex=room.players.indexOf(ps[0]);
  room.lastAction={text:'Kartalar tarqatildi. O‘yin boshlandi.',type:'start'};
  return true;
}
function finishPlayer(room,p){
  const wasCurrent = room.players[room.turnIndex]?.id===p.id;
  p.active=false; p.finished=true; p.order=room.finishedOrder.length+1; room.finishedOrder.push(p.id); bubble(room,'SOG\' BO\'LASILAR',p.id);
  if(room.finishedOrder.length===room.players.filter(x=>!x.disconnected).length-1){
    const loser=activePlayers(room)[0]; if(loser){ loser.active=false; loser.finished=true; p.order=p.order; room.finishedOrder.push(loser.id); room.gameWinnerOrder=loser.id; bubble(room,'MARIPNI KUYOVI',loser.id); }
    endRound(room); return;
  }
  if(wasCurrent) room.turnIndex=nextIndex(room,1);
}
function endRound(room){
  room.phase='finished';
  const results=room.finishedOrder.map((id,i)=>{const p=player(room,id); const award=i<COINS.length?COINS[i]:1; if(p && p.id!==room.gameWinnerOrder) p.coins+=award; return {id,name:p?.name,persona:p?.persona,order:i+1,coins:award,loser:id===room.gameWinnerOrder};});
  room.roundResults=results;
  room.lastAction={text:'Raund tugadi. Tangalar berildi.',type:'finish'};
  for(const p of room.players) p.ready=false;
}
function chooseSuit(room,suit){ room.chosenSuit=suit; room.eightMode=false; room.eightSuit=null; }
function afterNormalPlay(room,p,c){
  const r=c.rank;
  if(r==='7'){ room.penalty += 2; bubble(room,'AMINI YE!',p.id); room.turnIndex=nextIndex(room,1); return; }
  if(r==='6'){ const target=player(room, room.players[nextIndex(room,1)]?.id); if(target){drawCards(room,target,1); bubble(room,'SEN QARAB TUR',target.id);} room.turnIndex=nextIndex(room,2); return; }
  if(r==='8'){ room.eightMode=true; room.eightSuit=c.suit; room.chosenSuit=c.suit; return; }
  if(r==='Q'){ room.chosenSuit=null; room.pendingQueen=true; return; }
  if(r==='A'){ const target=player(room,room.players[nextIndex(room,1)]?.id); if(target) bubble(room,'AMIZI QISIB TURING',p.id); room.turnIndex=nextIndex(room,2); return; }
  room.chosenSuit=null; room.turnIndex=nextIndex(room,1);
}
function playCard(room,p,cardId,suitChoice){
  if(room.phase!=='playing' || room.players[room.turnIndex]?.id!==p.id || !p.active) return {ok:false,error:'Hozir sizning navbatingiz emas.'};
  const idx=p.hand.findIndex(c=>c.id===cardId); if(idx<0) return {ok:false,error:'Karta topilmadi.'};
  const c=p.hand[idx];
  if(room.pendingQueen && room.players[room.turnIndex]?.id===p.id) return {ok:false,error:'Avval Q uchun mast tanlang.'};
  if(!isPlayable(room,p,c)) return {ok:false,error:'Bu kartani tashlab bo‘lmaydi.'};
  if(room.penalty>0 && c.rank==='7'){
    p.hand.splice(idx,1); room.discard.push(c); room.penalty+=2; room.chosenSuit=null; room.eightMode=false; room.eightSuit=null;
    if(room.penalty>=4) bubble(room,'XAXAXA ASADNI AMI',p.id);
    room.turnIndex=nextIndex(room,1);
    if(p.hand.length===0) finishPlayer(room,p);
    return {ok:true};
  }
  p.hand.splice(idx,1); room.discard.push(c); room.chosenSuit=null; room.pendingQueen=false; room.lastAction={text:`${p.name} ${c.rank} tashladi`,type:'play'};
  afterNormalPlay(room,p,c);
  if(p.hand.length===0){
    // 6/7 effects are still resolved before the player leaves, as required.
    finishPlayer(room,p);
  }
  return {ok:true};
}
function draw(room,p){
  if(room.phase!=='playing' || room.players[room.turnIndex]?.id!==p.id || !p.active) return {ok:false,error:'Hozir sizning navbatingiz emas.'};
  if(room.pendingQueen) return {ok:false,error:'Q uchun mast tanlang.'};
  if(room.penalty>0){ const n=room.penalty; drawCards(room,p,n); room.penalty=0; room.turnIndex=nextIndex(room,1); return {ok:true,drawn:n}; }
  if(room.eightMode){ drawCards(room,p,1); room.eightMode=false; room.eightSuit=null; room.chosenSuit=null; room.turnIndex=nextIndex(room,1); return {ok:true,drawn:1}; }
  drawCards(room,p,1); room.turnIndex=nextIndex(room,1); return {ok:true,drawn:1};
}
function queen(room,p,suit){
  if(room.phase!=='playing' || !room.pendingQueen || room.players[room.turnIndex]?.id!==p.id) return {ok:false,error:'Mast tanlash vaqti emas.'};
  if(!SUITS[suit]) return {ok:false,error:'Noto‘g‘ri mast.'};
  chooseSuit(room,suit); room.pendingQueen=false; bubble(room,'MONIMGA O\'YNELAR',p.id); if(p.hand.length===0){ finishPlayer(room,p); } else { room.turnIndex=nextIndex(room,1); } return {ok:true};
}
function removeRoomIfEmpty(room){ if(room.players.every(p=>p.disconnected)){ rooms.delete(room.code); } }
function sanitizeName(n){ return String(n||'').trim().slice(0,18).replace(/[<>]/g,''); }
function sendError(socket,msg){ socket.emit('toast',{type:'error',text:msg}); }

io.on('connection',(socket)=>{
  sockets.set(socket.id,{room:null,pid:null,secret:false});
  socket.on('createRoom',(payload,cb)=>{
    const name=sanitizeName(payload?.name), persona=payload?.persona;
    if(!name || !PERSONAS[persona]) return cb?.({ok:false,error:'Ism va personajni tanlang.'});
    let code; do{code=roomCode();}while(rooms.has(code));
    const pid=playerId();
    const room={code,hostId:pid,phase:'lobby',players:[],deck:[],discard:[],turnIndex:0,direction:1,penalty:0,chosenSuit:null,eightMode:false,eightSuit:null,pendingQueen:false,lastAction:null,bubble:null,finishedOrder:[],roundResults:null,gameWinnerOrder:null,createdAt:now()};
    const p={id:pid,name,persona,ready:false,active:true,finished:false,order:null,hand:[],coins:0,socketId:socket.id,disconnected:false,lastSeen:now()}; room.players.push(p); rooms.set(code,room); sockets.get(socket.id).room=code; sockets.get(socket.id).pid=pid; socket.join(code); cb?.({ok:true,code,pid}); emitRoom(room);
  });
  socket.on('joinRoom',(payload,cb)=>{
    const code=String(payload?.code||'').toUpperCase().trim(), name=sanitizeName(payload?.name), persona=payload?.persona;
    const room=rooms.get(code); if(!room) return cb?.({ok:false,error:'Bunday xona topilmadi.'});
    if(room.phase!=='lobby') return cb?.({ok:false,error:'O‘yin boshlangan. Yangi o‘yinchi kira olmaydi.'});
    if(room.players.length>=6) return cb?.({ok:false,error:'Xona to‘la.'});
    if(!name || !PERSONAS[persona]) return cb?.({ok:false,error:'Ism va personajni tanlang.'});
    if(room.players.some(p=>p.persona===persona && !p.disconnected)) return cb?.({ok:false,error:'Bu personaj band.'});
    const pid=playerId(), p={id:pid,name,persona,ready:false,active:true,finished:false,order:null,hand:[],coins:0,socketId:socket.id,disconnected:false,lastSeen:now()}; room.players.push(p); sockets.get(socket.id).room=code; sockets.get(socket.id).pid=pid; socket.join(code); cb?.({ok:true,code,pid}); emitRoom(room);
  });
  socket.on('reconnectRoom',(payload,cb)=>{
    const code=String(payload?.code||'').toUpperCase(), pid=payload?.pid; const room=rooms.get(code); const p=room?.players.find(x=>x.id===pid);
    if(!room||!p) return cb?.({ok:false,error:'Qayta ulanish ma’lumoti topilmadi.'});
    p.socketId=socket.id;p.disconnected=false;p.lastSeen=now();clearTimeout(disconnectTimers.get(pid));
    sockets.get(socket.id).room=code;sockets.get(socket.id).pid=pid;socket.join(code);cb?.({ok:true});emitRoom(room);
  });
  socket.on('ready',()=>{ const s=sockets.get(socket.id); const room=rooms.get(s?.room);const p=player(room,s?.pid);if(!room||!p||room.phase!=='lobby')return; p.ready=!p.ready; emitRoom(room); if(room.players.length>=2 && room.players.every(x=>x.ready&&!x.disconnected)) { setupRound(room); emitRoom(room); } });
  socket.on('playCard',({cardId})=>{ const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;const r=playCard(room,p,cardId);if(!r.ok)sendError(socket,r.error);emitRoom(room); });
  socket.on('draw',()=>{const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;const r=draw(room,p);if(!r.ok)sendError(socket,r.error);emitRoom(room);});
  socket.on('queenSuit',({suit})=>{const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;const r=queen(room,p,suit);if(!r.ok)sendError(socket,r.error);emitRoom(room);});
  socket.on('chat',({kind,value})=>{const s=sockets.get(socket.id),room=rooms.get(s?.room),p=player(room,s?.pid);if(!room||!p)return;if(kind==='line'&&!CHAT_LINES.includes(value))return;if(kind==='emoji'&&!EMOJIS.includes(value))return;bubble(room,value,p.id);emitRoom(room);});
  socket.on('secretTap',()=>{const s=sockets.get(socket.id);if(!s)return;const t=now();if(!s.secretTapCount || t-s.lastSecretTap>1500)s.secretTapCount=0;s.lastSecretTap=t;s.secretTapCount++;if(s.secretTapCount>=6){s.secret=!s.secret;s.secretProof=s.secret?crypto.createHmac('sha256',SECRET_CODE).update(socket.id).digest('hex'):null;s.secretTapCount=0;socket.emit('secretResult',{ok:true,enabled:s.secret});}});
  socket.on('secretReveal',({targetId})=>{const s=sockets.get(socket.id),room=rooms.get(s?.room);if(!room||!s.secret||!s.secretProof)return;const target=player(room,targetId);if(!target)return;socket.emit('secretHand',{targetId:target.id,hand:target.hand.map(cardPublic)});});
  socket.on('secretDisable',()=>{const s=sockets.get(socket.id);if(s)s.secret=false;});
  socket.on('newRound',()=>{const s=sockets.get(socket.id),room=rooms.get(s?.room);if(!room||room.phase!=='finished'||room.hostId!==s.pid)return;for(const p of room.players)p.ready=false;room.phase='lobby';room.roundResults=null;room.gameWinnerOrder=null;emitRoom(room);});
  socket.on('disconnect',()=>{const s=sockets.get(socket.id); if(!s)return;const room=rooms.get(s.room),p=player(room,s.pid);if(p){p.disconnected=true;p.lastSeen=now();const t=setTimeout(()=>{const r=rooms.get(s.room);if(!r)return;const pp=player(r,s.pid);if(pp?.disconnected){pp.socketId=null;removeRoomIfEmpty(r);emitRoom(r);}},120000);disconnectTimers.set(p.id,t);emitRoom(room);}sockets.delete(socket.id);});
});

setInterval(()=>{for(const room of rooms.values()){if(now()-room.createdAt>24*3600*1000 && room.phase!=='playing')rooms.delete(room.code);}},3600000);
server.listen(PORT,()=>console.log(`Mau-Mau UZ running on :${PORT}`));
