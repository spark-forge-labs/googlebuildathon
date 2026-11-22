/**
 * Quality tiers. Phones get a lighter setting automatically so tilt-steering stays smooth.
 * Override with ?quality=high or ?quality=low in the URL.
 */
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const forced = params.get('quality');

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
const shortSide = typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : 1080;
const isPhone = /Android|iPhone|iPod|Mobile/i.test(ua) || (touch && shortSide < 820);

export const QUALITY_TIER = forced === 'high' || forced === 'low' ? forced : isPhone ? 'low' : 'high';

export const Q =
  QUALITY_TIER === 'low'
    ? {
        tier: 'low',
        pixelRatio: Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 1.5),
        shadowMapSize: 2048,
        heroTrees: 34,
        impostorTrees: 260,
        buildings: 170,
        treeShadows: false,
        post: false,
        antialias: true,
        carLite: true,
      }
    : {
        tier: 'high',
        pixelRatio: Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2),
        shadowMapSize: 4096,
        heroTrees: 110,
        impostorTrees: 650,
        buildings: 340,
        treeShadows: true,
        post: true,
        antialias: false, // SMAA in the post chain instead
        carLite: false,
      };
