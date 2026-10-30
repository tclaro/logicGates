import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { LAMP_PIN_Y, LAMP_SIZE, LAMP_Y } from '../layout/geometry';
import type { GameTextures } from './assets';
import { PALETTE } from './palette';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

/** Lâmpada de saída com auréola, raios girando e explosão de partículas na vitória. */
export class LampView extends Container {
  private readonly bulbOff: Sprite;
  private readonly bulbOn: Sprite;
  private readonly halo: Sprite;
  private readonly rays = new Graphics();
  private readonly burst = new Container();
  private readonly particles: Particle[] = [];
  private level = 0;
  private target = 0;
  private time = 0;

  constructor(private readonly textures: GameTextures) {
    super();
    const socket = new Graphics();
    // Base de montagem serigrafada.
    socket.roundRect(-92, 52, 184, LAMP_PIN_Y - LAMP_Y - 52 + 6, 18).fill({ color: PALETTE.gateFill, alpha: 0.85 });
    socket.roundRect(-92, 52, 184, LAMP_PIN_Y - LAMP_Y - 52 + 6, 18).stroke({ width: 4, color: PALETTE.silkscreen, alpha: 0.75 });
    for (const x of [-70, 70]) socket.circle(x, 98, 7).fill({ color: PALETTE.padRing }).circle(x, 98, 3).fill({ color: PALETTE.padHole });

    this.halo = new Sprite(textures.glow);
    this.halo.anchor.set(0.5);
    this.halo.tint = PALETTE.lampWarm;
    this.halo.scale.set(4.6);
    this.halo.alpha = 0;
    this.halo.blendMode = 'add';
    this.halo.position.set(0, -25);

    this.rays.blendMode = 'add';
    this.rays.position.set(0, -25);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const spread = 0.09;
      this.rays
        .moveTo(Math.cos(a - spread) * 70, Math.sin(a - spread) * 70)
        .lineTo(Math.cos(a) * 200, Math.sin(a) * 200)
        .lineTo(Math.cos(a + spread) * 70, Math.sin(a + spread) * 70)
        .closePath()
        .fill({ color: PALETTE.lampWarm, alpha: 0.35 });
    }
    this.rays.alpha = 0;

    this.bulbOff = this.makeBulb(textures.lampOff);
    this.bulbOn = this.makeBulb(textures.lampOn);
    this.bulbOn.alpha = 0;
    this.burst.blendMode = 'add';
    this.addChild(socket, this.rays, this.halo, this.bulbOff, this.bulbOn, this.burst);
    this.position.set(0, LAMP_Y);
  }

  private makeBulb(texture: Texture): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5, 0.5);
    const scale = LAMP_SIZE / Math.max(texture.width, texture.height);
    s.scale.set(scale);
    s.position.set(0, -6);
    return s;
  }

  setOn(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  celebrate(): void {
    for (let i = 0; i < 70; i++) {
      const sprite = new Sprite(this.textures.glow);
      sprite.anchor.set(0.5);
      sprite.tint = i % 3 === 0 ? PALETTE.energyCore : PALETTE.lampWarm;
      const a = Math.random() * Math.PI * 2;
      const speed = 220 + Math.random() * 520;
      const max = 0.9 + Math.random() * 0.9;
      sprite.position.set(0, -25);
      sprite.scale.set(0.15 + Math.random() * 0.25);
      this.burst.addChild(sprite);
      this.particles.push({ sprite, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 150, life: max, max });
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.level !== this.target) {
      const step = dt * 5;
      this.level = this.target > this.level ? Math.min(1, this.level + step) : Math.max(0, this.level - step);
    }
    const flicker = this.level > 0 ? 0.94 + 0.06 * Math.sin(this.time * 23) * Math.sin(this.time * 7) : 1;
    this.bulbOn.alpha = this.level;
    this.bulbOff.alpha = 1 - this.level * 0.85;
    this.halo.alpha = this.level * 0.85 * flicker;
    this.halo.scale.set(4.4 + Math.sin(this.time * 2.2) * 0.25);
    this.rays.alpha = this.level * flicker;
    this.rays.rotation += dt * 0.25;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 520 * dt;
      p.vx *= 1 - dt * 0.8;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.alpha = p.life / p.max;
    }
  }
}
