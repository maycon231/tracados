// base.js: módulo comum dos traçados de caldeiraria
// Carregar antes do script da página. Unidades: mm. Ângulos em graus na interface, radianos no cálculo.
// Cada peça devolve grupos nomeados ({nome, T}), usados na 3D, na legenda e na RA.

const $ = id => document.getElementById(id);
const v = id => parseFloat($(id).value);
const err = msg => `<span class="err">${msg}</span>`;

// Converte o diâmetro informado para a linha neutra (média) da chapa
function dmed(D, t, tipo){
  if (tipo === 'int') return D + t;   // medida interna: somar espessura
  if (tipo === 'med') return D;       // já é linha média
  return D - t;                       // medida externa (padrão): subtrair espessura
}

// Ajusta pontos (mundo) a uma área de desenho SVG, invertendo o eixo y
function fit(xs, ys, W, H){
  const minx = Math.min(...xs), maxx = Math.max(...xs);
  const miny = Math.min(...ys), maxy = Math.max(...ys);
  const s = Math.min((W - 40) / ((maxx - minx) || 1), (H - 40) / ((maxy - miny) || 1));
  return { f: (x, y) => [20 + (x - minx) * s, H - 20 - (y - miny) * s] };
}

// Estilo das legendas dentro das figuras (com contorno para ler sobre as linhas)
const LBL = 'font-size:12px;fill:var(--fg);paint-order:stroke;stroke:var(--bg);stroke-width:4px;';

// Cores dos grupos na 3D e na legenda
const CORES = ['#b5540a', '#2a7fbf', '#3a9b5c', '#c94f7c', '#8a6fd1', '#d9a31f'];

// Grupos nomeados: cada um guarda os triângulos (x, y, z em sequência)
const grupos = nomes => nomes.map(nome => ({ nome, T: [] }));

