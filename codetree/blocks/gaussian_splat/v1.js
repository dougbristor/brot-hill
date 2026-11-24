// Gaussian primitives for analytic voxel fog, not photo-trained 3DGS.
export const STRIDE = 16;
export const GAUSSIAN_WIDTH=.55;
export function isotropic(spacing, width = GAUSSIAN_WIDTH) {
  if (!(spacing > 0) || !(width > 0)) throw Error('Positive Gaussian spacing/width required');
  const v = (spacing * width) ** 2;
  return [v, 0, 0, v, 0, v]; // xx, xy, xz, yy, yz, zz
}
export function determinant(c) {
  const [a,b,c0,d,e,f] = c;
  return a*d*f + 2*b*c0*e - a*e*e - d*c0*c0 - f*b*b;
}
// Exact first-order perspective covariance J Sigma J^T (pixel units).
export function projectCovariance(c, p, right, up, forward, focal) {
  const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0), z=dot(p,forward);
  if (!(z>0)) return null;
  const row = axis => axis.map((v,i)=>focal/z*(v-dot(p,axis)/z*forward[i]));
  const u=row(right),v=row(up),[a,b,k,d,e,f]=c;
  const mul=x=>[a*x[0]+b*x[1]+k*x[2],b*x[0]+d*x[1]+e*x[2],k*x[0]+e*x[1]+f*x[2]];
  return [dot(u,mul(u)),dot(u,mul(v)),dot(v,mul(v))];
}
// Perpendicular line through a normalized 3D Gaussian; integral = mass/2pi/sigma².
export const centreOpticalDepth = (mass, projectedArea, opacity) => opacity*mass/(2*Math.PI*projectedArea);
