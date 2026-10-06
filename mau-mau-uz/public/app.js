import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const socket=io({transports:['websocket','polling']});
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const PERSONAS={
 WATUN:{role:'dramatik',asset:'mh_3122.glb'},HOKIM:{role:'boyvachcha',asset:'mh_1037.glb'},XONZODABEGIM:{role:'bezakchi',asset:'mh_1000.glb'},AHROR:{role:'kuchsiz',asset:'mh_1148.glb'},AZIK:{role:'hazilkash',asset:'mh_3244.glb'},BOQQORIN:{role:'ochofat',asset:'mh_3549.glb'}
};
const CHAT=["TASHAAAAA TEZROO KO'T","KALLEZGA QO'TAGIM SIZI","CHOM NIMA BO'LDI","QO'TALA 7 KIMDA","MENDA","QO'TAGIMMI YEMESANMI SHU GAPIGA","MENDAMAS","SEN HOZ KORASAN","KO'TLIK QIMA","OG'ZINGA QO'TAG'IM"];
const EMO=['😂','🤣','😎','😏','😡','😭','🔥','👏','🤡','💀','😱','👀','🥱','🤝'];
const SUITS={BARG:'♣',QALAM:'♦',YURAK:'♥',GUL:'✦'};
const state={screen:'lobby',persona:null,code:null,pid:null,game:null,secret:false,secretTarget:null};

function show(id){$$('.screen').forEach(x=>x.classList.remove('active'));$('#'+id).classList.add('active');state.screen=id;}
function toast(t){const x=$('#toast');x.textContent=t;x.classList.add('show');clearTimeout(x._t);x._t=setTimeout(()=>x.classList.remove('show'),2500)}
function save(){if(state.code&&state.pid)localStorage.setItem('mau-session',JSON.stringify({code:state.code,pid:state.pid}))}
function renderPersonas(players=[]){const taken=new Set(players.map(p=>p.persona));$('#personas').innerHTML=Object.entries(PERSONAS).map(([id,x])=>`<button class="persona ${taken.has(id)?'taken':''} ${state.persona===id?'selected':''}" data-persona="${id}"><div class="mini"><img src="/assets/characters/${x.asset}" alt=""></div><b>${id}</b><small>${x.role}</small></button>`).join('');$$('.persona').forEach(b=>b.onclick=()=>{if(b.classList.contains('taken'))return;state.persona=b.dataset.persona;renderPersonas(players);$('#lobbyHint').textContent=`${state.persona} tanlandi.`})}
renderPersonas();
$('#createBtn').onclick=()=>{if(!state.persona)return toast('Avval personaj tanlang.');socket.emit('createRoom',{persona:state.persona},r=>{if(!r?.ok)return toast(r?.error||'Xatolik');state.code=r.code;state.pid=r.pid;save();show('waiting');$('#waitCode').textContent=r.code})};
$('#joinBtn').onclick=()=>{if(!state.persona)return toast('Avval personaj tanlang.');const code=$('#roomInput').value.trim().toUpperCase();if(code.length!==6)return toast('6 belgili xona kodini kiriting.');socket.emit('joinRoom',{code,persona:state.persona},r=>{if(!r?.ok)return toast(r?.error||'Kirishda xatolik');state.code=r.code;state.pid=r.pid;save();show('waiting');$('#waitCode').textContent=r.code})};
$('#copyBtn').onclick=()=>navigator.clipboard?.writeText(state.code).then(()=>toast('Kod nusxalandi.')).catch(()=>toast(state.code));
$('#copyGameBtn').onclick=()=>navigator.clipboard?.writeText(state.code).then(()=>toast('Kod nusxalandi.'));
$('#readyBtn').onclick=()=>socket.emit('ready');
$('#newRoundBtn').onclick=()=>socket.emit('newRound');
$('#fullscreenBtn').onclick=()=>document.documentElement.requestFullscreen?.();
$('#soundBtn').onclick=()=>toast('Ovoz boshqaruvi keyingi yangilanishda.');
$('#chatLines').innerHTML=CHAT.map((x,i)=>`<button data-i="${i}">${x}</button>`).join('');
$('#chatEmoji').innerHTML=EMO.map((x,i)=>`<button data-i="${i}">${x}</button>`).join('');
$('#chatLines').onclick=e=>{const b=e.target.closest('button');if(b)socket.emit('chat',{kind:'line',value:CHAT[+b.dataset.i]})};
$('#chatEmoji').onclick=e=>{const b=e.target.closest('button');if(b)socket.emit('chat',{kind:'emoji',value:EMO[+b.dataset.i]})};
$('#secretViewerClose').onclick=()=>$('#secretViewer').classList.add('hidden');

