const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let THREE, GLTFLoader;
  let renderer, scene, camera, clock, flashlight, flashlightTarget;
  let houseTexture, wallTexture, metalMaterial, woodMaterial, floorMaterial;
  let wallMeshes = [];
  let mapWalls = [];
  let solidColliders = [];
  let interactables = [];
  let pointLights = [];
  let doorPivot, doorPanel, doorCollider = null;
  let enemyMixer = null;
  let enemyFallback = null;
  let enemyModel = null;
  let enemyActions = new Map();
  let currentEnemyAction = null;
  let toastTimeout = null;
  let audioContext = null;
  let droneGain = null;
  let noiseTimer = 0;
  let noisePosition = null;
  let noiseRadius = 0;
  let noiseLifetime = 0;
  let mapTimer = 0;
  let gameClock = 0;
  let footstepClock = 0;
  let cameraBob = 0;
  let yaw = 0;
  let pitch = 0;
  let player = { x: 0, z: 13.2, stamina: 100, crouched: false, hidden: false, moving: false, flashlightOn: true };
  let inventory = { key: false, cutters: false };
  let attempts = 5;
  let gameState = 'menu'; // menu, playing, paused, caught, won, error
  let doorOpened = false;
  let isTouchDevice = matchMedia('(pointer:coarse)').matches || matchMedia('(max-width:720px)').matches;
  let lastToast = '';
  const keys = new Set();
  const touchInput = { x: 0, y: 0, run: false, lookId: null, lookX: 0, lookY: 0 };
  const ENEMY_MODEL_URL = 'https://gobkit.com/freebies/human001/GrandmaShopper.glb';

  function showFatalError(message) {
    $('loading-screen').style.display = 'none';
    $('overlay-stack').style.display = 'flex';
    for (const id of ['start-screen','pause-screen','caught-screen','win-screen','controls-screen']) $(id).hidden = true;
    $('error-screen').hidden = false;
    $('error-copy').textContent = message || 'The 3D engine could not start. Check your internet connection and open the game through a local web server.';
    gameState = 'error';
  }

  async function boot() {
    try {
      const [threeModule, loaderModule] = await Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')]);
      THREE = threeModule;
      GLTFLoader = loaderModule.GLTFLoader;
      initializeGame();
    } catch (error) {
      console.error('House of Echoes initialization failed:', error);
      showFatalError('Could not load Three.js from the CDN. Make sure you are online, then run this folder with `python -m http.server 8080` and open http://localhost:8080. Opening the HTML file directly may block ES modules.');
    }
  }

  function initializeGame() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x08090d, 1);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x08090d);
      scene.fog = new THREE.FogExp2(0x090b10, 0.014);
      camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.06, 90);
      camera.rotation.order = 'YXZ';
      camera.position.set(player.x, 1.63, player.z);
      clock = new THREE.Clock();

      createTextures();
      createLighting();
      buildHouse();
      createFrontDoor();
      createWorldItems();
      createEnemy();
      createFlashlight();
      attachEvents();
      drawMap();
      updateObjectiveUI();
      updateHUD();
      $('loading-screen').style.display = 'none';
      if (isTouchDevice) document.body.classList.add('mobile');
      animate();
    } catch (error) {
      console.error('House of Echoes scene failed:', error);
      showFatalError('The 3D scene could not be created. Try a current desktop browser with WebGL enabled. Details: ' + (error?.message || 'unknown error'));
    }
  }

  function createTextures() {
    const woodCanvas = document.createElement('canvas');
    woodCanvas.width = 512; woodCanvas.height = 512;
    const wc = woodCanvas.getContext('2d');
    wc.fillStyle = '#544334'; wc.fillRect(0,0,512,512);
    for (let y = 0; y < 512; y += 32) {
      const hue = 22 + Math.random()*8;
      wc.fillStyle = `hsl(${hue},24%,${22+Math.random()*12}%)`; wc.fillRect(0,y,512,30);
      wc.strokeStyle = 'rgba(13,8,5,.23)'; wc.lineWidth = 2; wc.beginPath(); wc.moveTo(0,y+30); wc.lineTo(512,y+30); wc.stroke();
      for (let k = 0; k < 28; k++) {
        const yy = y + Math.random()*28;
        wc.strokeStyle = `rgba(${Math.random()>0.5?'12,7,3':'206,164,113'},${.025+Math.random()*.09})`;
        wc.lineWidth = .5 + Math.random()*2; wc.beginPath(); wc.moveTo(0,yy); wc.bezierCurveTo(120,yy-3,300,yy+4,512,yy-2); wc.stroke();
      }
      for (let x = 80 + Math.random()*80; x < 512; x += 170 + Math.random()*70) {
        wc.strokeStyle='rgba(10,7,5,.35)'; wc.lineWidth=1; wc.beginPath(); wc.moveTo(x,y+2); wc.lineTo(x,y+30); wc.stroke();
      }
    }
    houseTexture = new THREE.CanvasTexture(woodCanvas); houseTexture.wrapS = houseTexture.wrapT = THREE.RepeatWrapping; houseTexture.repeat.set(2,2); houseTexture.colorSpace = THREE.SRGBColorSpace; houseTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const floorCanvas = document.createElement('canvas'); floorCanvas.width = 512; floorCanvas.height = 512;
    const fc = floorCanvas.getContext('2d'); fc.fillStyle='#493b30'; fc.fillRect(0,0,512,512);
    for (let row=0; row<16; row++) {
      const yy=row*32; fc.fillStyle=`hsl(${24+Math.random()*6},22%,${17+Math.random()*11}%)`; fc.fillRect(0,yy,512,31);
      fc.strokeStyle='rgba(5,4,3,.65)'; fc.lineWidth=1.5; fc.beginPath(); fc.moveTo(0,yy+31); fc.lineTo(512,yy+31); fc.stroke();
      for(let x=(row%2)*64; x<512; x+=128) { fc.strokeStyle='rgba(9,6,4,.5)'; fc.beginPath(); fc.moveTo(x,yy); fc.lineTo(x,yy+32); fc.stroke(); }
      for(let j=0;j<18;j++){ const xx=Math.random()*512, y=yy+Math.random()*30; fc.strokeStyle=`rgba(201,157,103,${Math.random()*.1})`; fc.lineWidth=.5+Math.random(); fc.beginPath(); fc.moveTo(xx,y); fc.lineTo(Math.min(512,xx+15+Math.random()*80),y+(Math.random()-.5)*2); fc.stroke(); }
    }
    const floorTex=new THREE.CanvasTexture(floorCanvas); floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping; floorTex.repeat.set(2,3.2); floorTex.colorSpace=THREE.SRGBColorSpace; floorTex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    floorMaterial = new THREE.MeshStandardMaterial({map:floorTex, roughness:.86, metalness:.02});

    const wallCanvas = document.createElement('canvas'); wallCanvas.width=256; wallCanvas.height=512;
    const wctx=wallCanvas.getContext('2d'); wctx.fillStyle='#696052'; wctx.fillRect(0,0,256,512);
    for(let x=0;x<256;x+=21){wctx.fillStyle=x%42===0?'rgba(20,14,12,.12)':'rgba(199,177,140,.06)';wctx.fillRect(x,0,2,512);}
    for(let i=0;i<4800;i++){const g=Math.random()>.5?255:0;wctx.fillStyle=`rgba(${g},${g},${g},${Math.random()*.07})`;wctx.fillRect(Math.random()*256,Math.random()*512,1+Math.random()*3,1+Math.random()*4);}
    wallTexture=new THREE.CanvasTexture(wallCanvas); wallTexture.wrapS=wallTexture.wrapT=THREE.RepeatWrapping; wallTexture.repeat.set(1,1); wallTexture.colorSpace=THREE.SRGBColorSpace;
    woodMaterial = new THREE.MeshStandardMaterial({map:houseTexture, color:0xb7a28b, roughness:.82});
    metalMaterial = new THREE.MeshStandardMaterial({color:0x3c403e, metalness:.72, roughness:.32});
  }

  function createLighting() {
    scene.add(new THREE.HemisphereLight(0x9aa4b8, 0x15100d, 0.32));
    const moon = new THREE.DirectionalLight(0x7c91ac, 0.32);
    moon.position.set(-8, 12, -11); moon.castShadow = true; moon.shadow.mapSize.set(1024,1024);
    moon.shadow.camera.left=-24; moon.shadow.camera.right=24; moon.shadow.camera.top=24; moon.shadow.camera.bottom=-24; moon.shadow.bias=-0.0003; scene.add(moon);
    const fill = new THREE.AmbientLight(0x6f5645, 0.16); scene.add(fill);
  }

  function addBoxMesh(width,height,depth,material,x,y,z, opts={}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width,height,depth), material);
    mesh.position.set(x,y,z);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    if (opts.rotationY) mesh.rotation.y = opts.rotationY;
    scene.add(mesh);
    if (opts.collider) addCollider(x-width/2,x+width/2,z-depth/2,z+depth/2,opts.type||'prop');
    return mesh;
  }

  function addCollider(minX,maxX,minZ,maxZ,type='wall') {
    const box = {minX,maxX,minZ,maxZ,type}; solidColliders.push(box); return box;
  }

  function addWallX(start,end,z) {
    if (end-start < .12) return;
    const length=end-start, thickness=.32, height=4.25, x=(start+end)/2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length,height,thickness), new THREE.MeshStandardMaterial({map:wallTexture, color:0x9b9281, roughness:.92}));
    mesh.position.set(x,height/2,z); mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh); wallMeshes.push(mesh);
    const c={minX:start,maxX:end,minZ:z-thickness/2,maxZ:z+thickness/2,type:'wall'}; solidColliders.push(c); mapWalls.push(c);
  }

  function addWallZ(start,end,x) {
    if (end-start < .12) return;
    const length=end-start, thickness=.32, height=4.25, z=(start+end)/2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness,height,length), new THREE.MeshStandardMaterial({map:wallTexture, color:0x999080, roughness:.92}));
    mesh.position.set(x,height/2,z); mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh); wallMeshes.push(mesh);
    const c={minX:x-thickness/2,maxX:x+thickness/2,minZ:start,maxZ:end,type:'wall'}; solidColliders.push(c); mapWalls.push(c);
  }

  function buildWallXWithOpenings(start,end,z,openings=[]) {
    let cursor=start;
    for (const o of [...openings].sort((a,b)=>a.center-b.center)) {
      const left=Math.max(start,o.center-o.width/2), right=Math.min(end,o.center+o.width/2);
      addWallX(cursor,left,z); cursor=Math.max(cursor,right);
    }
    addWallX(cursor,end,z);
  }

  function buildWallZWithOpenings(start,end,x,openings=[]) {
    let cursor=start;
    for (const o of [...openings].sort((a,b)=>a.center-b.center)) {
      const left=Math.max(start,o.center-o.width/2), right=Math.min(end,o.center+o.width/2);
      addWallZ(cursor,left,x); cursor=Math.max(cursor,right);
    }
    addWallZ(cursor,end,x);
  }

  function buildHouse() {
    // Floor and ceiling: the playable map spans x = -14..14 and z = -18..18.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28,36), floorMaterial); floor.rotation.x=-Math.PI/2; floor.position.set(0,0,0); floor.receiveShadow=true; scene.add(floor);
    const ceilingMaterial = new THREE.MeshStandardMaterial({color:0x292a2b, roughness:1, side:THREE.DoubleSide});
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(28,36), ceilingMaterial); ceiling.rotation.x=Math.PI/2; ceiling.position.set(0,4.25,0); ceiling.receiveShadow=true; scene.add(ceiling);

    // Outer walls; the south wall has a 2.5 m doorway for the chained front exit.
    buildWallXWithOpenings(-14,14,-18,[]);
    buildWallZWithOpenings(-18,18,-14,[]);
    buildWallZWithOpenings(-18,18,14,[]);
    buildWallXWithOpenings(-14,14,18,[{center:0,width:2.6}]);

    // Central hall partitions and three door openings on each wing.
    const hallDoors=[{center:-12.2,width:2.25},{center:-2.1,width:2.25},{center:7.9,width:2.25}];
    buildWallZWithOpenings(-18,10,-2.5,hallDoors);
    buildWallZWithOpenings(-18,10,2.5,hallDoors);

    // Left / right room dividers. Doorways align with the actual room flow.
    buildWallXWithOpenings(-14,-2.65,4.25,[{center:-8.1,width:2.0}]);
    buildWallXWithOpenings(-14,-2.65,-6.5,[{center:-8.1,width:2.0}]);
    buildWallXWithOpenings(2.65,14,4.25,[{center:8.0,width:2.0}]);
    buildWallXWithOpenings(2.65,14,-6.5,[{center:8.0,width:2.0}]);

    // Trim strips and skirting boards brighten room silhouettes in the flashlight.
    const trimMat=new THREE.MeshStandardMaterial({color:0x35291f,roughness:.76});
    for(const c of mapWalls){
      const width=c.maxX-c.minX, depth=c.maxZ-c.minZ;
      if(width>depth){addBoxMesh(width,.12,.035,trimMat,(c.minX+c.maxX)/2,.12,(c.minZ+c.maxZ)/2,{castShadow:false});}
      else {addBoxMesh(.035,.12,depth,trimMat,(c.minX+c.maxX)/2,.12,(c.minZ+c.maxZ)/2,{castShadow:false});}
    }

    // Room lights: dim, warm and deliberately uneven.
    const lightSpots=[[-8,2,-12.4],[8,2,-12.2],[-8,2,-1.3],[8,2,-1.3],[-8,2,7],[8,2,7],[0,2,-8],[0,2,4],[0,2,13]];
    for(let i=0;i<lightSpots.length;i++){
      const [x,_,z]=lightSpots[i];
      const fixture = new THREE.Mesh(new THREE.CylinderGeometry(.12,.25,.13,10),new THREE.MeshStandardMaterial({color:0x342b25,roughness:.7})); fixture.position.set(x,3.95,z); scene.add(fixture);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.095,8,8),new THREE.MeshStandardMaterial({color:0xffca85,emissive:0xd47d36,emissiveIntensity:.55,roughness:.25})); bulb.position.set(x,3.82,z); scene.add(bulb);
      const light = new THREE.PointLight(i===1||i===4?0x9aa8ba:0xd9a36c, i===1||i===4?.6:1.15, 8.8, 2); light.position.set(x,3.65,z); scene.add(light); pointLights.push({light,base:light.intensity,phase:Math.random()*7});
    }

    // Exterior-facing cold glows make the old house feel closed off from the night.
    const coldMat=new THREE.MeshBasicMaterial({color:0x3d4b61,transparent:true,opacity:.3,side:THREE.DoubleSide});
    for(const [x,z,rot] of [[-7,-17.77,0],[7,-17.77,0],[-13.77,-2.5,Math.PI/2],[13.77,7,Math.PI/2]]){
      const pane=new THREE.Mesh(new THREE.PlaneGeometry(1.65,1.35),coldMat); pane.position.set(x,2.45,z); pane.rotation.y=rot; scene.add(pane);
      const edge=new THREE.Mesh(new THREE.BoxGeometry(rot===0?1.82:.06,1.5,rot===0?.06:1.82),new THREE.MeshStandardMaterial({color:0x3b3228,roughness:.8})); edge.position.copy(pane.position); scene.add(edge);
      const glow=new THREE.PointLight(0x475c7c,.18,4,2); glow.position.set(x,2.6,z); scene.add(glow);
    }

    // The foyer rug and scuffed floor markings give the entrance a readable landmark.
    addBoxMesh(4.2,.035,3.0,new THREE.MeshStandardMaterial({color:0x3a2424,roughness:1}),0,.018,13.7,{castShadow:false});
    const rugEdge=new THREE.Mesh(new THREE.BoxGeometry(4.05,.04,2.85),new THREE.MeshStandardMaterial({color:0x6a4a3a,roughness:1})); rugEdge.position.set(0,.02,13.7); scene.add(rugEdge);
    addBoxMesh(3.92,.044,2.72,new THREE.MeshStandardMaterial({color:0x332322,roughness:1}),0,.044,13.7,{castShadow:false});
  }

  function createFrontDoor() {
    doorPivot = new THREE.Group(); doorPivot.position.set(-1.25,0,17.7); scene.add(doorPivot);
    const doorWood=new THREE.MeshStandardMaterial({map:houseTexture,color:0x8b6a4e,roughness:.78});
    doorPanel=new THREE.Group(); doorPanel.position.set(1.25,0,0); doorPivot.add(doorPanel);
    const slab= new THREE.Mesh(new THREE.BoxGeometry(2.45,3.6,.2),doorWood); slab.position.set(0,1.8,0); slab.castShadow=true; slab.receiveShadow=true; doorPanel.add(slab);
    for(const x of [-.77,0,.77]) { const inset=new THREE.Mesh(new THREE.BoxGeometry(.62,1.18,.045),new THREE.MeshStandardMaterial({color:0x493429,roughness:.85})); inset.position.set(x,2.25,-.126); doorPanel.add(inset); }
    const bottomPanel=new THREE.Mesh(new THREE.BoxGeometry(1.95,.78,.045),new THREE.MeshStandardMaterial({color:0x513b2c,roughness:.85})); bottomPanel.position.set(0,.68,-.126); doorPanel.add(bottomPanel);
    const handle=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),new THREE.MeshStandardMaterial({color:0x9d855b,metalness:.78,roughness:.28})); handle.position.set(.91,1.65,-.19); doorPanel.add(handle);
    const chainMat=new THREE.MeshStandardMaterial({color:0x4c4b45,metalness:.72,roughness:.38});
    for(let i=0;i<6;i++) { const link=new THREE.Mesh(new THREE.TorusGeometry(.075,.022,5,10),chainMat); link.position.set(-.5+i*.2,1.66,-.17); link.rotation.y=Math.PI/2; doorPanel.add(link); }
    const lockMesh=new THREE.Mesh(new THREE.BoxGeometry(.18,.35,.1),new THREE.MeshStandardMaterial({color:0x222626,metalness:.6,roughness:.5})); lockMesh.position.set(.83,1.75,-.18); doorPanel.add(lockMesh);
    doorCollider=addCollider(-1.34,1.34,17.47,17.96,'exit-door');
    interactables.push({kind:'exit',x:0,z:17.1,active:true});
  }

  function createTable(x,z,w=2.3,d=1.25,topColor=0x4b382a) {
    const top=addBoxMesh(w,.14,d,new THREE.MeshStandardMaterial({map:houseTexture,color:topColor,roughness:.83}),x,.88,z,{collider:false});
    const legMat=new THREE.MeshStandardMaterial({color:0x2d211a,roughness:.9});
    for(const dx of [-w/2+.14,w/2-.14]) for(const dz of [-d/2+.14,d/2-.14]) addBoxMesh(.13,.82,.13,legMat,x+dx,.42,z+dz,{collider:false});
    addCollider(x-w/2,x+w/2,z-d/2,z+d/2,'table');
    return top;
  }

  function createChair(x,z,rotation=0) {
    const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotation; scene.add(g);
    const legMat=new THREE.MeshStandardMaterial({color:0x34251a,roughness:.85});
    const seatMat=new THREE.MeshStandardMaterial({map:houseTexture,color:0x806347,roughness:.85});
    const seat=new THREE.Mesh(new THREE.BoxGeometry(.68,.12,.62),seatMat); seat.position.y=.48; seat.castShadow=true; g.add(seat);
    const back=new THREE.Mesh(new THREE.BoxGeometry(.66,.82,.12),seatMat); back.position.set(0,.9,-.25); g.add(back);
    for(const dx of [-.25,.25]) for(const dz of [-.22,.22]) { const leg=new THREE.Mesh(new THREE.BoxGeometry(.09,.47,.09),legMat); leg.position.set(dx,.23,dz); g.add(leg); }
    return g;
  }

  function createSofa(x,z,rotation=0) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;scene.add(g);
    const baseMat=new THREE.MeshStandardMaterial({color:0x423632,roughness:.95}); const cushionMat=new THREE.MeshStandardMaterial({color:0x65504a,roughness:1});
    const base=new THREE.Mesh(new THREE.BoxGeometry(3.05,.55,1.05),baseMat); base.position.y=.42; base.castShadow=true; g.add(base);
    const back=new THREE.Mesh(new THREE.BoxGeometry(3.05,.82,.27),baseMat); back.position.set(0,.95,-.4); g.add(back);
    for(const xoff of [-.93,0,.93]) {const c=new THREE.Mesh(new THREE.BoxGeometry(.86,.22,.72),cushionMat);c.position.set(xoff,.77,.04);c.castShadow=true;g.add(c);}
    const a=new THREE.Mesh(new THREE.BoxGeometry(.3,.65,1.06),baseMat);a.position.set(-1.37,.58,0);g.add(a);const b=a.clone();b.position.x=1.37;g.add(b);
    addCollider(x-1.55,x+1.55,z-.55,z+.55,'sofa');
  }

  function createBed(x,z) {
    const frameMat=new THREE.MeshStandardMaterial({color:0x38291e,roughness:.86});
    addBoxMesh(3.3,.36,2.45,frameMat,x,.38,z,{collider:false});
    addBoxMesh(3.22,.23,2.34,new THREE.MeshStandardMaterial({color:0x776f65,roughness:1}),x,.64,z,{collider:false});
    addBoxMesh(3.15,.2,2.28,new THREE.MeshStandardMaterial({color:0x655457,roughness:1}),x,.79,z,{collider:false});
    addBoxMesh(3.2,.25,.76,new THREE.MeshStandardMaterial({color:0x322628,roughness:1}),x,.93,z+.74,{collider:false});
    for(const dx of [-1.35,1.35]) for(const dz of [-.96,.96]) addBoxMesh(.15,.4,.15,frameMat,x+dx,.2,z+dz,{collider:false});
    addBoxMesh(3.4,1.1,.15,frameMat,x,.65,z-1.22,{collider:false});
    addCollider(x-1.68,x+1.68,z-1.28,z+1.28,'bed');
  }

  function createWardrobe(x,z) {
    const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
    const bodyMat=new THREE.MeshStandardMaterial({map:houseTexture,color:0x7a5e43,roughness:.9});
    const darkMat=new THREE.MeshStandardMaterial({color:0x2b211a,roughness:1});
    const brass=new THREE.MeshStandardMaterial({color:0xa38b5d,metalness:.7,roughness:.3});
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.56,2.65,.82),bodyMat);body.position.y=1.33;body.castShadow=true;body.receiveShadow=true;g.add(body);
    for(const xoff of [-.39,.39]) { const door=new THREE.Mesh(new THREE.BoxGeometry(.72,2.48,.075),new THREE.MeshStandardMaterial({map:houseTexture,color:0x927353,roughness:.8}));door.position.set(xoff,1.35,.45);g.add(door); const seam=new THREE.Mesh(new THREE.BoxGeometry(.025,2.12,.018),darkMat);seam.position.set(xoff,1.35,.495);g.add(seam);const h=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),brass);h.position.set(xoff+(xoff<0?.23:-.23),1.3,.515);g.add(h); }
    addBoxMesh(1.72,.12,.96,darkMat,x,.08,z,{collider:false});
    const collar=new THREE.Mesh(new THREE.BoxGeometry(1.7,.13,.92),bodyMat);collar.position.set(0,2.7,0);g.add(collar);
    addCollider(x-.83,x+.83,z-.55,z+.55,'wardrobe');
    interactables.push({kind:'wardrobe',x,z,active:true});
    return g;
  }

  function createBookshelf(x,z) {
    const wood=new THREE.MeshStandardMaterial({map:houseTexture,color:0x6d5139,roughness:.9});
    const dark=new THREE.MeshStandardMaterial({color:0x2b2019,roughness:1});
    addBoxMesh(2.1,2.9,.55,wood,x,1.45,z,{collider:true});
    for(let i=0;i<4;i++) addBoxMesh(1.97,.09,.58,dark,x, .55+i*.68,z+.02,{collider:false});
    const colors=[0x71504a,0x8c6b48,0x4c615c,0x7e704f,0x463d4b,0x897a6b];
    for(let row=0;row<4;row++) for(let i=0;i<6;i++) {
      const h=.29+Math.random()*.22, w=.11+Math.random()*.09;
      const mat=new THREE.MeshStandardMaterial({color:colors[(row*2+i)%colors.length],roughness:1});
      addBoxMesh(w,h,.3,mat,x-.82+i*.29,.62+row*.68+h/2,z+.055,{collider:false});
    }
  }

  function createKitchenCounters() {
    const caseMat=new THREE.MeshStandardMaterial({map:houseTexture,color:0x6e5a43,roughness:.85});
    const stone=new THREE.MeshStandardMaterial({color:0x383b39,roughness:.62});
    for(const [x,z,w,d] of [[11,5.25,4.8,.75],[12.85,7.0,.75,3.4]]) {
      addBoxMesh(w,1.08,d,caseMat,x,.54,z,{collider:false});addBoxMesh(w+.08,.15,d+.08,stone,x,1.14,z,{collider:false});addCollider(x-w/2,x+w/2,z-d/2,z+d/2,'counter');
      for(let px=x-w/2+.55;px<x+w/2-.2;px+=.88) addBoxMesh(.025,.74,.035,new THREE.MeshStandardMaterial({color:0x2a211b}),px,.48,z+d/2+.02,{collider:false});
    }
    // Old sink and tap.
    addBoxMesh(.95,.07,.5,new THREE.MeshStandardMaterial({color:0x282f30,metalness:.46,roughness:.42}),11,1.23,5.2,{collider:false});
    const tap=new THREE.Mesh(new THREE.TorusGeometry(.13,.025,6,12,Math.PI),metalMaterial);tap.position.set(11,1.39,5.0);tap.rotation.x=Math.PI/2;scene.add(tap);
    addBoxMesh(.62,.12,.55,new THREE.MeshStandardMaterial({color:0x6b6153,roughness:.7}),9,1.24,5.2,{collider:false});
  }

  function createWorldItems() {
    // Living room: old couch, side table and battered lamp.
    createSofa(-9.5,7.5,Math.PI/2);
    createTable(-6.6,7.45,1.55,1.15,0x4a3427);
    addBoxMesh(.44,.86,.44,new THREE.MeshStandardMaterial({color:0x4b3a2c}),-12.3,.43,5.5,{collider:false});
    const shade=new THREE.Mesh(new THREE.ConeGeometry(.28,.35,9,1,true),new THREE.MeshStandardMaterial({color:0x897658,side:THREE.DoubleSide,roughness:1}));shade.position.set(-12.3,1.72,5.5);scene.add(shade);
    const lamp=new THREE.PointLight(0xe7b47c,.32,3.4,2);lamp.position.set(-12.3,1.6,5.5);scene.add(lamp);pointLights.push({light:lamp,base:.32,phase:Math.random()*9});

    // Dining room.
    createTable(-8.2,-1.35,3.2,1.55,0x574230);
    createChair(-10.15,-1.35,Math.PI/2);createChair(-6.25,-1.35,-Math.PI/2);createChair(-8.2,-2.35,0);createChair(-8.2,-.35,Math.PI);
    addBoxMesh(.42,.42,.42,new THREE.MeshStandardMaterial({color:0x5c2926}),-12.3,.22,1.9,{collider:false});

    // Kitchen room.
    createKitchenCounters();
    createTable(6.4,8.0,2.1,1.25,0x5b4532);createChair(5.0,8,Math.PI/2);createChair(7.8,8,-Math.PI/2);
    addBoxMesh(.7,.34,.7,new THREE.MeshStandardMaterial({color:0x5b3728,roughness:.95}),4.5,.17,5.6,{collider:false});
    addBoxMesh(.65,.05,.65,new THREE.MeshStandardMaterial({color:0x77705e,roughness:1}),4.5,.37,5.6,{collider:false});

    // Study / middle-right room.
    createBookshelf(12.55,-2.1);
    createTable(6.2,-1.55,2.1,1.05,0x3e2e24);
    addBoxMesh(.8,.08,.58,new THREE.MeshStandardMaterial({color:0x1d2225,roughness:.5}),6.2,.98,-1.55,{collider:false}); // dusty book / device
    addBoxMesh(.25,.24,.18,new THREE.MeshStandardMaterial({color:0xb69a65,metalness:.4,roughness:.5}),5.7,1.1,-1.55,{collider:false});
    createChair(6.2,-2.45,0);
    // Wall-mounted painting, rusty frame.
    const frame=new THREE.Mesh(new THREE.BoxGeometry(1.1,.85,.12),new THREE.MeshStandardMaterial({color:0x3b2a20,roughness:.9}));frame.position.set(4.05,2.25,1.7);frame.rotation.y=-Math.PI/2;scene.add(frame);
    const art=new THREE.Mesh(new THREE.PlaneGeometry(.88,.64),new THREE.MeshStandardMaterial({color:0x313a3f,roughness:1}));art.position.set(3.975,2.25,1.7);art.rotation.y=-Math.PI/2;scene.add(art);
    // Storage room: crates and the bolt cutters objective.
    for(const [x,z,s] of [[-11,-9.1,.85],[-6,-14.8,1.1],[-4.7,-11.1,.75]]) {
      const c=addBoxMesh(s,.75,s,new THREE.MeshStandardMaterial({map:houseTexture,color:0x876746,roughness:1}),x,.375,z,{collider:false});
      const slat=new THREE.Mesh(new THREE.BoxGeometry(s+.02,.07,.07),new THREE.MeshStandardMaterial({color:0x3b2c20}));slat.position.set(x,.42,z+s/2+.015);scene.add(slat);
      addCollider(x-s/2,x+s/2,z-s/2,z+s/2,'crate');
    }
    createWardrobe(-10.25,-13.0);
    // Bedroom north-east.
    createBed(6.8,-12.9);
    createWardrobe(11.55,-13.0);
    addBoxMesh(.8,.8,.75,new THREE.MeshStandardMaterial({map:houseTexture,color:0x684b34,roughness:.9}),11.2,.4,-9.0,{collider:true});
    addBoxMesh(.42,.52,.38,new THREE.MeshStandardMaterial({color:0x33251d}),11.2,1.0,-9.0,{collider:false});

    // A narrow console in the foyer; not a blocker.
    addBoxMesh(1.85,.1,.44,new THREE.MeshStandardMaterial({map:houseTexture,color:0x745437,roughness:.84}),-4.9,.98,13.2,{collider:false});
    for(const x of [-5.65,-4.15]) addBoxMesh(.1,.95,.1,new THREE.MeshStandardMaterial({color:0x39281d}),x,.48,13.2,{collider:false});
    addBoxMesh(.36,.35,.32,new THREE.MeshStandardMaterial({color:0x493a30}),-4.9,1.2,13.2,{collider:false});

    createPickUp('key',9.35,-8.35);
    createPickUp('cutters',-8.7,-8.7);
    createWardrobe(-11.7,7.0);
    // Some small debris on the ground helps the beam catch depth.
    const debrisMat=new THREE.MeshStandardMaterial({color:0x53463a,roughness:1});
    for(let i=0;i<26;i++){
      const x=-12.5+Math.random()*25, z=-16.5+Math.random()*32;
      if(Math.abs(x)<2.6 || Math.random()<.4) continue;
      const pebble=new THREE.Mesh(new THREE.BoxGeometry(.08+Math.random()*.16,.025,.05+Math.random()*.1),debrisMat);pebble.position.set(x,.025,z);pebble.rotation.y=Math.random()*Math.PI;scene.add(pebble);
    }
  }

  function createPickUp(kind,x,z) {
    const group=new THREE.Group(); group.position.set(x,0,z); scene.add(group);
    if(kind==='key') {
      const gold=new THREE.MeshStandardMaterial({color:0xd1ad5f,metalness:.85,roughness:.24,emissive:0x6f4e1d,emissiveIntensity:.32});
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.15,.035,8,18),gold);ring.position.set(-.12,.2,0);group.add(ring);
      const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.49,8),gold);shaft.rotation.z=Math.PI/2;shaft.position.set(.19,.2,0);group.add(shaft);
      for(let i=0;i<2;i++){const tooth=new THREE.Mesh(new THREE.BoxGeometry(.09,.12,.07),gold);tooth.position.set(.28+i*.09,.12,0);group.add(tooth);}
      const glow=new THREE.PointLight(0xe3ba6f,.45,2.7,2);glow.position.set(0,.42,0);group.add(glow);
    } else {
      const red=new THREE.MeshStandardMaterial({color:0x8d3730,roughness:.56,metalness:.3});
      const metal=new THREE.MeshStandardMaterial({color:0x9f9990,metalness:.78,roughness:.3});
      const h1=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.7,8),red);h1.position.set(-.13,.25,0);h1.rotation.z=-.32;group.add(h1);
      const h2=h1.clone();h2.position.x=.13;h2.rotation.z=.32;group.add(h2);
      const j1=new THREE.Mesh(new THREE.TorusGeometry(.12,.028,6,12,Math.PI),metal);j1.position.set(-.11,.63,0);j1.rotation.z=.25;group.add(j1);
      const j2=j1.clone();j2.position.x=.11;j2.rotation.z=-.25;group.add(j2);
      const pin=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.32,8),metal);pin.rotation.z=Math.PI/2;pin.position.set(0,.61,0);group.add(pin);
      const glow=new THREE.PointLight(0xe16e47,.28,2.3,2);glow.position.set(0,.45,0);group.add(glow);
    }
    interactables.push({kind,x,z,active:true,group});
  }

  function createFlashlight() {
    flashlight = new THREE.SpotLight(0xffe8c8, 8.5, 20, Math.PI/7.4, .46, 1.4);
    flashlight.position.set(0,0,0); flashlight.castShadow=false;
    flashlightTarget=new THREE.Object3D(); flashlightTarget.position.set(0,0,-1); camera.add(flashlightTarget); camera.add(flashlight); flashlight.target=flashlightTarget;
    const fill = new THREE.PointLight(0xffd9a8, .65, 4, 2); fill.position.set(0,0,0); camera.add(fill); flashlight.userData.fill=fill;
    scene.add(camera);
  }

  function makeFallbackEnemy() {
    const root=new THREE.Group();
    const dressMat=new THREE.MeshStandardMaterial({color:0x4c3937,roughness:.98});
    const skinMat=new THREE.MeshStandardMaterial({color:0xb59d8a,roughness:.9});
    const hairMat=new THREE.MeshStandardMaterial({color:0xc4c0ae,roughness:1});
    const eyeMat=new THREE.MeshStandardMaterial({color:0x110e0d,roughness:.6});
    const torso=new THREE.Mesh(new THREE.ConeGeometry(.46,1.08,10),dressMat);torso.position.y=.74;torso.castShadow=true;root.add(torso);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,.2,8),skinMat);neck.position.y=1.26;root.add(neck);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.24,12,10),skinMat);head.position.set(0,1.48,0);head.castShadow=true;root.add(head);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.265,12,8,0,Math.PI*2,0,Math.PI*.68),hairMat);hair.position.set(0,1.53,-.01);root.add(hair);
    for(const sx of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),eyeMat);eye.position.set(sx*.09,1.5,.218);root.add(eye);const arm=new THREE.Mesh(new THREE.CylinderGeometry(.07,.095,.8,7),dressMat);arm.position.set(sx*.43,.78,.04);arm.rotation.z=sx*.13;root.add(arm);const hand=new THREE.Mesh(new THREE.SphereGeometry(.08,7,6),skinMat);hand.position.set(sx*.45,.37,.04);root.add(hand);}
    for(const sx of [-.16,.16]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.09,.08,.52,7),new THREE.MeshStandardMaterial({color:0x272322}));leg.position.set(sx,.25,0);root.add(leg);}
    return root;
  }

  const enemy = {x:0,z:-3.6,state:'patrol',path:[],pathIndex:0,pathTimer:0,waypointIndex:0,alertTimer:0,lastKnown:{x:0,z:0},dirX:0,dirZ:1,attackTimer:0,anim:'Idle'};
  const patrolPoints=[{x:0,z:-13.0},{x:0,z:-3.4},{x:0,z:7.7},{x:-7.4,z:7.0},{x:-8.2,z:-1.5},{x:-8.0,z:-12.0},{x:0,z:-12.5},{x:7.8,z:-12.3},{x:8.0,z:-1.0},{x:8.0,z:7.0},{x:0,z:7.7}];

  function createEnemy() {
    enemy.root=new THREE.Group(); enemy.root.position.set(enemy.x,0,enemy.z); scene.add(enemy.root);
    enemyFallback=makeFallbackEnemy(); enemy.root.add(enemyFallback);
    enemy.fallback=true;
    // Free CC0 rigged character; if the asset host is offline, the procedural fallback stays active.
    const loader=new GLTFLoader();
    loader.load(ENEMY_MODEL_URL,(gltf)=>{
      const model=gltf.scene;
      const bounds=new THREE.Box3().setFromObject(model);
      const height=Math.max(.001,bounds.max.y-bounds.min.y);
      const scale=1.72/height;
      model.scale.setScalar(scale);
      model.position.y=-bounds.min.y*scale;
      model.traverse((obj)=>{if(obj.isMesh){obj.castShadow=true;obj.receiveShadow=true; if(obj.material){obj.material.needsUpdate=true;}}});
      enemy.root.remove(enemyFallback); enemy.root.add(model); enemyModel=model; enemy.fallback=false;
      enemyMixer=new THREE.AnimationMixer(model);
      enemyActions.clear();
      for(const clip of gltf.animations){ enemyActions.set(clip.name.toLowerCase(),enemyMixer.clipAction(clip)); }
      setEnemyAnimation('Idle');
    },undefined,(err)=>{ console.warn('CC0 enemy model unavailable; using the built-in character instead.',err); });
  }

  function setEnemyAnimation(name) {
    if(!enemyMixer) { enemy.anim=name; return; }
    const key=name.toLowerCase();
    const next=enemyActions.get(key) || enemyActions.get(key==='run'?'walk':'idle') || enemyActions.values().next().value;
    if(!next || currentEnemyAction===next) return;
    if(currentEnemyAction) currentEnemyAction.fadeOut(.18);
    next.reset().fadeIn(.18).play(); currentEnemyAction=next; enemy.anim=name;
  }

  function createAudio() {
    if(audioContext) { if(audioContext.state==='suspended') audioContext.resume().catch(()=>{}); return; }
    const Ctx=window.AudioContext||window.webkitAudioContext; if(!Ctx) return;
    try {
      audioContext=new Ctx();
      const oscillator=audioContext.createOscillator(); oscillator.type='sine'; oscillator.frequency.value=43;
      droneGain=audioContext.createGain(); droneGain.gain.value=.018; oscillator.connect(droneGain); droneGain.connect(audioContext.destination); oscillator.start();
      const lfo=audioContext.createOscillator(), lfoGain=audioContext.createGain(); lfo.frequency.value=.12;lfoGain.gain.value=.006;lfo.connect(lfoGain);lfoGain.connect(droneGain.gain);lfo.start();
    } catch(e) { console.warn('Audio unavailable',e); }
  }

  function playFootstep(strength=1) {
    if(!audioContext || audioContext.state!=='running') return;
    try {
      const dur=.07, length=Math.max(1,Math.floor(audioContext.sampleRate*dur));
      const buffer=audioContext.createBuffer(1,length,audioContext.sampleRate), data=buffer.getChannelData(0);
      for(let i=0;i<length;i++) data[i]=(Math.random()*2-1)*(1-i/length);
      const source=audioContext.createBufferSource(); source.buffer=buffer;
      const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=260+Math.random()*170;
      const gain=audioContext.createGain();gain.gain.setValueAtTime(.07*strength,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+dur);
      source.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);source.start();source.stop(audioContext.currentTime+dur);
    } catch(e) { /* sound is optional */ }
  }

  function playStinger() {
    if(!audioContext || audioContext.state!=='running') return;
    try { const now=audioContext.currentTime; const o=audioContext.createOscillator(), g=audioContext.createGain();o.type='sawtooth';o.frequency.setValueAtTime(120,now);o.frequency.exponentialRampToValueAtTime(38,now+.7);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.15,now+.06);g.gain.exponentialRampToValueAtTime(.0001,now+1.1);o.connect(g);g.connect(audioContext.destination);o.start(now);o.stop(now+1.15);}catch(e){}
  }

  function emitNoise(x,z,radius=7,lifetime=1.3) {
    noisePosition={x,z}; noiseRadius=radius; noiseLifetime=Math.max(noiseLifetime,lifetime);
  }

  function circleTouchesBox(x,z,radius,box) {
    const nearestX=Math.max(box.minX,Math.min(x,box.maxX));
    const nearestZ=Math.max(box.minZ,Math.min(z,box.maxZ));
    const dx=x-nearestX, dz=z-nearestZ;
    return dx*dx+dz*dz < radius*radius;
  }

  function isBlocked(x,z,radius=.31) {
    const outsideWest=x < -13.55+radius;
    const outsideEast=x > 13.55-radius;
    const outsideNorth=z < -17.55+radius;
    const southDoorLaneOpen=doorOpened && Math.abs(x)<1.5 && z<19.0;
    const outsideSouth=z > 17.55-radius && !southDoorLaneOpen;
    if(outsideWest || outsideEast || outsideNorth || outsideSouth) return true;
    for(const box of solidColliders) if(circleTouchesBox(x,z,radius,box)) return true;
    return false;
  }

  function segmentBlocked(ax,az,bx,bz) {
    const distance=Math.hypot(bx-ax,bz-az); const steps=Math.ceil(distance/.3);
    for(let i=1;i<steps;i++){const t=i/steps;if(isBlocked(ax+(bx-ax)*t,az+(bz-az)*t,.06))return true;}
    return false;
  }

  function movePlayer(dx,dz) {
    const radius=player.crouched?.27:.32;
    const nx=player.x+dx;
    if(!isBlocked(nx,player.z,radius)) player.x=nx;
    const nz=player.z+dz;
    if(!isBlocked(player.x,nz,radius)) player.z=nz;
  }

  class MinHeap {
    constructor(){this.data=[];}
    push(node){const a=this.data;a.push(node);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].f<=node.f)break;a[i]=a[p];i=p;}a[i]=node;}
    pop(){const a=this.data;if(!a.length)return null;const top=a[0],last=a.pop();if(a.length){let i=0;while(true){let l=i*2+1,r=l+1;if(l>=a.length)break;let c=(r<a.length&&a[r].f<a[l].f)?r:l;if(a[c].f>=last.f)break;a[i]=a[c];i=c;}a[i]=last;}return top;}
    get length(){return this.data.length;}
  }

  const nav = {minX:-13.05,minZ:-17.05,step:.8,nx:0,nz:0};
  function initNavigation(){nav.nx=Math.floor((13.05-nav.minX)/nav.step)+1;nav.nz=Math.floor((17.05-nav.minZ)/nav.step)+1;}
  function nearestOpenCell(ix,iz) {
    ix=Math.max(0,Math.min(nav.nx-1,ix));iz=Math.max(0,Math.min(nav.nz-1,iz));
    const ok=(x,z)=>!isBlocked(nav.minX+x*nav.step,nav.minZ+z*nav.step,.25);
    if(ok(ix,iz))return {ix,iz};
    for(let r=1;r<6;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(Math.abs(dx)===r||Math.abs(dz)===r){const x=ix+dx,z=iz+dz;if(x>=0&&x<nav.nx&&z>=0&&z<nav.nz&&ok(x,z))return {ix:x,iz:z};}
    return {ix,iz};
  }
  function findPath(sx,sz,gx,gz) {
    if(!nav.nx)initNavigation();
    const cellIndex=(x,z)=>z*nav.nx+x;
    const toCell=(x,z)=>nearestOpenCell(Math.round((x-nav.minX)/nav.step),Math.round((z-nav.minZ)/nav.step));
    const start=toCell(sx,sz),goal=toCell(gx,gz);
    const startId=cellIndex(start.ix,start.iz),goalId=cellIndex(goal.ix,goal.iz),total=nav.nx*nav.nz;
    const gScore=new Float32Array(total);gScore.fill(Infinity);const came=new Int32Array(total);came.fill(-1);const closed=new Uint8Array(total);const heap=new MinHeap();
    const h=(x,z)=>{const dx=Math.abs(x-goal.ix),dz=Math.abs(z-goal.iz);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
    gScore[startId]=0;heap.push({id:startId,x:start.ix,z:start.iz,f:h(start.ix,start.iz)});
    const dirs=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,-1,Math.SQRT2],[1,1,Math.SQRT2]];
    let found=false,guard=0;
    while(heap.length&&guard++<total*3){const cur=heap.pop();if(closed[cur.id])continue;closed[cur.id]=1;if(cur.id===goalId){found=true;break;}
      for(const [dx,dz,cost] of dirs){const x=cur.x+dx,z=cur.z+dz;if(x<0||x>=nav.nx||z<0||z>=nav.nz)continue;const id=cellIndex(x,z);if(closed[id])continue;
        const wx=nav.minX+x*nav.step,wz=nav.minZ+z*nav.step;if(isBlocked(wx,wz,.25))continue;
        if(dx&&dz&&(isBlocked(nav.minX+(cur.x+dx)*nav.step,nav.minZ+cur.z*nav.step,.25)||isBlocked(nav.minX+cur.x*nav.step,nav.minZ+(cur.z+dz)*nav.step,.25)))continue;
        const tentative=gScore[cur.id]+cost;if(tentative<gScore[id]){gScore[id]=tentative;came[id]=cur.id;heap.push({id,x,z,f:tentative+h(x,z)});}
      }
    }
    if(!found)return [];
    const result=[];let at=goalId;while(at!==startId&&at>=0){const ix=at%nav.nx,iz=Math.floor(at/nav.nx);result.push({x:nav.minX+ix*nav.step,z:nav.minZ+iz*nav.step});at=came[at];if(result.length>total)break;}
    result.reverse();return result;
  }

  function enemySetPathTo(x,z) {
    enemy.path=findPath(enemy.x,enemy.z,x,z);enemy.pathIndex=0;enemy.pathTimer=0;
  }

  function nearestInteractable() {
    let best=null,bestD=Infinity;
    for(const obj of interactables){if(!obj.active)continue;const d=Math.hypot(player.x-obj.x,player.z-obj.z);if(d<bestD){bestD=d;best=obj;}}
    return best&&bestD<2.65?{obj:best,d:bestD}:null;
  }

  function getPrompt(obj) {
    if(!obj)return '';
    if(obj.kind==='key')return 'Pick up the brass key';
    if(obj.kind==='cutters')return 'Pick up the bolt cutters';
    if(obj.kind==='wardrobe')return player.hidden?'Leave hiding place':'Hide inside wardrobe';
    if(obj.kind==='exit'){
      if(!inventory.cutters)return 'The front door is chained — find bolt cutters';
      if(!inventory.key)return 'Chains can be cut. Find the brass key';
      if(!doorOpened)return 'Unlock and open the front door';
      return 'Go outside';
    }
    return 'Interact';
  }

  function interact() {
    if(gameState!=='playing')return;
    if(player.hidden){player.hidden=false;toast('You leave the wardrobe. Move carefully.');$('hidden-overlay').classList.remove('show');emitNoise(player.x,player.z,2,0.6);return;}
    const found=nearestInteractable();
    if(!found){toast('Nothing within reach.');return;}
    const obj=found.obj;
    if(obj.kind==='key'){
      inventory.key=true;obj.active=false;if(obj.group)obj.group.visible=false;updateObjectiveUI();toast('Brass key acquired.');emitNoise(player.x,player.z,4.2,1.2);playFootstep(.9);return;
    }
    if(obj.kind==='cutters'){
      inventory.cutters=true;obj.active=false;if(obj.group)obj.group.visible=false;updateObjectiveUI();toast('Bolt cutters acquired. The chains can be cut.');emitNoise(player.x,player.z,5,1.5);playFootstep(1.1);return;
    }
    if(obj.kind==='wardrobe'){
      player.hidden=true;player.crouched=false;keys.clear();touchInput.x=touchInput.y=0;$('hidden-overlay').classList.add('show');$('interaction-prompt').style.opacity='0';toast('Stay still. Do not make a sound.');return;
    }
    if(obj.kind==='exit'){
      if(!inventory.cutters){toast('The chains are thick. You need bolt cutters.');emitNoise(player.x,player.z,4.5,1.3);return;}
      if(!inventory.key){toast('The chains are loose, but the deadbolt still needs a brass key.');emitNoise(player.x,player.z,4.5,1.3);return;}
      if(!doorOpened){
        doorOpened=true;doorPivot.rotation.y=-Math.PI/2;doorPanel.rotation.y=0;
        if(doorCollider){const idx=solidColliders.indexOf(doorCollider);if(idx>=0)solidColliders.splice(idx,1);doorCollider=null;}
        toast('The lock turns. Go — now!');playStinger();emitNoise(player.x,player.z,18,3.5);return;
      }
      toast('The night air is right there. Keep moving.');return;
    }
  }

  function updateObjectiveUI() {
    $('objective-key').classList.toggle('done',inventory.key);
    $('objective-cutters').classList.toggle('done',inventory.cutters);
    $('slot-key').classList.toggle('active',inventory.key);
    $('slot-cutters').classList.toggle('active',inventory.cutters);
  }

  function updateHUD() {
    const stamina=Math.max(0,Math.min(100,player.stamina));$('stamina-value').textContent=`${Math.round(stamina)}%`;$('stamina-bar').style.width=`${stamina}%`;
    $('stamina-bar').style.background=stamina<23?'#bf635a':'#b8c7b4';
    $('attempts-value').textContent=String(Math.max(0,attempts)).padStart(2,'0');
    const nearest=nearestInteractable();const prompt=nearest?getPrompt(nearest.obj):'';
    $('interaction-prompt').innerHTML=prompt?`<b>[ E ]</b>${prompt}`:'';
    $('interaction-prompt').style.opacity=prompt&&!player.hidden?'1':'0';
    $('crosshair').style.opacity=player.hidden?'0':'0.75';
  }

  function toast(message) {
    const el=$('toast');el.textContent=message;el.classList.add('show');lastToast=message;
    if(toastTimeout)clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{el.classList.remove('show');},2300);
  }

  function setOverlay(visible, target='start-screen') {
    $('overlay-stack').style.display=visible?'flex':'none';
    for(const id of ['start-screen','pause-screen','caught-screen','win-screen','error-screen','controls-screen']) $(id).hidden=id!==target;
  }

  function startGame() {
    if(gameState==='error')return;
    createAudio();
    gameState='playing';gameClock=0;clock.getDelta();document.body.classList.add('playing');setOverlay(false);$('hidden-overlay').classList.remove('show');
    if(!isTouchDevice && renderer.domElement.requestPointerLock){renderer.domElement.requestPointerLock();}
  }

  function pauseGame() {
    if(gameState!=='playing')return;
    gameState='paused';keys.clear();touchInput.x=touchInput.y=0;document.exitPointerLock?.();setOverlay(true,'pause-screen');
  }

  function resumeGame() {
    gameState='playing';setOverlay(false);createAudio();
    if(!isTouchDevice && renderer.domElement.requestPointerLock)renderer.domElement.requestPointerLock();
    clock.getDelta();
  }

  function resetEnemy() {
    enemy.x=0;enemy.z=-3.6;enemy.state='patrol';enemy.path=[];enemy.pathIndex=0;enemy.pathTimer=0;enemy.waypointIndex=0;enemy.alertTimer=0;enemy.lastKnown={x:0,z:0};enemy.dirX=0;enemy.dirZ=1;enemy.attackTimer=0;
    enemy.root.position.set(enemy.x,0,enemy.z);setEnemyAnimation('Idle');
  }

  function resetRun(full=true) {
    if(full){inventory={key:false,cutters:false};attempts=5;doorOpened=false;if(doorPivot)doorPivot.rotation.y=0;if(doorCollider===null){doorCollider=addCollider(-1.34,1.34,17.47,17.96,'exit-door');}}
    player.x=0;player.z=13.2;player.stamina=100;player.crouched=false;player.hidden=false;player.moving=false;player.flashlightOn=true;noiseLifetime=0;noisePosition=null;keys.clear();touchInput.x=touchInput.y=0;
    if(flashlight){flashlight.intensity=8.5; if(flashlight.userData.fill)flashlight.userData.fill.intensity=.65;}
    for(const o of interactables){if(o.kind==='key')o.active=!inventory.key;if(o.kind==='cutters')o.active=!inventory.cutters;if((o.kind==='key'||o.kind==='cutters')&&o.group)o.group.visible=o.active;}
    $('hidden-overlay').classList.remove('show');updateObjectiveUI();updateHUD();resetEnemy();
  }

  function caught() {
    if(gameState!=='playing')return;
    attempts=Math.max(0,attempts-1);gameState='caught';keys.clear();touchInput.x=touchInput.y=0;document.exitPointerLock?.();playStinger();
    $('caught-title').textContent=attempts>0?'You were found.':'No more nights.';
    $('caught-copy').textContent=attempts>0?`Attempts remaining: ${attempts}. The house has settled again. You keep any items you already found.`:'You ran out of chances. The house keeps its secrets.';
    $('caught-retry-btn').textContent=attempts>0?'Try again':'Start over';
    $('caught-retry-btn').onclick=()=>{if(attempts<=0){resetRun(true);attempts=5;}else resetRun(false);resumeGame();};
    setOverlay(true,'caught-screen');updateHUD();
  }

  function winGame() {
    if(gameState!=='playing')return;
    gameState='won';keys.clear();touchInput.x=touchInput.y=0;document.exitPointerLock?.();playStinger();setOverlay(true,'win-screen');
  }

  function updatePlayer(dt) {
    if(player.hidden){player.moving=false;camera.position.set(player.x,.92,player.z);camera.rotation.set(pitch,yaw,0,'YXZ');return;}
    const fwd=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    let forward=0,strafe=0;
    if(keys.has('KeyW')||keys.has('ArrowUp'))forward+=1;if(keys.has('KeyS')||keys.has('ArrowDown'))forward-=1;
    if(keys.has('KeyD')||keys.has('ArrowRight'))strafe+=1;if(keys.has('KeyA')||keys.has('ArrowLeft'))strafe-=1;
    forward+=-touchInput.y;strafe+=touchInput.x;
    let dir=fwd.multiplyScalar(forward).add(right.multiplyScalar(strafe));
    const moving=dir.lengthSq()>.01; if(moving)dir.normalize();
    const sprinting=(keys.has('ShiftLeft')||keys.has('ShiftRight')||touchInput.run)&&moving&&!player.crouched&&player.stamina>1;
    let speed=player.crouched?1.22:(sprinting?4.2:2.35);
    if(sprinting)player.stamina=Math.max(0,player.stamina-25*dt);else player.stamina=Math.min(100,player.stamina+(player.crouched?13:18)*dt);
    player.moving=moving;
    if(moving){movePlayer(dir.x*speed*dt,dir.z*speed*dt);footstepClock+=dt;
      const cadence=sprinting?.26:(player.crouched?.58:.42);
      if(footstepClock>=cadence){footstepClock=0;playFootstep(sprinting?1.1:(player.crouched?.25:.55));emitNoise(player.x,player.z,player.crouched?1.4:(sprinting?10.8:3.7),.35);}
    } else footstepClock=0;
    if(doorOpened && player.z>18.25 && Math.abs(player.x)<2.4){winGame();}
    cameraBob += moving ? dt*(sprinting?13:(player.crouched?5:8)) : dt*3;
    const baseHeight=player.crouched?1.0:1.63;
    const bob=moving?Math.sin(cameraBob)* (player.crouched?.018:(sprinting?.055:.032)):0;
    camera.position.set(player.x,baseHeight+bob,player.z);camera.rotation.set(pitch,yaw,0,'YXZ');
    if(flashlight){flashlight.intensity=player.flashlightOn?8.5:0;if(flashlight.userData.fill)flashlight.userData.fill.intensity=player.flashlightOn?.65:0;}
  }

  function canEnemySeePlayer() {
    if(player.hidden)return false;
    const dx=player.x-enemy.x,dz=player.z-enemy.z,d=Math.hypot(dx,dz);
    if(d>10.5||d<.01)return false;
    const nx=dx/d,nz=dz/d;
    const dot=nx*enemy.dirX+nz*enemy.dirZ;
    if(dot<-.08&&d>2.0)return false;
    return !segmentBlocked(enemy.x,enemy.z,player.x,player.z);
  }

  function updateEnemy(dt) {
    if(enemyMixer)enemyMixer.update(dt);
    const dPlayer=Math.hypot(player.x-enemy.x,player.z-enemy.z);
    const sees=canEnemySeePlayer();
    if(sees){enemy.state='chase';enemy.lastKnown={x:player.x,z:player.z};enemy.alertTimer=7.2;}
    else if(noiseLifetime>0&&!player.hidden&&noisePosition&&Math.hypot(noisePosition.x-enemy.x,noisePosition.z-enemy.z)<noiseRadius&&enemy.state!=='chase'){
      enemy.state='investigate';enemy.lastKnown={x:noisePosition.x,z:noisePosition.z};enemy.alertTimer=Math.max(enemy.alertTimer,3.4);
    } else if(enemy.state==='chase') {
      enemy.alertTimer-=dt;if(enemy.alertTimer<=0){enemy.state='investigate';enemy.alertTimer=3.4;}
    } else if(enemy.state==='investigate') {
      enemy.alertTimer-=dt;if(enemy.alertTimer<=0){enemy.state='patrol';enemy.path=[];}
    }
    noiseLifetime=Math.max(0,noiseLifetime-dt);
    enemy.pathTimer-=dt;
    let target=null;
    if(enemy.state==='chase')target={x:player.x,z:player.z};
    else if(enemy.state==='investigate')target=enemy.lastKnown;
    else target=patrolPoints[enemy.waypointIndex%patrolPoints.length];
    if(enemy.pathTimer<=0||!enemy.path.length||enemy.pathIndex>=enemy.path.length){
      enemySetPathTo(target.x,target.z);enemy.pathTimer=enemy.state==='chase'?.55:(enemy.state==='investigate'?.95:1.4);
      if(enemy.state==='patrol'&&enemy.path.length===0)enemy.waypointIndex=(enemy.waypointIndex+1)%patrolPoints.length;
    }
    const next=enemy.path[enemy.pathIndex];
    let speed=enemy.state==='chase'?3.05:(enemy.state==='investigate'?1.9:1.3);
    if(next){const dx=next.x-enemy.x,dz=next.z-enemy.z,len=Math.hypot(dx,dz);
      if(len<.28){enemy.pathIndex++;}
      else {const vx=dx/len,vz=dz/len;enemy.dirX=vx;enemy.dirZ=vz;const nx=enemy.x+vx*speed*dt,nz=enemy.z+vz*speed*dt;
        if(!isBlocked(nx,nz,.28)){enemy.x=nx;enemy.z=nz;}else{enemy.pathTimer=0;}
      }
    } else if(enemy.state==='patrol'&&Math.hypot(target.x-enemy.x,target.z-enemy.z)<.55){enemy.waypointIndex=(enemy.waypointIndex+1)%patrolPoints.length;enemy.pathTimer=0;}
    enemy.root.position.set(enemy.x,0,enemy.z);enemy.root.rotation.y=Math.atan2(enemy.dirX,enemy.dirZ);
    if(enemy.state==='chase')setEnemyAnimation('Run');else if(Math.hypot(enemy.x-(enemy.prevX??enemy.x),enemy.z-(enemy.prevZ??enemy.z))>.004)setEnemyAnimation('Walk');else setEnemyAnimation('Idle');
    enemy.prevX=enemy.x;enemy.prevZ=enemy.z;
    if(!player.hidden&&dPlayer<1.18){caught();}
    // Threat tint and audio intensity scale smoothly with enemy proximity.
    const danger=Math.max(0,1-dPlayer/10.5);
    $('screen-fx').style.background=`radial-gradient(ellipse at center,transparent 35%,rgba(${Math.round(40+80*danger)},${Math.round(0+4*danger)},${Math.round(0+2*danger)},${.28+.25*danger}) 78%,rgba(0,0,0,.82) 125%)`;
    if(droneGain&&audioContext)droneGain.gain.setTargetAtTime(.018+danger*.035,audioContext.currentTime,.25);
  }

  function updateWorld(dt) {
    gameClock+=dt;
    for(const p of pointLights){const wobble=1+Math.sin(gameClock*3.3+p.phase)*.035+(Math.random()<.004?-.22:0);p.light.intensity=Math.max(.05,p.base*wobble);}
    for(const obj of interactables){if(obj.group&&obj.active&&(obj.kind==='key'||obj.kind==='cutters')){obj.group.rotation.y+=dt*.65;obj.group.position.y=.06+Math.sin(gameClock*2.2+(obj.kind==='key'?0:1.6))*.065;}}
    if(doorOpened&&doorPivot){doorPivot.rotation.y+=0;}
    updateHUD();
    mapTimer+=dt;if(mapTimer>.18){drawMap();mapTimer=0;}
  }

  function drawMap() {
    const canvas=$('map-canvas');if(!canvas||!scene)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(15,17,19,.94)';ctx.fillRect(0,0,w,h);
    const pad=11,scale=Math.min((w-pad*2)/28,(h-pad*2)/36),xoff=(w-28*scale)/2,zoff=(h-36*scale)/2;
    const sx=x=>xoff+(x+14)*scale, sz=z=>zoff+(z+18)*scale;
    // Every mark is drawn from the same AABBs used for the scene walls and collisions.
    ctx.fillStyle='#1d211f';ctx.fillRect(sx(-14),sz(-18),28*scale,36*scale);
    for(const c of mapWalls){ctx.fillStyle=c.type==='wall'?'#756d61':'#756d61';ctx.fillRect(sx(c.minX),sz(c.minZ),Math.max(1,(c.maxX-c.minX)*scale),Math.max(1,(c.maxZ-c.minZ)*scale));}
    // The exit panel changes color only when the player has actually unlocked it.
    ctx.fillStyle=doorOpened?'#72b58e':'#b75e51';ctx.fillRect(sx(-1.16),sz(17.78),2.32*scale,.16*scale);
    // Player arrow.
    const px=sx(player.x),pz=sz(player.z);ctx.save();ctx.translate(px,pz);ctx.rotate(yaw);ctx.fillStyle=player.hidden?'#a5a39a':'#f4e6bc';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(4.2,4);ctx.lineTo(0,2.4);ctx.lineTo(-4.2,4);ctx.closePath();ctx.fill();ctx.restore();
    ctx.fillStyle='#d65a51';ctx.beginPath();ctx.arc(sx(enemy.x),sz(enemy.z),3.0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(214,90,81,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(sx(enemy.x),sz(enemy.z),5.2,0,Math.PI*2);ctx.stroke();
    ctx.font='8px system-ui';ctx.fillStyle='#aaa397';ctx.textAlign='left';ctx.fillText('N',w-14,12);
    ctx.fillStyle='#b7a17b';ctx.fillRect(5,h-8,6,2);ctx.font='7px system-ui';ctx.fillStyle='#716f67';ctx.fillText('2 m',14,h-6);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt=Math.min(clock.getDelta(),.05);
    if(gameState==='playing'){
      updatePlayer(dt);
      if(gameState==='playing')updateEnemy(dt);
      if(gameState==='playing')updateWorld(dt);
    } else {
      if(enemyMixer)enemyMixer.update(dt*.25);
      updateWorld(dt*.2);
    }
    if(renderer&&scene&&camera)renderer.render(scene,camera);
  }

  function attachEvents() {
    window.addEventListener('resize',()=>{if(!renderer||!camera)return;camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(window.innerWidth,window.innerHeight);drawMap();});
    window.addEventListener('keydown',(e)=>{
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      if(e.code==='Escape'){if(gameState==='playing'&&!isTouchDevice)pauseGame();return;}
      if(gameState!=='playing')return;
      if(e.code==='KeyE'&&!e.repeat){interact();return;}
      if(e.code==='KeyF'&&!e.repeat){player.flashlightOn=!player.flashlightOn;toast(player.flashlightOn?'Flashlight on':'Flashlight off');return;}
      if(e.code==='KeyC'&&!e.repeat&&!player.hidden){player.crouched=!player.crouched;toast(player.crouched?'You crouch to move quietly':'You stand up');return;}
      keys.add(e.code);
    });
    window.addEventListener('keyup',(e)=>keys.delete(e.code));
    window.addEventListener('blur',()=>{keys.clear();touchInput.x=touchInput.y=0;if(gameState==='playing'&&!isTouchDevice)pauseGame();});
    document.addEventListener('pointerlockchange',()=>{if(!isTouchDevice&&gameState==='playing'&&document.pointerLockElement!==renderer.domElement)pauseGame();});
    document.addEventListener('mousemove',(e)=>{if(gameState==='playing'&&document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.00225;pitch-=e.movementY*.0019;pitch=Math.max(-1.32,Math.min(1.32,pitch));}});
    $('start-btn').addEventListener('click',startGame);
    $('resume-btn').addEventListener('click',resumeGame);
    $('restart-btn').addEventListener('click',()=>{resetRun(true);startGame();});
    $('caught-restart-btn').addEventListener('click',()=>{resetRun(true);startGame();});
    $('win-restart-btn').addEventListener('click',()=>{resetRun(true);startGame();});
    $('controls-btn').addEventListener('click',()=>setOverlay(true,'controls-screen'));
    $('controls-back-btn').addEventListener('click',()=>setOverlay(true,'start-screen'));
    $('error-reload-btn').addEventListener('click',()=>window.location.reload());
    const pad=$('stick-pad'),knob=$('stick-knob');let stickId=null,stickCenter={x:0,y:0};
    const setStick=(clientX,clientY)=>{const dx=clientX-stickCenter.x,dy=clientY-stickCenter.y,r=40,len=Math.hypot(dx,dy)||1,m=Math.min(1,len/r),nx=dx/len*m,ny=dy/len*m;touchInput.x=nx;touchInput.y=ny;knob.style.transform=`translate(${nx*r}px,${ny*r}px)`;};
    pad.addEventListener('touchstart',(e)=>{e.preventDefault();const t=e.changedTouches[0];stickId=t.identifier;const rect=pad.getBoundingClientRect();stickCenter={x:rect.left+rect.width/2,y:rect.top+rect.height/2};setStick(t.clientX,t.clientY);},{passive:false});
    pad.addEventListener('touchmove',(e)=>{e.preventDefault();for(const t of e.changedTouches)if(t.identifier===stickId)setStick(t.clientX,t.clientY);},{passive:false});
    const endStick=(e)=>{for(const t of e.changedTouches)if(t.identifier===stickId){stickId=null;touchInput.x=touchInput.y=0;knob.style.transform='translate(0,0)';}};
    pad.addEventListener('touchend',endStick);pad.addEventListener('touchcancel',endStick);
    const touchInteract=$('touch-interact');touchInteract.addEventListener('touchstart',(e)=>{e.preventDefault();interact();},{passive:false});touchInteract.addEventListener('click',()=>{if(isTouchDevice)interact();});
    $('touch-run').addEventListener('touchstart',(e)=>{e.preventDefault();touchInput.run=true;$('touch-run').classList.add('selected');},{passive:false});
    const endRun=()=>{touchInput.run=false;$('touch-run').classList.remove('selected');};$('touch-run').addEventListener('touchend',endRun);$('touch-run').addEventListener('touchcancel',endRun);
    $('touch-crouch').addEventListener('touchstart',(e)=>{e.preventDefault();player.crouched=!player.crouched;$('touch-crouch').classList.toggle('selected',player.crouched);},{passive:false});
    $('touch-light').addEventListener('touchstart',(e)=>{e.preventDefault();player.flashlightOn=!player.flashlightOn;toast(player.flashlightOn?'Flashlight on':'Flashlight off');$('touch-light').classList.toggle('selected',player.flashlightOn);},{passive:false});
    // On touchscreens, drag the world viewport to look; UI controls keep their own touch streams.
    const canvas=$('game-canvas');
    canvas.addEventListener('touchstart',(e)=>{if(!isTouchDevice||gameState!=='playing')return;const t=e.changedTouches[0];touchInput.lookId=t.identifier;touchInput.lookX=t.clientX;touchInput.lookY=t.clientY;},{passive:true});
    canvas.addEventListener('touchmove',(e)=>{if(!isTouchDevice||gameState!=='playing'||touchInput.lookId===null)return;for(const t of e.changedTouches)if(t.identifier===touchInput.lookId){yaw-=(t.clientX-touchInput.lookX)*.004;pitch-=(t.clientY-touchInput.lookY)*.003;yaw=yaw%(Math.PI*2);pitch=Math.max(-1.28,Math.min(1.28,pitch));touchInput.lookX=t.clientX;touchInput.lookY=t.clientY;}},{passive:true});
    const endLook=(e)=>{for(const t of e.changedTouches)if(t.identifier===touchInput.lookId)touchInput.lookId=null;};canvas.addEventListener('touchend',endLook);canvas.addEventListener('touchcancel',endLook);
  }

  boot();
