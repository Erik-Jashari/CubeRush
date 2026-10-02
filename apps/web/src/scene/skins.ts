import type { SkinId } from '@cuberush/api';
import type { Face } from '@cuberush/cube-core';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { STICKER_COLORS } from './colors';

export interface SkinLook {
  body: string;
  bodyRoughness: number;
  bodyMetalness: number;
  /** Procedural texture for the body, if any. */
  bodyTexture?: 'wood';
  stickers: Readonly<Record<Face, string>>;
  stickerRoughness: number;
  /** How much the stickers glow in their own color (neon). */
  glow: number;
}

export const SKIN_LOOKS: Readonly<Record<SkinId, SkinLook>> = {
  classic: {
    body: '#111216',
    bodyRoughness: 0.55,
    bodyMetalness: 0,
    stickers: STICKER_COLORS,
    stickerRoughness: 0.35,
    glow: 0,
  },
  pastel: {
    body: '#f1ece4',
    bodyRoughness: 0.7,
    bodyMetalness: 0,
    stickers: {
      U: '#ffffff',
      D: '#ffe7a0',
      F: '#a6e3c1',
      B: '#a8c5f3',
      R: '#f5a6b7',
      L: '#ffc8a0',
    },
    stickerRoughness: 0.6,
    glow: 0,
  },
  neon: {
    body: '#07070c',
    bodyRoughness: 0.25,
    bodyMetalness: 0.6,
    stickers: {
      U: '#e8eeff',
      D: '#fff200',
      F: '#00ff9c',
      B: '#00b3ff',
      R: '#ff2d6f',
      L: '#ff8a00',
    },
    stickerRoughness: 0.2,
    glow: 0.65,
  },
  wood: {
    body: '#8a5a2e',
    bodyRoughness: 0.8,
    bodyMetalness: 0,
    bodyTexture: 'wood',
    stickers: {
      U: '#efe6d2',
      D: '#e0b648',
      F: '#4f8a4b',
      B: '#3d5f8f',
      R: '#a8423a',
      L: '#c9772f',
    },
    stickerRoughness: 0.75,
    glow: 0,
  },
};

let woodTexture: Texture | null = null;

/** Wavy grain lines drawn once on a canvas, shared by every wooden cubie. */
export function getWoodTexture(): Texture {
  if (woodTexture) return woodTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    const y = (i / 46) * 256;
    ctx.strokeStyle = `rgba(70, 40, 15, ${0.12 + ((i * 37) % 10) / 40})`;
    ctx.lineWidth = 1 + ((i * 13) % 3);
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 8) {
      const wave = Math.sin(x / 40 + i * 0.7) * 3 + Math.sin(x / 13 + i) * 1.2;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  woodTexture = texture;
  return texture;
}
