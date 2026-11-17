import instagram from './instagram.js';
import youtube from './youtube.js';
import tiktok from './tiktok.js';
import { HttpError } from '../core.js';

export const PLATFORMS = { instagram, youtube, tiktok };
export const PLATFORM_IDS = Object.keys(PLATFORMS);

export function platform(id) {
  const p = PLATFORMS[id];
  if (!p) throw new HttpError(400, `Unknown platform "${id}".`);
  return p;
}

export const KIND_LABEL = { image: 'Post', carousel: 'Carousel', reel: 'Reel', story: 'Story', short: 'Short', video: 'Video' };
