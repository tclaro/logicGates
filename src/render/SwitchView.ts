import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import type { Bit } from '../core/types';
import { SWITCH_H, SWITCH_PIN_Y, SWITCH_W, SWITCH_Y } from '../layout/geometry';
import type { GameTextures } from './assets';
import { PALETTE } from './palette';

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Chave 0/1 no rodapé da placa: tecla com LED e dígito grande. */
export class SwitchView extends Container {
  private readonly led = new Graphics();
  private readonly ledGlow: Sprite;
  private readonly digit: Text;
  private readonly cap = new Container();
  private readonly sprite0: Sprite | null = null;
  private readonly sprite1: Sprite | null = null;
  private press = 0;
  private value: Bit = 0;

  constructor(
    readonly inputId: string,
    textures: GameTextures,
  ) {
    super();
    const w = SWITCH_W;
    const h = SWITCH_H;

    const legs = new Graphics();
    // Haste de solda ligando a tecla ao pad da trilha.
    legs.moveTo(0, SWITCH_PIN_Y - SWITCH_Y).lineTo(0, -h / 2).stroke({ width: 7, color: PALETTE.copperDark });
    legs.moveTo(0, SWITCH_PIN_Y - SWITCH_Y).lineTo(0, -h / 2).stroke({ width: 3, color: PALETTE.copperLight, alpha: 0.6 });

    const shadow = new Graphics().roundRect(-w / 2 + 4, -h / 2 + 7, w, h, 16).fill({ color: 0x000000, alpha: 0.45 });
    this.addChild(legs, shadow, this.cap);

    if (textures.switch0 && textures.switch1) {
      const make = (t: typeof textures.switch0) => {
        const s = new Sprite(t!);
        s.anchor.set(0.5);
        s.scale.set(Math.min((w + 30) / t!.width, (h + 30) / t!.height));
        return s;
      };
      this.sprite0 = make(textures.switch0);
      this.sprite1 = make(textures.switch1);
      this.cap.addChild(this.sprite0, this.sprite1);
    } else {
      const body = new Graphics();
      body.roundRect(-w / 2, -h / 2, w, h, 16).fill({ color: PALETTE.switchBody });
      body.roundRect(-w / 2, -h / 2, w, h, 16).stroke({ width: 3, color: PALETTE.switchEdge });
      body.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 11).stroke({ width: 2, color: 0x000000, alpha: 0.6 });
      body.roundRect(-w / 2 + 9, -h / 2 + 9, w - 18, 6, 3).fill({ color: 0xffffff, alpha: 0.08 });
      this.cap.addChild(body);
    }

    this.ledGlow = new Sprite(textures.glow);
    this.ledGlow.anchor.set(0.5);
    this.ledGlow.tint = PALETTE.energyGlow;
    this.ledGlow.blendMode = 'add';
    this.ledGlow.scale.set(1.1, 0.55);
    this.ledGlow.position.set(0, -h / 2 + 20);
    this.digit = new Text({
      text: '0',
      style: { fontFamily: FONT, fontSize: 66, fontWeight: '700', fill: 0xffffff },
      resolution: 3,
    });
    this.digit.anchor.set(0.5);
    this.digit.position.set(0, 10);
    this.cap.addChild(this.led, this.ledGlow, this.digit);

    this.position.set(0, SWITCH_Y);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-w / 2 - 14, -h / 2 - 24, w + 28, h + 40);
  }

  setValue(value: Bit, animate = true): void {
    this.value = value;
    if (animate) this.press = 1;
    const on = value === 1;
    this.digit.text = on ? '1' : '0';
    this.digit.style.fill = on ? PALETTE.energyCore : 0xe9ecec;
    this.led.clear();
    this.led.roundRect(-24, -SWITCH_H / 2 + 15, 48, 10, 5).fill({ color: on ? PALETTE.energyCore : PALETTE.switchLedOff });
    this.ledGlow.alpha = on ? 0.9 : 0;
    if (this.sprite0 && this.sprite1) {
      this.sprite0.visible = !on;
      this.sprite1.visible = on;
    }
  }

  /** Fase de montagem: a chave não responde ao toque. */
  setFixed(): void {
    this.eventMode = 'none';
    this.cursor = 'default';
  }

  /** Selo de relógio no canto: esta chave alterna sozinha quando a energia é ligada. */
  markClock(): void {
    const badge = new Graphics();
    const x = SWITCH_W / 2 - 2;
    const y = -SWITCH_H / 2 + 2;
    badge.circle(x, y, 22).fill({ color: PALETTE.lampWarm }).stroke({ width: 4, color: PALETTE.copperShadow });
    badge.moveTo(x, y).lineTo(x, y - 12).moveTo(x, y).lineTo(x + 9, y + 5).stroke({ width: 4, color: PALETTE.copperShadow, cap: 'round' });
    this.addChild(badge);
  }

  get current(): Bit {
    return this.value;
  }

  update(dt: number): void {
    if (this.press <= 0) return;
    this.press = Math.max(0, this.press - dt * 7);
    const s = 1 - Math.sin(this.press * Math.PI) * 0.08;
    this.cap.scale.set(s);
  }
}
