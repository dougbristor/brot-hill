// codetree:point_sprite_orbit_viewer/v1
// Reference extracted from cloud/web/p2_classification_lite.html (2026-09-19 build).
// Byte-for-byte the same math/shader shape as cloud/web/p1_classification.html,
// cloud/web/p2_classification.html (both pre-date the lite page) and, as of
// 2026-09-20, caro/web/lattice_sphere_control.html — a cross-agent adoption,
// not a hypothetical generalization.
//
// What it does: a self-contained raw-WebGL point-cloud orbit viewer — additive
// point-sprite shader (circular falloff, discard outside radius), a yaw/pitch/dist
// spherical camera with drag-to-orbit + wheel-to-zoom, and the perspective/lookAt/
// matrix-multiply math to drive it. No dependency on Three.js or any other library.
//
// Why this is the reusable part: none of this code knows what the points MEAN
// (escape-time render, classification body, a plain sphere for a sampling control,
// probe data — four different meanings across the four sites that use this exact
// shape). It only needs a Float32Array of [x,y,z,scalar] and draws it. Anything
// that wants "drag to rotate, wheel to zoom, additive point sprites" without
// pulling in a full 3-D engine can reuse this verbatim.
//
// yaw/pitch/dist naming matches insights/web/nebula/bbrot.html's getCam/setCam
// convention on purpose — a page built on this block is already shaped for the
// T-094 style camera-bridging composite without an adapter.

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
}
function makeProgram(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
}

// [x,y,z, val], stride 16 bytes. val drives uColA->uColB mix; swap in a second
// varying (e.g. vRho) and a different mix, as p2_classification.html's bodyProg
// does, without touching anything below this shader pair.
const POINT_SPRITE_VS = `
precision highp float;
uniform mat4  uMVP;
uniform float uPS;
attribute vec3  aPos;
attribute float aVal;
varying float vVal;
void main() {
    vVal = aVal;
    gl_PointSize = uPS;
    gl_Position  = uMVP * vec4(aPos, 1.0);
}`;
const POINT_SPRITE_FS = `
precision highp float;
uniform vec3  uColA;
uniform vec3  uColB;
uniform float uAlpha;
varying float vVal;
void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = dot(p, p);
    if (d > 0.25) discard;
    float e = smoothstep(0.25, 0.10, d);
    vec3 col = mix(uColA, uColB, clamp(vVal, 0.0, 1.0));
    gl_FragColor = vec4(col * uAlpha, e * uAlpha);
}`;

function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
function lookAt(ex,ey,ez, cx,cy,cz, ux,uy,uz) {
    let fx=cx-ex,fy=cy-ey,fz=cz-ez;
    let il=1/Math.sqrt(fx*fx+fy*fy+fz*fz); fx*=il;fy*=il;fz*=il;
    let sx=fy*uz-fz*uy, sy=fz*ux-fx*uz, sz=fx*uy-fy*ux;
    il=1/Math.sqrt(sx*sx+sy*sy+sz*sz); sx*=il;sy*=il;sz*=il;
    const rx=sy*fz-sz*fy, ry=sz*fx-sx*fz, rz=sx*fy-sy*fx;
    return new Float32Array([sx,rx,-fx,0, sy,ry,-fy,0, sz,rz,-fz,0,
        -(sx*ex+sy*ey+sz*ez), -(rx*ex+ry*ey+rz*ez), (fx*ex+fy*ey+fz*ez), 1]);
}
function mulMat(a, b) {
    const r = new Float32Array(16);
    for (let i=0;i<4;i++) for(let j=0;j<4;j++) for(let k=0;k<4;k++) r[j*4+i]+=a[k*4+i]*b[j*4+k];
    return r;
}

// Spherical camera + drag-orbit/wheel-zoom wiring. `cam` is the caller's own
// object (so it can carry extra fields, e.g. cx/cy/cz recentring); this only
// reads/writes yaw/pitch/dist on it and calls the caller's `onChange`.
function attachOrbitControls(canvas, cam, onChange) {
    let drag = null;
    canvas.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
    });
    window.addEventListener('mouseup', () => { drag = null; });
    window.addEventListener('mousemove', e => {
        if (!drag) return;
        // Drop a stale drag when no button is held — browser automation
        // synthesises pointer events with buttons === 0, and without this
        // guard a screenshot silently reorients the camera. Measured on
        // cloud/web/p1_classification.html as az 0.5 -> -3.195 between two
        // shots that both believed they were at HOME.
        if (e.buttons === 0) { drag = null; return; }
        cam.yaw   = drag.yaw - (e.clientX - drag.x) * 0.005;
        cam.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.005));
        onChange();
    });
    canvas.addEventListener('wheel', e => {
        cam.dist = Math.max(0.08, Math.min(20, cam.dist * (1 + e.deltaY * 0.001)));
        onChange();
    }, { passive: true });
}

function eyeFromCam(cam) {
    return [cam.cx + cam.dist * Math.sin(cam.yaw) * Math.cos(cam.pitch),
            cam.cy + cam.dist * Math.sin(cam.pitch),
            cam.cz + cam.dist * Math.cos(cam.yaw) * Math.cos(cam.pitch)];
}
function mvpFromCam(canvas, cam, fov = 0.8, near = 0.005, far = 100) {
    const [ex,ey,ez] = eyeFromCam(cam);
    return mulMat(perspective(fov, canvas.width/canvas.height, near, far),
                  lookAt(ex,ey,ez, cam.cx,cam.cy,cam.cz, 0,1,0));
}

export { makeProgram, POINT_SPRITE_VS, POINT_SPRITE_FS,
          perspective, lookAt, mulMat, attachOrbitControls, eyeFromCam, mvpFromCam };