// Adiciona um triângulo ao buffer T
function tri(T, a, b, c){
  T.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

// Desenvolvimento de faixa de triângulos (triangulação; usado nas planificações)
function stripDev(V){
  const M = V.length, dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
  const X = [0, dist(V[0], V[1])], Y = [0, 0];
  for (let k = 2; k < M; k++){
    const A = k - 2, B = k - 1;
    const da = dist(V[A], V[k]), db = dist(V[B], V[k]);
    const dx = X[B] - X[A], dy = Y[B] - Y[A], d = Math.hypot(dx, dy) || 1e-9;
    const x = (da*da - db*db + d*d) / (2*d);
    const hh = Math.sqrt(Math.max(0, da*da - x*x));
    const ux = dx / d, uy = dy / d;
    let side = 1;
    if (k >= 3){
      const cross = dx * (Y[k-3] - Y[A]) - dy * (X[k-3] - X[A]);
      side = cross > 0 ? -1 : 1;
    }
    X.push(X[A] + ux*x - uy*hh*side);
    Y.push(Y[A] + uy*x + ux*hh*side);
  }
  return {X, Y};
}

// Cilindro com corte inclinado a (°); a = 0 é cilindro reto
function model3dCil(D, H, a, n){
  const R = D/2, t = Math.tan(a*Math.PI/180), G = grupos(['Lateral', 'Base inferior', 'Topo (corte)']);
  const [L, Bf, Tp] = G.map(g => g.T);
  const c0 = [0,0,0], ct = [0,0,H];
  const B = i => { const q = 2*Math.PI*i/n; return [R*Math.cos(q), R*Math.sin(q), 0]; };
  const U = i => { const q = 2*Math.PI*i/n; return [R*Math.cos(q), R*Math.sin(q), H + R*t*Math.cos(q)]; };
  for (let i = 0; i < n; i++){
    const j = (i+1) % n;
    tri(L, B(i), U(i), B(j)); tri(L, B(j), U(i), U(j));
    tri(Bf, c0, B(j), B(i));  tri(Tp, ct, U(i), U(j));
  }
  return G;
}

// Monta a 3D interativa dentro de divId, com legenda por grupo
const VIEWS = {};
function mount3d(divId, G){
  const div = $(divId);
  if (typeof THREE === 'undefined'){ div.innerHTML = err('Biblioteca 3D indisponível neste ambiente.'); return; }
  if (VIEWS[divId]){ VIEWS[divId].alive = false; VIEWS[divId].r.forceContextLoss(); }
  G = G.filter(g => g.T.length);
  let mnx=Infinity,mny=Infinity,mnz=Infinity,mxx=-Infinity,mxy=-Infinity,mxz=-Infinity;
  for (const g of G){
    for (let i = 0; i < g.T.length; i += 3){
      const x = g.T[i], y = g.T[i+1], z = g.T[i+2];
      mnx=Math.min(mnx,x); mxx=Math.max(mxx,x);
      mny=Math.min(mny,y); mxy=Math.max(mxy,y);
      mnz=Math.min(mnz,z); mxz=Math.max(mxz,z);
    }
  }
  const cx=(mnx+mxx)/2, cy=(mny+mxy)/2, cz=(mnz+mxz)/2;
  const size = Math.max(mxx-mnx, mxy-mny, mxz-mnz) || 1;
  const w = div.clientWidth || 340, h = 260;
  const r = new THREE.WebGLRenderer({antialias: true, alpha: true});
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.setSize(w, h);
  const el = r.domElement;
  el.style.width = '100%'; el.style.height = h + 'px'; el.style.display = 'block'; el.style.touchAction = 'none';
  div.innerHTML = '';
  div.style.height = 'auto';
  div.appendChild(el);

  const leg = document.createElement('div');
  leg.style.cssText = 'padding:8px 10px;font-size:13px;line-height:1.9;color:var(--fg)';
  leg.innerHTML = G.map((g, i) => `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${CORES[i%CORES.length]};margin-right:6px;vertical-align:middle"></span>${g.nome}`).join('<br>');
  div.appendChild(leg);

  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, w/h, 0.1, size*100);
  cam.up.set(0, 0, 1);
  cam.position.set(0, -size*1.8, size*0.9);
  cam.lookAt(0, 0, 0);
  sc.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9);
  dl.position.set(1, -1.5, 2);
  sc.add(dl);

  const grp = new THREE.Group();
  sc.add(grp);
  G.forEach((g, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.T, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: CORES[i%CORES.length], metalness: 0.2, roughness: 0.45, side: THREE.DoubleSide, flatShading: true
    }));
    m.position.set(-cx, -cy, -cz);
    grp.add(m);
  });

  let drag = false, lx = 0, ly = 0;
  el.onpointerdown = ev => { drag = true; lx = ev.clientX; ly = ev.clientY; el.setPointerCapture(ev.pointerId); };
  el.onpointermove = ev => {
    if (!drag) return;
    grp.rotation.z += (ev.clientX - lx) * 0.01;
    grp.rotation.x = Math.max(-1.5, Math.min(1.5, grp.rotation.x + (ev.clientY - ly) * 0.01));
    lx = ev.clientX; ly = ev.clientY;
  };
  el.onpointerup = el.onpointercancel = () => { drag = false; };

  const st = { alive: true, r };
  VIEWS[divId] = st;
  const loop = () => { if (!st.alive) return; requestAnimationFrame(loop); r.render(sc, cam); };
  loop();
}

// Escolhe um espaço de referência aceito pelo aparelho (viewer é obrigatório)
async function testarEspacos(session){
  const ok = {};
  for (const tp of ['viewer', 'local', 'local-floor', 'unbounded']){
    try { await session.requestReferenceSpace(tp); ok[tp] = true; } catch (e) { ok[tp] = false; }
  }
  if (!ok.viewer || !(ok.local || ok['local-floor'])) throw new Error('espaços de referência não suportados');
  return ok.local ? 'local' : 'local-floor';
}

// ===== Realidade aumentada (WebXR), genérica para todas as peças =====
// Escala 0,001 (mm para m). Só os grupos "Lateral" entram na RA (peça aberta).
let RA_SESSION = null;
let RA_ST = null;

// Controles na tela (chamados pelos botões do #arOverlay)
function raAcao(a){
  if (!RA_ST) return;
  if (a === 'girar'){ RA_ST.yaw += Math.PI/4; RA_ST.obj.rotation.y = RA_ST.yaw; }
  if (a === 'inverter'){
    RA_ST.flip = !RA_ST.flip;
    RA_ST.inner.rotation.x = RA_ST.flip ? Math.PI/2 : -Math.PI/2;
    RA_ST.inner.position.y = RA_ST.flip ? RA_ST.hgt : 0;
  }
  if (a === 'mover'){ RA_ST.mover = true; RA_ST.obj.visible = false; }
  if (a === 'fechar' && RA_SESSION){ RA_SESSION.end(); }
}

function fecharRA(){ if (RA_SESSION) RA_SESSION.end(); }

