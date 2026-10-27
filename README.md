# House of Echoes — 3D Stealth Horror

A playable first-person browser horror prototype built with HTML, CSS, JavaScript and Three.js. It is an original house-escape game inspired by stealth-horror mechanics, not a recreation of any existing game's proprietary map or character.

## Project files

- `index.html` — game UI and Three.js import map
- `styles.css` — responsive HUD, title screen, and touch controls
- `game.js` — 3D scene, house layout, navigation, AI, input, items, and audio

## Run it

The game uses browser ES modules, so serve the folder over HTTP instead of double-clicking `index.html`.

### Option A — Python (recommended)

1. Install Python 3 if you do not have it.
2. Open a terminal in this folder.
3. Run:

   ```bash
   python -m http.server 8080
   ```

4. Visit **http://localhost:8080** in a modern browser.

On Windows, you can double-click `start_windows.bat` instead.

## Controls

- **W A S D** — move
- **Mouse** — look around
- **Shift** — sprint (uses stamina and creates more noise)
- **C** — crouch and move more quietly
- **E** — collect items, use the front door, or hide/leave a wardrobe
- **F** — flashlight on/off
- **Esc** — pause
- **Touch devices** — drag the view to look; use the virtual joystick and action buttons

## Objective

Find the **brass exit key** in the bedroom and the **bolt cutters** in the storage room. Use both at the front door, open it, then walk outside. The enemy can investigate noise, detect you if it gets a clear view, patrol room-to-room, and chase with a simple grid pathfinder. Wardrobes hide you from its direct vision.

## Free 3D model and libraries

- **Three.js r186** is loaded from jsDelivr via an import map: <https://www.npmjs.com/package/three>
- **GrandmaShopper.glb** is a rigged character model from Gobkit's free asset pack. Its manifest states **CC0 1.0 / public domain dedication**, including commercial and personal use: <https://gobkit.com/freebies> and <https://gobkit.com/api/free>
- The game also has an original procedural character fallback in case the external GLB cannot load.

For convenience, this prototype hot-links the model at runtime. An internet connection is required for Three.js and the optional character model. For an offline or production release, download the model from the source and bundle the GLB with your own project, then update `ENEMY_MODEL_URL` in `index.html` to a local path.

## Notes

- The floor plan and minimap are drawn from the same wall geometry/collision rectangles, so door openings and room boundaries match the playable house.
- There is no build step or npm install required; it is a static browser project.