let renderer,camera,scene,labelRenderer,raycaster,clock;
const world={chars:new Map(),mixers:[],handMeshes:[],table:null,drawMesh:null,topMesh:null};
const loader=new GLTFLoader();
const positions=[
 {x:0,z:-5.0,rot:0.0},{x:-4.1,z:-2.5,rot:0.75},{x:-4.1,z:2.5,rot:2.35},{x:0,z:5.0,rot:Math.PI},{x:4.1,z:2.5,rot:0.8},{x:4.1,z:-2.5,rot:-0.8}
];
function init3D(){
 scene=new THREE.Scene(); scene.background=new THREE.Color(0x071219); scene.fog=new THREE.Fog(0x071219,10,26);
 camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.1,100);camera.position.set(0,8.6,11.5);camera.lookAt(0,0.9,0);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;$('#scene').appendChild(renderer.domElement);
 labelRenderer=new CSS2DRenderer();labelRenderer.setSize(innerWidth,innerHeight);labelRenderer.domElement.style.position='absolute';labelRenderer.domElement.style.inset='0';labelRenderer.domElement.style.pointerEvents='none';$('#scene').appendChild(labelRenderer.domElement);
 raycaster=new THREE.Raycaster();clock=new THREE.Clock();
 const hemi=new THREE.HemisphereLight(0xf4d8a2,0x071b1c,2.2);scene.add(hemi);
 const key=new THREE.DirectionalLight(0xffdfad,3.5);key.position.set(-5,9,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);scene.add(key);
 const fill=new THREE.PointLight(0x4cc8bb,18,18);fill.position.set(0,5,0);scene.add(fill);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(16,96),new THREE.MeshStandardMaterial({color:0x102225,roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=-.12;floor.receiveShadow=true;scene.add(floor);
 buildTable();
 window.addEventListener('resize',resize);renderer.domElement.addEventListener('pointerdown',onPointer);
 animate();
}
function buildTable(){
 const group=new THREE.Group();
 const base=new THREE.Mesh(new THREE.CylinderGeometry(5.65,5.8,.75,96),new THREE.MeshStandardMaterial({color:0x4a2b17,roughness:.5,metalness:.12}));base.position.y=.35;base.castShadow=true;base.receiveShadow=true;group.add(base);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(5.05,.24,18,96),new THREE.MeshStandardMaterial({color:0xc39850,metalness:.6,roughness:.25}));rim.rotation.x=Math.PI/2;rim.position.y=.78;group.add(rim);
 const felt=new THREE.Mesh(new THREE.CylinderGeometry(5.0,5.0,.14,96),new THREE.MeshStandardMaterial({color:0x07574f,roughness:.78}));felt.position.y=.76;felt.receiveShadow=true;group.add(felt);
 const pattern=new THREE.Mesh(new THREE.RingGeometry(2.6,2.8,64),new THREE.MeshStandardMaterial({color:0x1b796d,roughness:.8,side:THREE.DoubleSide}));pattern.rotation.x=-Math.PI/2;pattern.position.y=.84;group.add(pattern);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.13),new THREE.MeshStandardMaterial({color:0xd8ad55,metalness:.8,roughness:.2}));gem.position.set(Math.cos(a)*4.5,.9,Math.sin(a)*4.5);group.add(gem)}
 scene.add(group);world.table=group;
 const draw=new THREE.Mesh(new THREE.BoxGeometry(1.25,.18,1.75),cardMat('BACK'));draw.position.set(-.75,.98,0);draw.rotation.y=.08;draw.castShadow=true;draw.userData.draw=true;scene.add(draw);world.drawMesh=draw;
 const top=new THREE.Mesh(new THREE.BoxGeometry(1.25,.18,1.75),cardMat('FRONT'));top.position.set(.85,1.02,0);top.rotation.y=-.12;top.visible=false;top.castShadow=true;scene.add(top);world.topMesh=top;
}
function cardCanvas(kind,rank,suit){const c=document.createElement('canvas');c.width=256;c.height=360;const x=c.getContext('2d');if(kind==='BACK'){x.fillStyle='#082f42';x.fillRect(0,0,256,360);x.strokeStyle='#d9ad55';x.lineWidth=9;x.strokeRect(14,14,228,332);x.strokeStyle='#2a9a8e';x.lineWidth=3;for(let i=-360;i<500;i+=34){x.beginPath();x.moveTo(i,0);x.lineTo(i+360,360);x.stroke();x.beginPath();x.moveTo(i+360,0);x.lineTo(i,360);x.stroke()}x.fillStyle='#d9ad55';x.font='bold 56px serif';x.textAlign='center';x.fillText('✦',128,190)}else{x.fillStyle='#f6f0dc';x.fillRect(0,0,256,360);x.strokeStyle='#d6ad59';x.lineWidth=9;x.strokeRect(10,10,236,340);x.fillStyle=suit==='YURAK'?'#d64d62':suit==='QALAM'?'#b47a1f':suit==='GUL'?'#6858b8':'#196c5c';x.font='900 74px Georgia';x.textAlign='center';x.fillText(rank,128,92);x.font='900 82px Georgia';x.fillText(SUITS[suit],128,205);x.fillStyle='#222';x.font='700 16px Manrope';x.fillText(rank==='Q'?'WATUN':rank==='K'?'HOKIM':rank==='J'?'HALIMA':rank,128,295);if(['Q','K','J'].includes(rank)){x.strokeStyle='#b89042';x.lineWidth=5;x.strokeRect(58,230,140,70)}}return c}
const texCache=new Map();
function cardMat(kind,rank='A',suit='BARG'){const key=`${kind}-${rank}-${suit}`;if(!texCache.has(key)){const t=new THREE.CanvasTexture(cardCanvas(kind,rank,suit));t.colorSpace=THREE.SRGBColorSpace;texCache.set(key,t)}const tex=texCache.get(key);return new THREE.MeshStandardMaterial({map:tex,roughness:.45,metalness:.05})}
function createCardMesh(c){const g=new THREE.Group();const geo=new THREE.BoxGeometry(1.08,.10,1.52);const mats=[cardMat('BACK'),cardMat('BACK'),cardMat('BACK'),cardMat('BACK'),cardMat('FRONT',c.rank,c.suit),cardMat('FRONT',c.rank,c.suit)];const m=new THREE.Mesh(geo,mats);m.castShadow=true;m.receiveShadow=true;m.userData.cardId=c.id;g.add(m);g.userData.cardId=c.id;return g}
function clearHand(){world.handMeshes.forEach(m=>scene.remove(m));world.handMeshes=[]}
function renderHand(g){clearHand();const hand=g.hand||[];const n=hand.length;hand.forEach((c,i)=>{const m=createCardMesh(c);const t=n===1?0:(i-(n-1)/2)/Math.max(n-1,1);m.position.set(t*1.18,1.22,4.15-Math.abs(t)*.55);m.rotation.set(-.14,t*.22,t*.10);m.userData.cardId=c.id;m.userData.card=c;scene.add(m);world.handMeshes.push(m)})}
function clearChars(){world.chars.forEach(x=>{scene.remove(x.group);if(x.label)x.label.element.remove()});world.chars.clear();world.mixers=[]}
async function addCharacter(p,index){
 try{
  const gltf=await loader.loadAsync('/assets/characters/'+PERSONAS[p.persona].asset);const root=gltf.scene;root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
  const group=new THREE.Group();root.scale.setScalar(1.65);group.add(root);const pos=positions[index%positions.length];group.position.set(pos.x,0,pos.z);group.rotation.y=pos.rot;
  const mixer=new THREE.AnimationMixer(root);const clips=gltf.animations;const idle=clips.find(c=>c.name==='idle_unarmed')||clips.find(c=>c.name==='idle');if(idle)mixer.clipAction(idle).play();
  const labelEl=document.createElement('div');labelEl.className='name-label';labelEl.textContent=p.name;const label=new CSS2DObject(labelEl);label.position.set(0,2.05,0);group.add(label);
  const hand=root.getObjectByName('hand_r');if(hand){const mini=new THREE.Mesh(new THREE.BoxGeometry(.24,.025,.34),cardMat('BACK'));mini.position.set(.09,.03,.10);mini.rotation.x=Math.PI/2;hand.add(mini)}
  const bubbleEl=document.createElement('div');bubbleEl.className='speech';bubbleEl.style.display='none';const bubble=new CSS2DObject(bubbleEl);bubble.position.set(0,2.7,0);group.add(bubble);
  scene.add(group);world.chars.set(p.id,{group,root,mixer,clips,bubble,label,p,gestureUntil:0});world.mixers.push(mixer);
 }catch(e){console.error('GLB load failed',p.persona,e);toast(`${p.persona} 3D modeli yuklanmadi.`)}
}
async function renderCharacters(g){
 const wanted=g.players.filter(p=>!p.disconnected);const same=wanted.length===world.chars.size&&wanted.every(p=>world.chars.has(p.id));
 if(!same){clearChars();await Promise.all(wanted.map((p,i)=>addCharacter(p,i)))}
 wanted.forEach((p,i)=>{const x=world.chars.get(p.id);if(!x)return;const pos=positions[i%positions.length];x.group.position.set(pos.x,0,pos.z);x.group.rotation.y=pos.rot;const isTurn=g.currentPlayerId===p.id;x.label.element.style.borderColor=isTurn?'#f2d68a':'#d8ad5555';x.label.element.innerHTML=`<b>${p.name}</b><span class="coin-label">🪙 ${p.coins}</span>`;x.bubble.element.style.display=g.bubble?.pid===p.id?'block':'none';if(g.bubble?.pid===p.id){x.bubble.element.textContent=g.bubble.text;x.gestureUntil=performance.now()+1000;playGesture(x)}});
}
function playGesture(x){const clip=x.clips.find(c=>c.name==='punch_jab')||x.clips.find(c=>c.name==='grenade_throw')||x.clips.find(c=>c.name==='turn_right');if(!clip)return;const a=x.mixer.clipAction(clip);a.reset().setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.fadeIn(.08).play();setTimeout(()=>a.fadeOut(.15),Math.min(900,clip.duration*1000*.8))}
function updateCenter(g){
 if(world.topMesh){world.topMesh.visible=!!g.top;if(g.top){world.topMesh.material[4]=cardMat('FRONT',g.top.rank,g.top.suit);world.topMesh.material[5]=world.topMesh.material[4]}}
 $('#turnBanner').textContent=g.pendingQueen?'Q: MAST TANLANG':g.currentPlayerId===g.me?.id?(g.penalty?`SIZNING NAVBAT — ${g.penalty} TA JARIMA`:'SIZNING NAVBATINGIZ'):`${g.players.find(p=>p.id===g.currentPlayerId)?.name||''} NAVBATIDA`;
 $('#queenPanel').classList.toggle('hidden',!g.pendingQueen||g.currentPlayerId!==g.me?.id);
 $('#leaderRows').innerHTML=[...g.players].sort((a,b)=>b.coins-a.coins).map((p,i)=>`<div class="leader-row"><span>${i+1}. ${p.name}</span><b>🪙 ${p.coins}</b></div>`).join('');
}
function renderWaiting(g){$('#waitCode').textContent=g.code;const spots=[[50,17],[18,28],[18,72],[50,83],[82,72],[82,28]];$('#waitPlayers').innerHTML=g.players.map((p,i)=>{const s=spots[i%6];return `<div class="wait-player" style="left:${s[0]}%;top:${s[1]}%"><div class="wait-avatar"><img src="/assets/characters/${PERSONAS[p.persona].asset}"></div><b><span class="ready-dot ${p.ready?'on':''}"></span>${p.name}</b></div>`}).join('');$('#readyBtn').textContent=g.me?.ready?'TAYYOR':'BOSHLASH'}
function renderResults(g){$('#results').innerHTML=(g.roundResults||[]).map(r=>`<div class="result ${r.loser?'loser':''}"><span>${r.order}. ${r.name}</span><strong>${r.loser?'YUTQAZDI':'+'+r.coins+' 🪙'}</strong></div>`).join('')}
function onPointer(e){
 if(state.screen!=='game')return;const rect=renderer.domElement.getBoundingClientRect();const p=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(p,camera);const hits=raycaster.intersectObjects(world.handMeshes,true);const hit=hits[0]?.object;const cardId=hit?.userData?.cardId;if(cardId){socket.emit('playCard',{cardId});return}if(world.drawMesh&&raycaster.intersectObject(world.drawMesh).length){socket.emit('draw')}}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);labelRenderer.setSize(innerWidth,innerHeight)}