// Abre a peça em RA. gerar() devolve os grupos da peça, ou null depois de mostrar o erro com msg(h).
async function abrirRA(gerar, msg){
  if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-ar').catch(() => false))){
    msg(err('Realidade aumentada não disponível neste aparelho ou navegador. Use Android com Chrome e ARCore.'));
    return;
  }
  if (typeof THREE === 'undefined'){ msg(err('Biblioteca 3D indisponível.')); return; }
  const G0 = gerar();
  if (!G0) return;
  const G = G0.filter(g => /Lateral/.test(g.nome));   // sem tampas: a peça fica aberta
  const geo = new THREE.BufferGeometry();
  const T = G.flatMap(g => g.T);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(T, 3));
  geo.computeVertexNormals();

  const r = new THREE.WebGLRenderer({antialias: true, alpha: true});
  r.xr.enabled = true;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.setSize(window.innerWidth, window.innerHeight);
  r.domElement.style.position = 'fixed';
  r.domElement.style.left = '0'; r.domElement.style.top = '0';
  document.body.appendChild(r.domElement);

  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
  const dl = new THREE.DirectionalLight(0xffffff, 0.6);
  dl.position.set(1, 2, 1);
  dl.castShadow = true;
  dl.shadow.mapSize.set(1024, 1024);
  Object.assign(dl.shadow.camera, {left: -0.8, right: 0.8, top: 0.8, bottom: -0.8, near: 0.1, far: 10});
  dl.shadow.camera.updateProjectionMatrix();
  sc.add(dl);

  const obj = new THREE.Group();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color: 0xc4cad1, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide, flatShading: true}));
  mesh.rotation.x = -Math.PI/2;      // eixo da peça na vertical
  mesh.castShadow = true;
  obj.add(mesh);
  const hgt = Math.max(...T.filter((_, i) => i % 3 === 2));
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI/2), new THREE.ShadowMaterial({opacity: 0.4}));
  chao.receiveShadow = true;
  obj.add(chao);
  RA_ST = {obj, inner: mesh, yaw: 0, flip: false, mover: false, hgt};
  obj.scale.set(0.001, 0.001, 0.001); // mm para metros: tamanho real
  obj.visible = false;
  sc.add(obj);

  const ret = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 40).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color: 0x00ff66})
  );
  ret.matrixAutoUpdate = false;
  ret.visible = false;
  sc.add(ret);

  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: {root: $('arOverlay')}
    });
  } catch (e) {
    r.domElement.remove();
    msg(err('Não foi possível iniciar a RA: ' + e.message));
    return;
  }
  RA_SESSION = session;
  $('arOverlay').style.display = '';   // reexibe o overlay (ele é ocultado ao fim de cada sessão)
  let refTipo;
  try { refTipo = await testarEspacos(session); }
  catch (e) { session.end(); msg(err('Este aparelho não aceita os espaços necessários para a RA.')); return; }
  r.xr.setReferenceSpaceType(refTipo);
  await r.xr.setSession(session);
  const ctrl = document.querySelector('#arOverlay .ra-ctrl');
  if (session.domOverlayState){ ctrl.style.display = 'flex'; }
  else { msg(err('Botões na tela não disponíveis neste aparelho. Toque na tela para mover a peça.')); }

  const viewer = await session.requestReferenceSpace('viewer');
  const hitSource = await session.requestHitTestSource({space: viewer});
  const refSpace = await r.xr.getReferenceSpace();
  let lastHit = null;

  session.addEventListener('select', () => {
    if (!lastHit) return;
    obj.position.setFromMatrixPosition(lastHit);
    obj.visible = true;
  });

  r.setAnimationLoop((time, frame) => {
    if (frame && hitSource){
      const res = frame.getHitTestResults(hitSource);
      if (res.length){
        const pose = res[0].getPose(refSpace);
        if (pose){
          lastHit = new THREE.Matrix4().fromArray(pose.transform.matrix);
          ret.matrix.copy(lastHit);
          ret.visible = true;
          if (!obj.visible && !(RA_ST && RA_ST.mover)){ obj.position.setFromMatrixPosition(lastHit); obj.visible = true; }
        }
      }
    }
    r.render(sc, cam);
  });

  session.addEventListener('end', () => {
    r.setAnimationLoop(null);
    r.domElement.remove();
    $('arOverlay').style.display = 'none';
    RA_SESSION = null;
    RA_ST = null;
    ctrl.style.display = 'none';
  });
  msg('');
}
