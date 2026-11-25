// usdz.js: gera USDZ (AR Quick Look, iPhone/iPad) a partir dos grupos de triângulos em mm.
// Sem dependências externas. Unidades: metersPerUnit = 0.001 (mm), eixo Z para cima.

const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ZIP sem compressão (método 0), com conteúdo alinhado a 64 bytes (exigido pelo USDZ)
function zipStore(files){
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files){
    const name = enc.encode(f.name);
    const headerLen = 30 + name.length;
    let extra = (64 - ((offset + headerLen) % 64)) % 64;
    if (extra && extra < 4) extra += 64;          // campo extra precisa de no mínimo 4 bytes
    const lh = new Uint8Array(headerLen + extra);
    const dv = new DataView(lh.buffer);
    const crc = crc32(f.data), size = f.data.length;
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(12, 0x21, true);                 // data 1980-01-01
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, extra, true);
    lh.set(name, 30);
    if (extra){ dv.setUint16(headerLen, 0, true); dv.setUint16(headerLen + 2, extra - 4, true); }
    parts.push(lh, f.data);
    central.push({ name, crc, size, offset });
    offset += lh.length + size;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central){
    const ch = new Uint8Array(46 + c.name.length);
    const dv = new DataView(ch.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(14, 0x21, true);
    dv.setUint32(16, c.crc, true);
    dv.setUint32(20, c.size, true);
    dv.setUint32(24, c.size, true);
    dv.setUint16(28, c.name.length, true);
    dv.setUint32(42, c.offset, true);
    ch.set(c.name, 46);
    parts.push(ch);
    cdSize += ch.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  parts.push(end);
  return new Blob(parts, { type: 'model/vnd.usdz+zip' });
}

// Arquivo USDA (texto) com malha de triângulos e normais
function usdaDeTriangulos(T, nome = 'Peca'){
  const n = T.length / 9, P = [], N = [], Cn = [];
  const f3 = a => `(${a[0].toFixed(3)}, ${a[1].toFixed(3)}, ${a[2].toFixed(3)})`;
  for (let f = 0; f < n; f++){
    const A = [T[f*9],   T[f*9+1], T[f*9+2]];
    const B = [T[f*9+3], T[f*9+4], T[f*9+5]];
    const C = [T[f*9+6], T[f*9+7], T[f*9+8]];
    const u = [B[0]-A[0], B[1]-A[1], B[2]-A[2]], v = [C[0]-A[0], C[1]-A[1], C[2]-A[2]];
    let nx = u[1]*v[2]-u[2]*v[1], ny = u[2]*v[0]-u[0]*v[2], nz = u[0]*v[1]-u[1]*v[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [A, B, C]){ P.push(f3(p)); N.push(f3([nx, ny, nz])); }
    Cn.push(3);
  }
  const idx = P.map((_, i) => i);
  return `#usda 1.0
(
    defaultPrim = "${nome}"
    metersPerUnit = 0.001
    upAxis = "Z"
)

def Mesh "${nome}"
{
    int[] faceVertexCounts = [${Cn.join(', ')}]
    int[] faceVertexIndices = [${idx.join(', ')}]
    point3f[] points = [${P.join(', ')}]
    normal3f[] normals = [${N.join(', ')}] (
        interpolation = "vertex"
    )
    color3f[] primvars:displayColor = [(0.71, 0.33, 0.04)] (
        interpolation = "constant"
    )
    uniform token subdivisionScheme = "none"
}
`;
}

// Grupos (cada um com T = triângulos planos em mm) -> Blob USDZ
function usdzDeGrupos(G, nome = 'Peca'){
  const T = G.flatMap(g => g.T);
  return zipStore([{ name: 'peca.usda', data: new TextEncoder().encode(usdaDeTriangulos(T, nome)) }]);
}
