# AI Agent Directives: Tank Duel Enhancement Project

**Project Context:**
Upgrade the current "Simple Tank Duel" prototype (a minimal 2D grid with basic geometric tanks) into a highly polished, Flash-era inspired arcade tank battler. 

**Execution Protocol:**
Utilize distinct agent modes for architectural refactoring and visual integration. Ensure all logic remains highly modular and decoupled from the immediate rendering layer. This separation of concerns is critical to allow future porting of the C++ logic to a robust 3D framework like Unreal Engine, should the project scale beyond its current scope.

---

## Phase 1: Core Mechanics & Input Expansion
The current configuration utilizes WASD and a Fire button, leaving 3 inputs unmapped. Expand the tactical depth by implementing the following abilities:

1.  **Dash / Evade (Input 1):** 
    *   Implement a quick, directional speed boost.
    *   Include a brief cooldown timer and a ghosting trail effect for visual feedback.
2.  **Deployable Mine / Barricade (Input 2):** 
    *   Allow players to drop a proximity mine or a temporary, destructible wall segment.
    *   This leans into the classic Flash tank game mechanics of manipulating the arena layout.
3.  **Special Munitions (Input 3):** 
    *   Implement a toggle for alternative fire, such as a ricocheting/bouncing projectile.
    *   Require the physics calculation to handle dynamic bouncing off screen edges and internal walls.

*Agent Task:* Refactor the input controller and player state machine to accommodate these active abilities and their respective cooldowns. Update the top UI to display cooldown readiness alongside the P1/P2 score.

---

## Phase 2: Visual Overhaul & Asset Pipeline
Transition away from basic solid-color rectangles (cyan/pink) into high-fidelity assets.

1.  **Layered Sprite Implementation:** 
    *   Separate the tank render into at least two independent layers: the Hull (rotates with movement direction) and the Turret (rotates independently to aim).
    *   Prepare the rendering loop to accept 16 or 32-directional sprite sheets. These sprite sheets will be generated externally by rendering Animation Poses or Static Meshes prepared in Maya or Blender, ensuring crisp, high-quality textures.
2.  **Dynamic Environment:** 
    *   Replace the dark, empty grid with a themed, textured battleground (e.g., a worn industrial metallic floor or desert ruins).
    *   Integrate static destructible and indestructible walls to create choke points and enable the bouncing projectile mechanics.

---

## Phase 3: Game Feel & VFX (Juice)
Implement transient visual effects to make interactions feel impactful.

1.  **Particle Systems:** Create a flexible particle emitter capable of spawning:
    *   Muzzle flashes at the tip of the turret upon firing.
    *   Continuous exhaust/smoke trails from the rear of the tanks while in motion.
    *   Sparks upon projectiles striking walls.
    *   Multi-layered explosions upon tank destruction (combining a rapid light flash, billowing smoke, and scattered debris).
2.  **Camera Effects:** 
    *   Implement programmatic screen shake tied to heavy projectile impacts and player deaths.

*Agent Task:* Build a standalone `VFXManager` that listens to game events and triggers visual feedback without interrupting the core game loop.

---

## Phase 4: Audio Engineering
Implement an audio manager with spatial awareness or stereo panning to match the visual upgrades.

1.  **Sound Effects (SFX):** 
    *   Layered sound design: looping mechanical tank treads (pitch-shifted based on movement speed), a heavy punchy cannon fire, metallic ricochets, and bass-heavy explosions.
2.  **Background Music (BGM):** 
    *   Integrate an aggressive, looping arcade battle track.

*Agent Task:* Implement an audio pipeline that supports overlapping channels and volume ducking (briefly lowering BGM volume during loud explosions) to ensure a clean audio mix.
