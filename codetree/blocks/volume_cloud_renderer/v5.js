import {makeProgram} from '../point_sprite_orbit_viewer/v1.js';
import {DUST_WIDTH} from '../dust_splat/v1.js';
import {GAUSSIAN_WIDTH} from '../gaussian_splat/v1.js';
// WebGL2 cached-volume and perspective Gaussian fog renderer. Event-driven; no RAF loop.
const fullVS=`#version 300 es
void main(){gl_Position=vec4(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.,0.,1.);}`;
const common=`
precision highp float;precision highp int;precision highp sampler3D;
uniform vec3 eye;uniform mat3 basis;uniform vec2 viewport;uniform sampler3D fog;
uniform float opacity,exposure,keyPower,fillPower,rimPower,spacing,shadowLod;uniform bool hasVolume,groundShadow,liveCloud;
const float halfBox=1.85;
vec4 field(vec3 p){return textureLod(fog,(p+halfBox)/(2.*halfBox),0.);}
vec3 lighting(vec3 paths){vec3 lights=exp(-opacity*.72*paths);return vec3(.12,.17,.25)+keyPower*lights.x*vec3(1.,.85,.70)+fillPower*lights.y*vec3(.65,.80,1.)+rimPower*lights.z*vec3(.50,.70,1.);}
vec3 displayColor(vec3 linearColor){return pow(vec3(1.)-exp(-max(linearColor,vec3(0.))*exposure),vec3(1./2.2));}
vec3 direction(){vec2 q=(2.*gl_FragCoord.xy-viewport)/viewport.y*.42;return normalize(basis[2]+q.x*basis[0]+q.y*basis[1]);}
vec2 box(vec3 ro,vec3 rd){vec3 inv=1./(rd+vec3(1e-9)),a=(-vec3(halfBox)-ro)*inv,b=(vec3(halfBox)-ro)*inv;return vec2(max(0.,max(max(min(a,b).x,min(a,b).y),min(a,b).z)),min(min(max(a,b).x,max(a,b).y),max(a,b).z));}
float floorDistance(vec3 rd){if(eye.z> -1.2&&rd.z< -.00001){float t=(-1.2-eye.z)/rd.z;if(t>0.)return t;}return 100.;}
vec3 backdrop(vec3 rd,out float floorT){floorT=floorDistance(rd);float shade=1.;vec3 base=mix(vec3(.14,.19,.27),vec3(.28,.37,.49),clamp(.5+.4*dot(rd,basis[1]),0.,1.));
 if(floorT<100.){vec3 p=eye+rd*floorT;float optical=0.;if(hasVolume&&groundShadow){vec3 toLight=normalize(vec3(-3.,-4.,4.)-p);for(int k=0;k<32;k++){vec3 a=p+toLight*(float(k)+.5)*.13;if(all(lessThan(abs(a),vec3(halfBox))))optical+=textureLod(fog,(a+halfBox)/(2.*halfBox),shadowLod).a*.13;}}shade=.48+.52*exp(-optical*opacity*.8);base=vec3(.22,.28,.37)*shade;}
 return displayColor(base);}
`;
const backgroundFS=`#version 300 es
${common}
out vec4 result;void main(){float t;result=vec4(backdrop(direction(),t),1.);}`;
const volumeFS=`#version 300 es
${common}
out vec4 result;void main(){vec3 rd=direction();float floorT;vec3 bg=backdrop(rd,floorT);vec2 hit=box(eye,rd);hit.y=min(hit.y,floorT);if(!hasVolume||hit.y<=hit.x){result=vec4(bg,1.);return;}
float stepSize=max(spacing*.75,(hit.y-hit.x)/240.),T=1.;vec3 color=vec3(0.);
for(int k=0;k<244;k++){float t=hit.x+(float(k)+.5)*stepSize;if(t>=hit.y||T<.008)break;vec4 f=field(eye+rd*t);if(f.a<.0001)continue;float a=1.-exp(-opacity*f.a*min(stepSize,hit.y-(t-stepSize*.5)));vec3 paths=liveCloud?f.rgb*4.:f.rgb*4./max(f.a,.001);vec3 col=displayColor(lighting(paths)*vec3(.65,.78,1.));color+=T*a*col;T*=1.-a;}
result=vec4(color+T*bg,1.);}`;
const splatVS=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;precision highp sampler3D;
layout(location=0)in uint index;uniform sampler2D points;uniform vec3 eye;uniform mat3 basis;uniform vec2 viewport;uniform float spacing,footprint;uniform int primitive,gridN;uniform bool liveCloud;uniform sampler3D fog;
out vec2 delta;flat out vec3 conic;flat out float optical,centreDepth;flat out vec3 paths;
vec4 fetch(int i){return texelFetch(points,ivec2(i%1024,i/1024),0);}
void main(){int i=int(index)*4;vec4 p=vec4(0.),c0=vec4(0.),c1=vec4(0.),c2=vec4(0.);if(!liveCloud){p=fetch(i);c0=fetch(i+1);c1=fetch(i+2);c2=fetch(i+3);}vec4 liveField=vec4(0.);if(liveCloud){int id=int(index);ivec3 cell=ivec3(id%gridN,(id/gridN)%gridN,id/(gridN*gridN));liveField=texelFetch(fog,cell,0);p=vec4((vec3(cell)+.5)/float(gridN)*3.7-1.85,spacing*spacing*spacing*liveField.a);if(liveField.a<.0001){delta=vec2(0.);conic=vec3(1.);optical=0.;centreDepth=0.;paths=vec3(0.);gl_Position=vec4(3.,3.,3.,1.);return;}}vec3 d=p.xyz-eye;vec3 q=vec3(dot(d,basis[0]),dot(d,basis[1]),dot(d,basis[2]));float z=max(q.z,.001),f=viewport.y/(2.*.42);
mat3 C=mat3(c0.x,c0.y,c0.z,c0.y,c0.w,c1.x,c0.z,c1.x,c1.y);
if(liveCloud||primitive==0||primitive==2){float g=spacing*(primitive==2?${DUST_WIDTH}:${GAUSSIAN_WIDTH});C=mat3(g*g);}C*=footprint*footprint;
vec3 j0=f/z*(basis[0]-q.x/z*basis[2]),j1=f/z*(basis[1]-q.y/z*basis[2]);float a=dot(j0,C*j0)+.3,b=dot(j0,C*j1),c=dot(j1,C*j1)+.3;float det=max(a*c-b*b,1e-12);conic=vec3(c,-b,a)/det;
vec2 extent=3.*sqrt(vec2(a,c));vec2 corner=vec2(float(gl_VertexID&1),float(gl_VertexID>>1))*2.-1.;delta=corner*extent;vec2 centre=q.xy/z*vec2(1./(.42*viewport.x/viewport.y),1./.42);
gl_Position=vec4((centre+delta*2./viewport)*z,0.,z);if(q.z<.02)gl_Position=vec4(3.,3.,3.,1.);
optical=p.w*f*f/(z*z*6.28318530718*sqrt(det));centreDepth=z;paths=liveCloud?liveField.rgb*4.:vec3(c1.zw,c2.x);}`;
const splatFS=`#version 300 es
${common}
in vec2 delta;flat in vec3 conic;flat in float optical,centreDepth;flat in vec3 paths;uniform int primitive;out vec4 result;
void main(){float q=conic.x*delta.x*delta.x+2.*conic.y*delta.x*delta.y+conic.z*delta.y*delta.y;if(q>9.)discard;vec3 rd=direction();float floorT=floorDistance(rd);if(centreDepth>floorT*dot(rd,basis[2]))discard;
float a=1.-exp(-opacity*optical*exp(-.5*q));vec3 color=primitive==2?displayColor(vec3(.65,.78,1.)*1.5):displayColor(lighting(paths)*vec3(.65,.78,1.));result=vec4(color*a,a);}`;
const unit=a=>{const r=Math.hypot(...a);return a.map(x=>x/r);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// A bounded finite-N preview, evaluated on GPU voxel centres. No CPU readback in live use.
// Persistent voxel IDs, mixed spatial cohorts and independently fading occupancy.
const densityFS=`#version 300 es
precision highp float;precision highp int;precision highp sampler3D;
uniform vec3 c;uniform int steps,gridN,layer,cohorts,phase;uniform float escapeR,blend;
uniform bool plant,initial,seedFromFog;uniform sampler3D previous,seedFog;out vec4 result;
uint cohortHash(uint h){h^=h>>16;h*=2246822519u;h^=h>>13;h*=3266489917u;return h^(h>>16);}
void main(){ivec3 cell=ivec3(gl_FragCoord.xy,layer);vec3 uv=(vec3(cell)+.5)/float(gridN);vec4 old=initial?vec4(0.):texelFetch(previous,cell,0);float target=old.g;
uint id=uint(cell.x+gridN*(cell.y+gridN*cell.z));
if(initial||int(cohortHash(id)%uint(cohorts))==phase){vec3 z=(uv*2.-1.)*1.85;target=1.;for(int i=0;i<=48;i++){if(dot(z,z)>escapeR*escapeR){target=0.;break;}if(i>=steps)break;z=vec3(z.x*z.x-z.y*z.y-z.z*z.z,z.y*(2.*z.x-z.z),z.z*(2.*z.x+z.y))+c;}if(plant&&cell.x<gridN/2)target=0.;}
float a=initial?(seedFromFog?textureLod(seedFog,uv,0.).a:target):old.a;
// RGBA8 history: retain a one-byte minimum change so a fade cannot stick near 0/1.
float amount=blend>0.?min(abs(target-a),max(1./255.,abs(target-a)*blend)):0.;a+=sign(target-a)*amount;
result=vec4(0.,target,0.,clamp(a,0.,1.));}`;
// Cache unpremultiplied light paths separately from each sample's fading opacity.
const liveLightFS=`#version 300 es
precision highp float;precision highp int;precision highp sampler3D;
uniform sampler3D density,previousFog;uniform int gridN,layer,cohorts,phase;uniform bool initial;out vec4 result;
uint cohortHash(uint h){h^=h>>16;h*=2246822519u;h^=h>>13;h*=3266489917u;return h^(h>>16);}
float path(vec3 p,vec3 light){vec3 d=normalize(light-p);float tau=0.;for(int k=0;k<12;k++){vec3 q=p+d*(float(k)+.5)*.22;if(any(greaterThanEqual(abs(q),vec3(1.85))))break;tau+=textureLod(density,(q+1.85)/3.7,0.).a*.22;}return tau;}
void main(){ivec3 cell=ivec3(gl_FragCoord.xy,layer);vec3 uv=(vec3(cell)+.5)/float(gridN);float alive=texelFetch(density,cell,0).a;vec3 paths=initial?vec3(0.):texelFetch(previousFog,cell,0).rgb;
uint id=uint(cell.x+gridN*(cell.y+gridN*cell.z));
if(alive>.0001&&(initial||int(cohortHash(id)%uint(cohorts))==phase)){vec3 p=(uv*2.-1.)*1.85;paths=vec3(path(p,vec3(-3.,-4.,4.)),path(p,vec3(4.,-1.,2.)),path(p,vec3(1.,3.,3.)))/4.;}
result=vec4(paths,alive);}`;
export function camera(state,aspect=1){const {az,el,distance}=state,out=[Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az)],framing=Math.max(1,.85/aspect),eye=out.map(x=>x*distance*framing),forward=out.map(x=>-x),right=unit(cross(forward,[0,1,0])),up=cross(right,forward);return {eye,right,up,forward};}
export function createCloudRenderer(canvas){
 const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('This viewer needs WebGL 2.');
 const make=(vs,fs)=>{const p=makeProgram(gl,vs,fs),u={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const name=gl.getActiveUniform(p,i).name;u[name]=gl.getUniformLocation(p,name);}return {p,u};};
 const B=make(fullVS,backgroundFS),V=make(fullVS,volumeFS),S=make(splatVS,splatFS),D=make(fullVS,densityFS),L=make(fullVS,liveLightFS),vao=gl.createVertexArray(),empty=gl.createVertexArray(),orderBuffer=gl.createBuffer();
 gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,orderBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribIPointer(0,1,gl.UNSIGNED_INT,4,0);gl.vertexAttribDivisor(0,1);gl.bindVertexArray(null);
 const pointTex=gl.createTexture(),fogA=gl.createTexture(),fogB=gl.createTexture(),rawA=gl.createTexture(),rawB=gl.createTexture(),liveFbo=gl.createFramebuffer();let data=new Float32Array(0),spec=null,hasVolume=false,uploads=0,draws=0,disposed=false,lastFrame=null,live=false,liveN=0,liveStats=null,raw=rawA,back=rawB,liveTick=0,liveOrderKey=null,fog=fogA,fogBack=fogB;
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,pointTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,new Float32Array(4));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,fog);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,1,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
 for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,p,gl.LINEAR);for(const p of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);
 const info=gl.getExtension('WEBGL_debug_renderer_info'),gpu=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 function allocate3D(texture,n){gl.bindTexture(gl.TEXTURE_3D,texture);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,n,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,null);for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,p,gl.LINEAR);for(const p of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.CLAMP_TO_EDGE);}
 function updateLive(c,steps,{n=32,plant=false,readback=false,smoothMs=0,cohorts=1,dtMs=16.667}={}){
  if(disposed||!Array.isArray(c)||c.length!==3||!c.every(Number.isFinite)||!Number.isInteger(steps)||steps<1||steps>48||![24,32,48,64,74,96,148].includes(n)||![1,2,3,4,6,8].includes(cohorts)||!Number.isFinite(smoothMs)||smoothMs<0||smoothMs>1000||!Number.isFinite(dtMs)||dtMs<0)throw Error('Invalid live splat recipe');
  const start=performance.now(),initial=!live||liveN!==n,seedFromFog=initial&&hasVolume;
  gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(empty);
  if(initial){gl.activeTexture(gl.TEXTURE2);allocate3D(raw,n);allocate3D(back,n);liveTick=0;liveOrderKey=null;}
  live=true;liveN=n;spec={n,spacing:3.7/n};gl.bindFramebuffer(gl.FRAMEBUFFER,liveFbo);gl.viewport(0,0,n,n);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.useProgram(D.p);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,raw);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,fog);gl.uniform1i(D.u.previous,2);gl.uniform1i(D.u.seedFog,1);
  gl.uniform1i(D.u.initial,+initial);gl.uniform1i(D.u.seedFromFog,+seedFromFog);gl.uniform1i(D.u.cohorts,cohorts);gl.uniform1i(D.u.phase,liveTick%cohorts);gl.uniform1f(D.u.blend,smoothMs?1-Math.exp(-Math.min(dtMs,100)/smoothMs):1);
  gl.uniform3fv(D.u.c,c);gl.uniform1i(D.u.steps,steps);gl.uniform1i(D.u.gridN,n);gl.uniform1i(D.u.plant,+plant);let R=4;while(R*R/4-R<=c.reduce((s,x)=>s+Math.abs(x),0))R++;gl.uniform1f(D.u.escapeR,R);
  const lightBytes=readback?new Uint8Array(n**3*4):null;const densityBytes=readback?new Uint8Array(n**3):null,weights=readback?new Uint8Array(n**3):null,targets=readback?new Uint8Array(n**3):null,pixels=readback?new Uint8Array(n*n*4):null;
  for(let z=0;z<n;z++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,back,0,z);if(z===0&&gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Live density framebuffer incomplete');gl.uniform1i(D.u.layer,z);gl.drawArrays(gl.TRIANGLES,0,3);if(readback){gl.readPixels(0,0,n,n,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(let i=0;i<n*n;i++){const j=z*n*n+i;weights[j]=pixels[i*4+3];targets[j]=pixels[i*4+1];densityBytes[j]=+(weights[j]>127);}}}
  [raw,back]=[back,raw];const densitySubmitMs=performance.now()-start;
  gl.activeTexture(gl.TEXTURE1);if(initial){allocate3D(fogBack,n);allocate3D(fog,n);}gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_3D,fog);gl.useProgram(L.p);gl.uniform1i(L.u.previousFog,3);gl.uniform1i(L.u.initial,+initial);gl.uniform1i(L.u.cohorts,cohorts);gl.uniform1i(L.u.phase,liveTick%cohorts);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_3D,raw);gl.uniform1i(L.u.density,2);gl.uniform1i(L.u.gridN,n);
  for(let z=0;z<n;z++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,fogBack,0,z);gl.uniform1i(L.u.layer,z);gl.drawArrays(gl.TRIANGLES,0,3);if(readback){gl.readPixels(0,0,n,n,gl.RGBA,gl.UNSIGNED_BYTE,pixels);lightBytes.set(pixels,z*n*n*4);}}
  [fog,fogBack]=[fogBack,fog];gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,fog);gl.generateMipmap(gl.TEXTURE_3D);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);hasVolume=true;
  liveStats={n,c:[...c],steps,cohorts,refreshFraction:initial?1:1/cohorts,lightRefreshFraction:initial?1:1/cohorts,phase:liveTick++%cohorts,smoothMs,dtMs,densitySubmitMs,updateSubmitMs:performance.now()-start,gpu,glError:gl.getError()};return {...liveStats,density:densityBytes,weights,targets,lighting:lightBytes};
 }
 function install(packed,nextSpec,volume){
   if(disposed||!(packed instanceof Float32Array)||packed.length%16||packed.length/16>400000||!packed.every(Number.isFinite))throw Error('Invalid splat buffer');
   live=false;liveOrderKey=null;data=packed;spec=nextSpec;const w=1024,h=Math.max(1,Math.ceil(packed.length/4/w)),texels=new Float32Array(w*h*4);texels.set(packed);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,pointTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,texels);uploads+=texels.byteLength;
   for(const p of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,fog);
   hasVolume=!!volume;if(volume){if(volume.length!==nextSpec.n**3*4)throw Error('Invalid density texture');gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,nextSpec.n,nextSpec.n,nextSpec.n,0,gl.RGBA,gl.UNSIGNED_BYTE,volume);gl.generateMipmap(gl.TEXTURE_3D);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);uploads+=volume.byteLength;}
   return {points:data.length/16,uploads};
 }
 function sorted(forward){
   const key=live?`${liveN}:${forward.join(',')}`:null;if(live&&key===liveOrderKey)return 0;
   const count=live?liveN**3:data.length/16,buckets=new Uint32Array(2048),bin=new Uint16Array(count),starts=new Uint32Array(2048),order=new Uint32Array(count);
   for(let i=0;i<count;i++){const j=i*16,p=live?[(i%liveN+.5)*spec.spacing-1.85,(Math.floor(i/liveN)%liveN+.5)*spec.spacing-1.85,(Math.floor(i/(liveN*liveN))+.5)*spec.spacing-1.85]:data.subarray(j,j+3),z=p[0]*forward[0]+p[1]*forward[1]+p[2]*forward[2],b=Math.max(0,Math.min(2047,Math.floor((z+4)/8*2047)));bin[i]=b;buckets[b]++;}
   let total=0;for(let b=2047;b>=0;b--){starts[b]=total;total+=buckets[b];}for(let i=0;i<count;i++)order[starts[bin[i]]++]=i;
   gl.bindBuffer(gl.ARRAY_BUFFER,orderBuffer);gl.bufferData(gl.ARRAY_BUFFER,order,gl.DYNAMIC_DRAW);liveOrderKey=key;return order.byteLength;
 }
 function setup(program,s,cam){gl.useProgram(program.p);const u=program.u;gl.uniform3fv(u.eye,cam.eye);gl.uniformMatrix3fv(u.basis,false,[...cam.right,...cam.up,...cam.forward]);gl.uniform2f(u.viewport,canvas.width,canvas.height);
   for(const [k,v]of Object.entries({opacity:s.opacity,exposure:s.exposure,keyPower:s.key,fillPower:s.fill,rimPower:s.rim,spacing:spec?.spacing??.1,footprint:s.footprint,shadowLod:Math.max(0,Math.min(Math.log2(spec?.n??1),Math.log2(1+(s.shadowBlur??.35)/(spec?.spacing??.1))))}))gl.uniform1f(u[k],v);
   gl.uniform1i(u.liveCloud,+live);gl.uniform1i(u.gridN,liveN);gl.uniform1i(u.groundShadow,s.shadow===0?0:1);
   gl.uniform1i(u.hasVolume,+hasVolume);gl.uniform1i(u.fog,1);gl.uniform1i(u.points,0);gl.uniform1i(u.primitive,s.kind==='bsplat'?1:s.kind==='dust'?2:0);
 }
 function draw(state,{quick=false,readback=false,complete=false}={}){
   if(disposed)throw Error('Renderer disposed');const start=performance.now(),width=Math.max(2,Math.min(live?Math.max(320,Math.min(1600,state.liveWidth??720)):(quick?440:900),canvas.clientWidth||800)),height=Math.max(2,Math.round(width*(canvas.clientHeight||600)/(canvas.clientWidth||800)));
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}const cam=camera(state,width/height);gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,pointTex);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,fog);gl.bindVertexArray(empty);
   const volume=state.kind==='volume'&&hasVolume,program=volume?V:B;setup(program,state,cam);gl.drawArrays(gl.TRIANGLES,0,3);let orderBytes=0;
   if(!volume&&(live||data.length)){orderBytes=sorted(cam.forward);setup(S,state,cam);gl.bindVertexArray(vao);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,live?liveN**3:data.length/16);gl.disable(gl.BLEND);}
   const submitMs=performance.now()-start;let hash=null,lit=0,leftLit=0,rightLit=0;if(readback){const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let h=2166136261;for(let i=0;i<pixels.length;i++){h=Math.imul(h^pixels[i],16777619);if(i%4===0&&pixels[i]>160){lit++;if(i/4%width<width/2)leftLit++;else rightLit++;}}hash=h>>>0;}else if(complete)gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
   lastFrame={draw:++draws,submitMs,completeMs:complete||readback?performance.now()-start:null,gpu,width,height,points:live?liveN**3:data.length/16,livePrimitive:live?(volume?'volume':'gaussian'):null,geometryBytes:uploads,orderBytes,glError:gl.getError(),hash,lit,leftLit,rightLit,live,liveGrid:live?liveN:null};return lastFrame;
 }
 function dispose(){if(disposed)return;disposed=true;for(const x of[B,V,S,D,L])gl.deleteProgram(x.p);gl.deleteTexture(pointTex);gl.deleteTexture(fogA);gl.deleteTexture(fogB);gl.deleteTexture(rawA);gl.deleteTexture(rawB);gl.deleteFramebuffer(liveFbo);gl.deleteVertexArray(vao);gl.deleteVertexArray(empty);gl.deleteBuffer(orderBuffer);data=new Float32Array(0);}
 return {install,draw,updateLive,dispose,gpu,get live(){return live;},get liveStats(){return liveStats;},get count(){return live?0:data.length/16;},get stats(){return lastFrame;},get data(){return data;},get uploads(){return uploads;},get hasVolume(){return hasVolume;}};
}
