import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const board = JSON.parse(await readFile(resolve(root, "boards/prototype/eva15_inspired_physics_v1.json"), "utf8"));
const groups = new Map();
const colors = {
  black: [0.008, 0.012, 0.02, 1], purple: [0.18, 0.025, 0.36, 1], violet: [0.48, 0.05, 0.92, 1],
  green: [0.2, 0.95, 0.16, 1], orange: [1, 0.2, 0.02, 1], steel: [0.5, 0.57, 0.64, 1],
  brass: [0.68, 0.47, 0.13, 1], field: [0.025, 0.04, 0.07, 1], screen: [0.002, 0.012, 0.025, 1],
};
const group = (material) => {
  if (!groups.has(material)) groups.set(material, { positions: [], normals: [], indices: [] });
  return groups.get(material);
};
const vertex = (g, p, n) => { g.positions.push(...p); g.normals.push(...n); return g.positions.length / 3 - 1; };
function box(material, center, size, angleY = 0) {
  const g = group(material), [cx, cy, cz] = center, [sx, sy, sz] = size.map((v) => v / 2);
  const faces = [
    [[1,0,0],[[sx,-sy,-sz],[sx,sy,-sz],[sx,sy,sz],[sx,-sy,sz]]], [[-1,0,0],[[-sx,-sy,sz],[-sx,sy,sz],[-sx,sy,-sz],[-sx,-sy,-sz]]],
    [[0,1,0],[[-sx,sy,-sz],[-sx,sy,sz],[sx,sy,sz],[sx,sy,-sz]]], [[0,-1,0],[[-sx,-sy,sz],[-sx,-sy,-sz],[sx,-sy,-sz],[sx,-sy,sz]]],
    [[0,0,1],[[-sx,-sy,sz],[sx,-sy,sz],[sx,sy,sz],[-sx,sy,sz]]], [[0,0,-1],[[sx,-sy,-sz],[-sx,-sy,-sz],[-sx,sy,-sz],[sx,sy,-sz]]],
  ];
  const c = Math.cos(angleY), s = Math.sin(angleY);
  for (const [normal, corners] of faces) {
    const rn = [normal[0] * c + normal[2] * s, normal[1], -normal[0] * s + normal[2] * c];
    const ids = corners.map(([x,y,z]) => vertex(g, [cx + x*c + z*s, cy+y, cz-x*s+z*c], rn));
    g.indices.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);
  }
}
function cylinder(material, center, radius, depth, sides = 12) {
  const g = group(material), [cx,cy,cz] = center, half=depth/2;
  for (let i=0;i<sides;i++) {
    const a=i*Math.PI*2/sides,b=(i+1)*Math.PI*2/sides, ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
    const p=[vertex(g,[cx+radius*ca,cy-half,cz+radius*sa],[ca,0,sa]),vertex(g,[cx+radius*cb,cy-half,cz+radius*sb],[cb,0,sb]),vertex(g,[cx+radius*cb,cy+half,cz+radius*sb],[cb,0,sb]),vertex(g,[cx+radius*ca,cy+half,cz+radius*sa],[ca,0,sa])];
    g.indices.push(p[0],p[1],p[2],p[0],p[2],p[3]);
  }
}
function segment(material, from, to, thickness=0.004, depth=0.012) {
  const ax=(from.x-250)/1000, az=(500-from.y)/1000, bx=(to.x-250)/1000, bz=(500-to.y)/1000;
  const dx=bx-ax,dz=bz-az; box(material,[(ax+bx)/2,-0.06,(az+bz)/2],[Math.hypot(dx,dz),depth,thickness],-Math.atan2(dz,dx));
}

