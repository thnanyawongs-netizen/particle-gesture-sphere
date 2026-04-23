# Particle Gesture Sphere Technical Notes

This document explains how the project works and how someone else can pick it up without local context.

## Overview

The experience is a browser-based real-time interaction pipeline:

`webcam -> hand landmarks -> gesture interpretation -> particle state update -> WebGL render`

The page uses a live camera feed as the background, tracks a single hand with MediaPipe, and drives a glowing particle sphere rendered in Three.js.

## Core Stack

### Webcam Input

- `navigator.mediaDevices.getUserMedia`
- supplies the live video stream used as the background layer

### Hand Tracking

- `MediaPipe Tasks Vision`
- specifically `HandLandmarker`
- returns 21 hand landmarks per frame

These landmarks are used to derive:

- open-palm confidence
- fist confidence
- index-finger visibility and movement
- swipe direction and speed

### Particle Rendering

- `Three.js`
- `THREE.Points`
- additive blended soft circular particles

The sphere is not a model or texture. It is generated as a large point cloud and updated every animation frame.

## Project Files

- `index.html`
  - page structure
  - webcam layer
  - WebGL canvas
  - gesture overlay canvas
  - start UI and status text

- `styles.css`
  - visual presentation
  - glass panels
  - camera tint
  - fullscreen layout

- `main.js`
  - scene, camera, lights, renderer
  - particle generation
  - hand tracking
  - gesture interpretation
  - animation loop

## Gesture Mapping

### Open Palm

Raises the explosion target and pushes particles outward from their base positions.

### Fist

Lowers the explosion target, reforms the sphere, and maps hand position to the sphere's target location.

### Index Finger Motion

Adds rotational velocity to the sphere.

### Fast Left Swipe

Adds a full-turn orbit target so the sphere performs a smooth complete spin.

## Particle System Design

The project keeps several arrays in memory:

- `positions`
- `baseTargets`
- `velocities`
- `driftVectors`
- `explodeVectors`
- `colors`

This makes it possible to treat the sphere as a dynamic system instead of a static object.

### Sphere Generation

The sphere uses a near-even distribution based on a Fibonacci sphere approach, then adds small surface variation so it feels organic instead of mathematically perfect.

### Motion Model

The animation is intentionally smoothed. The code does not jump directly from one gesture state to another. Instead it interpolates toward targets such as:

- `targetExplosion`
- `targetSpinVelocityX`
- `targetSpinVelocityY`
- `targetFieldX`
- `targetFieldY`
- `targetOrbitTurnY`

This is what gives the interaction inertia, damping, and follow-through.

## Why It Feels Responsive

The visual quality comes from two layers working together:

1. gesture recognition
2. motion easing and damping

Without the second layer, the piece would feel binary and mechanical. With interpolation, decay, and velocity carry-over, it feels more physical.

## Running the Project

From the project root:

```bash
python3 -m http.server 4010
```

Open:

```text
http://localhost:4010
```

Recommended browser:

- Google Chrome

## Environment Notes

- Webcam access requires `localhost` or HTTPS
- Embedded browsers may cache aggressively or block camera APIs
- Chrome is recommended for the smoothest testing flow

## Most Important Tuning Parameters

If someone wants to restyle the piece, these are the first places to look:

- `PARTICLE_COUNT`
- `mainMaterial.size`
- `glowMaterial.size`
- `glowMaterial.opacity`
- `targetExplosion`
- `targetFieldX`
- `targetFieldY`
- `targetOrbitTurnY`

## Codex Context

This project was developed through iterative collaboration with **OpenAI Codex**. That matters because the implementation reflects a workflow that mixed:

- visual direction
- interaction design
- debugging
- refinement
- packaging for GitHub

So this repository is not just a Three.js demo. It is also a concrete example of an AI-assisted creative coding workflow.

## Good Next Improvements

- stronger post-processing and glow
- more volumetric sphere depth
- dual-hand controls
- shader-driven particle behavior
- a hosted live demo and short recording
