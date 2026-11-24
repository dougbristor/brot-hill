// Dust is a smaller isotropic footprint; centres stay fixed, mass remains explicit.
import {isotropic} from '../gaussian_splat/v1.js';
export const DUST_WIDTH=.16;
export const dustCovariance = spacing => isotropic(spacing,DUST_WIDTH);
export function dustRecord(point,spacing) {
  if(point.length!==3||!point.every(Number.isFinite))throw Error('Finite dust point required');
  return {position:[...point],covariance:dustCovariance(spacing),mass:spacing**3};
}
