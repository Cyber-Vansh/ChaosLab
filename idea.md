# ChaosLab

## 1. Project Overview

ChaosLab is a backend-driven simulation engine for designing virtual worlds that evolve dynamically over time. The application features a persistent MongoDB integration and runs a strict server-authoritative simulation loop.

## 2. Core Features

### World & Simulation

- **Tile-Based Map**: Users construct dynamic cities on an orthogonal geometric grid with specialized infrastructure biomes.
- **Economic Loop**: Real-time taxation, pollution tracking, grid scaling, population fulfillment, and capacity limits.
- **Strategy Engine**: Individual infrastructure blocks resolve using scalable Strategy architectures instead of fixed monolithic logic.
- **Determinism**: Client actions and backend server processes evaluate homogeneously and broadcast via WebSocket state pushing.

### Frontend Interactions

- **PixiJS Architecture**: Rendering occurs through PixiJS and `pixi-viewport` for infinite scaling, zooming, panning, and performant asset loading.
- **Web UI & Auth**: React elements provide the HUD while Passport provides Google OAuth sessions.

## 3. Technical Architecture

### Backend (Node.js + TS + MongoDB)

- **Simulation Engine**: Tracks multi-world instances dynamically. Handles tick scheduling and strategy assignments.
- **Communication**: Socket.io for instantaneous bidirectional streaming.

### Frontend (React + Vite + PixiJS)

- **MapGrid**: Subscribes to the backend socket, handles interpolation rendering, coordinates physical road networks, controls entity asset spawning, and handles right-offset driving logic.

### Data Model

1.  **Users**: Stores Google ID metadata and embedded arrays of Save instances.
2.  **SavedGames**: Encapsulates grid data, resources, time intervals, and world states nested into the core User Mongoose Document.
