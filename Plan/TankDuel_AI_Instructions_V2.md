# STRICT AI DIRECTIVES: TANK DUEL OVERHAUL 

**SYSTEM PROMPT / ROLE:**
You are an execution-only coding agent. You have zero creative liberty. You must follow the exact architectural patterns, data structures, and logic flows defined in this document to upgrade the "Simple Tank Duel" prototype. 

**GOAL:**
Implement 3 new abilities mapped to unassigned keys, separate the rendering logic from the core state machine (to prepare for future C++ backend routing), and implement exact visual/audio triggers.

---

## 1. DATA STRUCTURES & STATE MANAGEMENT
Do not invent your own variables. Use the following exact structures for the Tank entities.

```json
{
  "TankState": {
    "Position": {"x": 0.0, "y": 0.0},
    "HullRotation": 0.0,
    "TurretRotation": 0.0,
    "Velocity": {"x": 0.0, "y": 0.0},
    "BaseSpeed": 250.0,
    "Health": 100,
    "Abilities": {
      "DashCooldown": 0.0,
      "MineCooldown": 0.0,
      "SpecialFireCooldown": 0.0
    },
    "IsDashing": false
  }
}
```

## 2. INPUT MAPPING & ABILITY LOGIC (The 3 Unused Buttons)

### Ability 1: Dash / Evade (Map to Input 1 - e.g., 'Space' or 'Shift')
*   **Trigger Condition:** `if (Input1_Pressed) && (Abilities.DashCooldown <= 0)`
*   **Execution:** 
    1. Set `IsDashing = true` for 0.2 seconds.
    2. Multiply current `Velocity` by 3.0.
    3. Ignore collision with enemy projectiles while `IsDashing == true`.
    4. Set `Abilities.DashCooldown = 3.0` (seconds).
    5. Emit Event: `VFX_Dash_Trail` at current `Position`.

### Ability 2: Deploy Barricade (Map to Input 2 - e.g., 'E' or 'Q')
*   **Trigger Condition:** `if (Input2_Pressed) && (Abilities.MineCooldown <= 0)`
*   **Execution:**
    1. Instantiate a `BarricadeEntity` at `TankState.Position` minus (50 units * backwards vector).
    2. Barricade properties: Health = 50, blocks movement and projectiles.
    3. Set `Abilities.MineCooldown = 8.0` (seconds).
    4. Emit Event: `SFX_Deploy_Metal`.

### Ability 3: Ricochet Round (Map to Input 3 - e.g., 'F' or 'Right-Click')
*   **Trigger Condition:** `if (Input3_Pressed) && (Abilities.SpecialFireCooldown <= 0)`
*   **Execution:**
    1. Instantiate `ProjectileEntity`.
    2. Set `ProjectileEntity.BouncesRemaining = 2`.
    3. **Collision Logic:** On hitting a wall, reflect the velocity vector across the wall's normal: `V_new = V - 2(V * N)N`.
    4. Set `Abilities.SpecialFireCooldown = 5.0` (seconds).
    5. Emit Event: `VFX_Special_MuzzleFlash`.

---

## 3. RENDERING PIPELINE: LAYERED SPRITES
Do not use drawRect or fillRect. The tank must be rendered in two distinct layers to allow independent aiming and driving. 

**Asset Preparation (Awaiting External Input):**
The human user will provide sprite sheets rendered from Static Meshes or Animation Poses via Blender or Maya. You must configure the renderer to accept a 16-directional or 32-directional sprite array.

**Rendering Loop (Pseudo-code):**
1. Clear Canvas.
2. Draw Background Texture.
3. Calculate `HullFrame` based on `TankState.HullRotation` mapped to 0-359 degrees.
4. Draw `HullSpriteSheet[HullFrame]` at `Position`.
5. Calculate `TurretFrame` based on `TankState.TurretRotation` mapped to 0-359 degrees.
6. Draw `TurretSpriteSheet[TurretFrame]` at `Position` (offset slightly by {x: 0, y: -5} to center on hull).

---

## 4. DECOUPLED EVENT SYSTEM (VFX & AUDIO)
The core game loop must not handle rendering particles or playing sounds directly. Use an event bus. 

*   **VFX_Explosion:** When `TankState.Health <= 0`, spawn 3 layers of particles: 1 expanding white circle (alpha fades over 0.2s), 15 orange square particles (random velocity outwards, gravity applied), and 5 gray circles (smoke, expanding slowly).
*   **SFX_Shoot:** On Fire Input, play `cannon_fire.wav`. Pitch shift randomly between 0.9 and 1.1 to avoid repetitive audio fatigue.
*   **Screen Shake:** On `ProjectileEntity` hitting a Tank, translate the main camera container by random `Math.random() * 10 - 5` on X and Y axes, interpolating back to 0,0 over 0.15 seconds.