box("black",[0,0.04,0.28],[0.66,0.14,0.86]); box("purple",[0,-0.04,0.3],[0.58,0.035,0.70]);
box("field",[0,-0.064,0.25],[0.5,0.016,0.5]); box("purple",[0,-0.075,-0.06],[0.65,0.18,0.18]);
box("black",[-0.08,-0.18,-0.035],[0.38,0.14,0.045]); box("violet",[0,-0.083,0.28],[0.27,0.025,0.22]);
box("screen",[0,-0.1,0.28],[0.21,0.012,0.15]); box("green",[-0.13,-0.107,0.39],[0.22,0.008,0.012],-0.35);
box("orange",[0.14,-0.107,0.37],[0.23,0.008,0.012],0.35); cylinder("black",[0.235,-0.17,-0.065],0.047,0.05,24);
for (const rail of board.rails) segment("steel",rail.from,rail.to,rail.thickness/1000);
for (const gate of board.gates) if (gate.enabled) segment("steel",gate.from,gate.to,gate.thickness/1000);
for (const arc of board.arcRails) for(let i=0;i<arc.segments;i++) {
  const a=(arc.startAngleDegrees+(arc.endAngleDegrees-arc.startAngleDegrees)*i/arc.segments)*Math.PI/180;
  const b=(arc.startAngleDegrees+(arc.endAngleDegrees-arc.startAngleDegrees)*(i+1)/arc.segments)*Math.PI/180;
  segment("steel",{x:arc.center.x+Math.cos(a)*arc.radius,y:arc.center.y+Math.sin(a)*arc.radius},{x:arc.center.x+Math.cos(b)*arc.radius,y:arc.center.y+Math.sin(b)*arc.radius},arc.thickness/1000);
}
for (const nail of board.nails) if(nail.enabled) cylinder("brass",[(nail.positionX-250)/1000,-0.08,(500-nail.positionY)/1000],0.0026,0.025,10);
box("green",[0.165,-0.1,0.22],[0.035,0.012,0.012]); box("orange",[0.11,-0.1,0.08],[0.13,0.016,0.025]);

const chunks=[],bufferViews=[],accessors=[],primitives=[]; let offset=0;
const push=(typed,target) => { const raw=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength), pad=(4-raw.length%4)%4, index=bufferViews.length; chunks.push(raw,Buffer.alloc(pad)); bufferViews.push({buffer:0,byteOffset:offset,byteLength:raw.length,target}); offset+=raw.length+pad; return index; };
let materialIndex=0;
for (const g of groups.values()) {
  const pos=new Float32Array(g.positions),norm=new Float32Array(g.normals),ind=new Uint32Array(g.indices);
  const pView=push(pos,34962),nView=push(norm,34962),iView=push(ind,34963);
  const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity]; for(let i=0;i<pos.length;i+=3)for(let k=0;k<3;k++){mins[k]=Math.min(mins[k],pos[i+k]);maxs[k]=Math.max(maxs[k],pos[i+k]);}
  const pAcc=accessors.push({bufferView:pView,componentType:5126,count:pos.length/3,type:"VEC3",min:mins,max:maxs})-1;
  const nAcc=accessors.push({bufferView:nView,componentType:5126,count:norm.length/3,type:"VEC3"})-1;
  const iAcc=accessors.push({bufferView:iView,componentType:5125,count:ind.length,type:"SCALAR"})-1;
  primitives.push({attributes:{POSITION:pAcc,NORMAL:nAcc},indices:iAcc,material:materialIndex++});
}
const binary=Buffer.concat(chunks), materials=[...groups.keys()].map((name)=>({name,pbrMetallicRoughness:{baseColorFactor:colors[name],metallicFactor:["steel","brass"].includes(name)?.9:.25,roughnessFactor:.28}}));
const gltf={asset:{version:"2.0",generator:"pachinko-sim deterministic GLB builder"},scene:0,scenes:[{nodes:[0]}],nodes:[{name:"Eva15ReferenceCabinet",mesh:0,extras:{visualOnly:true,source:"boards/prototype/eva15_inspired_physics_v1.json",policy:"reference-based approximation"}}],meshes:[{primitives}],materials,buffers:[{byteLength:binary.length}],bufferViews,accessors};
const jsonRaw=Buffer.from(JSON.stringify(gltf)),jsonPad=(4-jsonRaw.length%4)%4,json=Buffer.concat([jsonRaw,Buffer.alloc(jsonPad,0x20)]);
const total=12+8+json.length+8+binary.length,out=Buffer.alloc(12); out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(total,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length,0);bh.writeUInt32LE(0x004e4942,4);
await mkdir(resolve(root,"assets/models"),{recursive:true}); const target=resolve(root,"assets/models/eva15_reference_cabinet.glb"); await writeFile(target,Buffer.concat([out,jh,json,bh,binary]));
console.log(JSON.stringify({target,bytes:total,materials:materials.length,triangles:[...groups.values()].reduce((n,g)=>n+g.indices.length/3,0)},null,2));