function animate(){requestAnimationFrame(animate);const dt=clock?.getDelta()||0;world.mixers.forEach(m=>m.update(dt));renderer?.render(scene,camera);labelRenderer?.render(scene,camera)}

const tap={count:0,last:0};
$('#secretOrnament').addEventListener('click',e=>{e.stopPropagation();const t=Date.now();if(tap.count&&t-tap.last>1500)tap.count=0;tap.last=t;tap.count++;if(tap.count===6){tap.count=0;socket.emit('secretTap')}});
document.addEventListener('click',e=>{if(!e.target.closest('#secretOrnament')){if(tap.count&&Date.now()-tap.last>1500)tap.count=0}});

document.addEventListener('click',e=>{if(state.secret&&e.target.closest('.name-label')){const label=e.target.closest('.name-label');const name=label.textContent.trim().split('🪙')[0].trim();const p=state.game?.players.find(x=>x.name===name);if(p)socket.emit('secretReveal',{targetId:p.id})}});

socket.on('connect',()=>{$('#connection').textContent='● Ulangan';const s=JSON.parse(localStorage.getItem('mau-session')||'null');if(s)socket.emit('reconnectRoom',s,r=>{if(r?.ok){state.code=s.code;state.pid=s.pid}else localStorage.removeItem('mau-session')})});
socket.on('disconnect',()=>$('#connection').textContent='● Aloqa uzildi');
socket.on('toast',x=>toast(x.text));
socket.on('secretResult',x=>{state.secret=!!x.enabled;$('#secretHint').classList.toggle('hidden',!state.secret);if(!state.secret)$('#secretViewer').classList.add('hidden')});
socket.on('secretHand',x=>{const p=state.game?.players.find(p=>p.id===x.targetId);if(!p)return;$('#secretViewerTitle').textContent=`${p.name} — maxfiy qo‘l`;$('#secretViewerCards').innerHTML=x.hand.map(c=>`<div class="secret-card" style="color:${c.color}">${c.rank}${c.symbol}</div>`).join('');$('#secretViewer').classList.remove('hidden')});
socket.on('state',async g=>{state.game=g;state.code=g.code;save();if(g.phase==='lobby'){show('waiting');renderWaiting(g)}else if(g.phase==='playing'){show('game');if(!renderer)init3D();$('#roomCode').textContent=g.code;renderHand(g);updateCenter(g);await renderCharacters(g)}else if(g.phase==='finished'){show('finished');renderResults(g)}});
$('#suitButtons').innerHTML=Object.entries(SUITS).map(([s,v])=>`<button data-suit="${s}">${v}</button>`).join('');$('#suitButtons').onclick=e=>{const b=e.target.closest('button');if(b)socket.emit('queenSuit',{suit:b.dataset.suit})};
