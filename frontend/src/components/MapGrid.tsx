import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { io } from 'socket.io-client';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const socket = io(API_URL, { withCredentials: true });
(window as any).__chaosSocket = socket;
interface MapGridProps {
  tileSize?: number;
  selectedTool: string;
  onStateUpdate: (state: any) => void;
  gameId?: string;   
  userId?: string;
}
const TEXTURES: Record<number, string | null> = {
  0: null, 
  1: '/farm.png',
  2: '/city.png',
  3: '/industrial.png',
  4: '/road.png',
  5: '/power.png',
  6: '/skyscraper.png',
  7: '/industrial.png', 
  8: null, 
  9: '/park.png' 
};
class TileObject {
  public x: number;
  public y: number;
  public size: number;
  public container: PIXI.Container;
  public bgGraphics: PIXI.Graphics;
  public sprite: PIXI.Sprite | null = null;
  private type: number = -1;
  public targetScale: number = 1;
  public currentScale: number = 1;
  public scaleVelocity: number = 0;
  constructor(
    x: number,
    y: number,
    size: number
  ) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.container = new PIXI.Container();
    this.container.x = x * size + size / 2;
    this.container.y = y * size + size / 2;
    this.bgGraphics = new PIXI.Graphics();
    this.container.addChild(this.bgGraphics);
  }
  public setType(newType: number) {
    if (this.type === newType) return;
    this.type = newType;
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
    this.drawBg();
    const texturePath = TEXTURES[this.type];
    if (texturePath) {
      const texture = PIXI.Texture.from(texturePath);
      this.sprite = new PIXI.Sprite(texture);
      this.sprite.anchor.set(0.5);
      if (this.type === 7) {
         this.sprite.tint = 0x555555; 
      }
      this.sprite.width = this.size;
      this.sprite.height = this.size;
      this.container.addChild(this.sprite);
    }
  }
  private drawBg() {
    this.bgGraphics.clear();
    const s = this.size;
    if (this.type !== -1 && this.type !== 8) {
       this.bgGraphics.rect(-s/2, -s/2, s, s);
       this.bgGraphics.fill({ color: 0x6a9e3a, alpha: 1 }); 
    }
  }
  public update(dt: number, time: number) {
    const springForce = (this.targetScale - this.currentScale) * 0.1 * dt;
    this.scaleVelocity += springForce;
    this.scaleVelocity *= 0.8; 
    this.currentScale += this.scaleVelocity;
    if (this.targetScale < 1 && this.currentScale < 0.6) {
       this.targetScale = 1;
    }
    this.container.scale.set(Math.max(0, this.currentScale));
    let alphaTarget = 1;
    if (this.type > 0 && this.type !== 8) {
      const offset = (this.x * 0.1) + (this.y * 0.1);
      alphaTarget = Math.sin(time * 0.05 + offset) * 0.05 + 0.95; 
    }
    this.container.alpha = alphaTarget;
  }
}
export default function MapGrid({ tileSize = 80, selectedTool, onStateUpdate, gameId, userId }: MapGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef(selectedTool);
  toolRef.current = selectedTool;
  const stateUpdateRef = useRef(onStateUpdate);
  stateUpdateRef.current = onStateUpdate;
  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const gridStateRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!containerRef.current) return;
    let isActive = true;
    let isInitComplete = false;
    const app = new PIXI.Application();
    let viewport: Viewport;
    let activeTiles: Record<string, TileObject> = {};
    let time = 0; 
    const init = async () => {
      await PIXI.Assets.load(['/farm.png', '/city.png', '/industrial.png', '/road.png', '/power.png', '/skyscraper.png', '/forest.png', '/park.png', '/car.png']);
      const parentProps = containerRef.current!.getBoundingClientRect();
      await app.init({
        width: parentProps.width,
        height: parentProps.height,
        backgroundColor: 0x5a7e32, 
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (!isActive || !containerRef.current) {
        app.destroy(true, { children: true });
        return;
      }
      containerRef.current.appendChild(app.canvas);
      const worldWidth = 40000;
      const worldHeight = 40000;
      viewport = new Viewport({
        screenWidth: parentProps.width,
        screenHeight: parentProps.height,
        worldWidth,
        worldHeight,
        events: app.renderer.events
      });
      app.stage.addChild(viewport);
      viewport
          .drag({ mouseButtons: 'all' }) 
          .pinch()
          .wheel({ percent: 0.1, smooth: 10 })
          .decelerate()
          .clampZoom({ minWidth: 500, maxWidth: 8000 });
      viewport.moveCenter(0, 0);
      const board = new PIXI.Container();
      viewport.addChild(board);
      const forestTexture = PIXI.Texture.from("/forest.png");
      const tilingForest = new PIXI.TilingSprite({
         texture: forestTexture,
         width: worldWidth,
         height: worldHeight
      });
      tilingForest.anchor.set(0.5);
      tilingForest.tileScale.set(tileSize / forestTexture.width);
      board.addChild(tilingForest);
      app.stage.eventMode = 'static';
      app.stage.hitArea = new PIXI.Rectangle(0, 0, parentProps.width, parentProps.height);
      let pointerDownPos = { x: 0, y: 0 };
      app.stage.on('pointerdown', (e) => {
         pointerDownPos = { x: e.global.x, y: e.global.y };
      });
      app.stage.on('pointerup', (e) => {
         if (e.button === 2 || e.data?.button === 2) return;
         const dx = Math.abs(e.global.x - pointerDownPos.x);
         const dy = Math.abs(e.global.y - pointerDownPos.y);
         if (dx > 5 || dy > 5) return; 
         const worldPos = viewport.toWorld(e.global);
         const gridX = Math.floor(worldPos.x / tileSize);
         const gridY = Math.floor(worldPos.y / tileSize);
         const key = `${gridX},${gridY}`;
         if (activeTiles[key]) activeTiles[key].targetScale = 0.5;
         socket.emit('action', {
           action: 'BUILD',
           type: toolRef.current,
           x: gridX,
           y: gridY,
           gameId: gameIdRef.current,
           userId: userIdRef.current,
         });
      });
      if (gameIdRef.current && userIdRef.current) {
        socket.emit('loadGame', { gameId: gameIdRef.current, userId: userIdRef.current });
      }
      const cellsContainer = new PIXI.Container();
      board.addChild(cellsContainer);
      socket.on('stateUpdate', (state) => {
        gridStateRef.current = state.grid;
        stateUpdateRef.current(state);
        const grid = state.grid;
        if (!grid) return;
        for (const key of Object.keys(activeTiles)) {
          const val = grid[key];
          if (val === undefined || val === null || val === 8) {
            cellsContainer.removeChild(activeTiles[key].container);
            activeTiles[key].container.destroy({ children: true });
            delete activeTiles[key];
          }
        }
        for (const key of Object.keys(grid)) {
           const val = grid[key];
           if (val === undefined || val === null || val === 8) continue; 
           if (!activeTiles[key]) {
              const [sx, sy] = key.split(',');
              const tile = new TileObject(parseInt(sx), parseInt(sy), tileSize);
              tile.currentScale = 0; 
              cellsContainer.addChild(tile.container);
              activeTiles[key] = tile;
           }
           activeTiles[key].setType(val);
        }
      });
      const cloudContainer = new PIXI.Container();
      viewport.addChild(cloudContainer);
      const clouds: {sprite: PIXI.Graphics, speed: number, x: number}[] = [];
      for(let i=0; i<200; i++) {
         const cl = new PIXI.Graphics();
         const numPuffs = 4 + Math.floor(Math.random() * 4);
         const baseRad = 150 + Math.random() * 200;
         for(let p=0; p<numPuffs; p++) {
            const rad = baseRad * (0.5 + Math.random() * 0.8);
            const px = (Math.random() - 0.5) * baseRad * 2.5;
            const py = (Math.random() - 0.5) * baseRad * 1.0;
            cl.circle(px, py, rad);
         }
         cl.fill({ color: 0xffffff, alpha: 0.15 });
         cl.y = (Math.random() - 0.5) * worldHeight;
         const initialX = (Math.random() - 0.5) * worldWidth;
         cl.x = initialX;
         cloudContainer.addChild(cl);
         clouds.push({ sprite: cl, speed: 0.5 + Math.random() * 1.5, x: initialX });
      }
      const trafficContainer = new PIXI.Container();
      board.addChild(trafficContainer);
      const cars: {
        sprite: PIXI.Sprite;
        gridX: number; gridY: number;
        targetX: number; targetY: number;
        progress: number;
        lastDx: number; lastDy: number; 
      }[] = [];
      const carTex = PIXI.Texture.from('/car.png');
      for(let i=0; i<8; i++) {
         const car = new PIXI.Sprite(carTex);
         car.anchor.set(0.5);
         car.scale.set(0.04);
         car.alpha = 0;
         trafficContainer.addChild(car);
         cars.push({ sprite: car, gridX: -1, gridY: -1, targetX: -1, targetY: -1, progress: 0, lastDx: 0, lastDy: -1 });
      }
      app.ticker.add((ticker) => {
        const dt = ticker.deltaTime;
        time += dt;
        clouds.forEach(c => {
           c.x += c.speed * dt;
           if (c.x > worldWidth/2) c.x = -worldWidth/2;
           c.sprite.x = c.x;
        });
        const grid = gridStateRef.current;
        if (grid) {
           const roadKeys = Object.keys(grid).filter(k => grid[k] === 4);
           if (roadKeys.length === 0) {
              cars.forEach(car => { car.gridX = -1; car.sprite.alpha = 0; });
           } else {
              const occupiedGrid = new Set(cars.filter(c => c.gridX >= 0).map(c => `${c.gridX},${c.gridY}`));
              cars.forEach(car => {
                 if (car.gridX < 0) {
                    if (Math.random() > 0.02) return;
                    const availableRoads = roadKeys.filter(k => !occupiedGrid.has(k));
                    if (availableRoads.length === 0) return;
                    const randomKey = availableRoads[Math.floor(Math.random() * availableRoads.length)];
                    const [sx, sy] = randomKey.split(',').map(Number);
                    const dirs = [[0,1], [1,0], [0,-1], [-1,0]];
                    const validStartDirs = dirs.filter(d => grid[`${sx+d[0]},${sy+d[1]}`] === 4);
                    if (validStartDirs.length === 0) return;
                 const startDir = validStartDirs[Math.floor(Math.random() * validStartDirs.length)];
                 car.gridX = sx; car.gridY = sy;
                 car.targetX = sx + startDir[0]; 
                 car.targetY = sy + startDir[1];
                 car.lastDx = startDir[0];
                 car.lastDy = startDir[1];
                 car.progress = 0;
                 const offsetX = car.lastDy !== 0 ? (car.lastDy * -1) * (tileSize/5) : 0;
                 const offsetY = car.lastDx !== 0 ? car.lastDx * (tileSize/5) : 0;
                 car.sprite.x = sx * tileSize + tileSize/2 + offsetX;
                 car.sprite.y = sy * tileSize + tileSize/2 + offsetY;
                 car.sprite.alpha = 1;
                 if (car.lastDy < 0) car.sprite.rotation = 0;
                 else if (car.lastDy > 0) car.sprite.rotation = Math.PI;
                 else if (car.lastDx > 0) car.sprite.rotation = Math.PI / 2;
                 else if (car.lastDx < 0) car.sprite.rotation = -Math.PI / 2;
              } else {
                 const targetKey = `${car.targetX},${car.targetY}`;
                 if (grid[targetKey] !== 4 && car.progress < 1) { 
                    car.gridX = -1; car.sprite.alpha = 0; return;
                 }
                 if (car.progress < 1) {
                    car.progress += 0.012 * dt;
                    if (car.progress > 1) car.progress = 1;
                    const offsetX = car.lastDy !== 0 ? (car.lastDy * -1) * (tileSize/5) : 0;
                    const offsetY = car.lastDx !== 0 ? car.lastDx * (tileSize/5) : 0;
                    const startX = car.gridX * tileSize + tileSize/2 + offsetX;
                    const startY = car.gridY * tileSize + tileSize/2 + offsetY;
                    const endX = car.targetX * tileSize + tileSize/2 + offsetX;
                    const endY = car.targetY * tileSize + tileSize/2 + offsetY;
                    car.sprite.x = startX * (1 - car.progress) + endX * car.progress;
                    car.sprite.y = startY * (1 - car.progress) + endY * car.progress;
                 } else {
                    car.gridX = car.targetX; 
                    car.gridY = car.targetY;
                    const dirs = [[0,1], [1,0], [0,-1], [-1,0]];
                    const valid = dirs.map(d => ({x: car.gridX + d[0], y: car.gridY + d[1], dx: d[0], dy: d[1]}))
                                      .filter(n => grid[`${n.x},${n.y}`] === 4);
                    if (valid.length > 0) {
                       const straight = valid.find(n => n.dx === car.lastDx && n.dy === car.lastDy);
                       let next;
                       if (straight && Math.random() < 0.65) {
                          next = straight;
                       } else {
                          const turns = valid.filter(n => !(n.dx === -car.lastDx && n.dy === -car.lastDy));
                          next = turns.length > 0
                            ? turns[Math.floor(Math.random() * turns.length)]
                            : valid[Math.floor(Math.random() * valid.length)];
                       }
                       car.lastDx = next.dx;
                       car.lastDy = next.dy;
                       car.targetX = next.x; car.targetY = next.y;
                       car.progress = 0;
                       if (next.dy < 0) car.sprite.rotation = 0;
                       else if (next.dy > 0) car.sprite.rotation = Math.PI;
                       else if (next.dx > 0) car.sprite.rotation = Math.PI / 2;
                       else if (next.dx < 0) car.sprite.rotation = -Math.PI / 2;
                     } else {
                        car.lastDx = -car.lastDx;
                        car.lastDy = -car.lastDy;
                        car.targetX = car.gridX + car.lastDx;
                        car.targetY = car.gridY + car.lastDy;
                        car.progress = 0;
                        if (car.lastDy < 0) car.sprite.rotation = 0;
                        else if (car.lastDy > 0) car.sprite.rotation = Math.PI;
                        else if (car.lastDx > 0) car.sprite.rotation = Math.PI / 2;
                        else if (car.lastDx < 0) car.sprite.rotation = -Math.PI / 2;
                     }
                  }
               }
            });
         }
      }
        Object.values(activeTiles).forEach(tile => tile.update(dt, time));
      });
      isInitComplete = true;
    };
    init();
    return () => {
      isActive = false;
      if (isInitComplete) {
        app.destroy(true, { children: true });
      }
    };
  }, [tileSize]); 
  useEffect(() => {
    (window as any).socket = socket;
  }, []);
  return <div ref={containerRef} className="w-full h-full cursor-crosshair"></div>;
}
