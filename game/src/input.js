// Keyboard + mouse input with edge detection (pressed this frame) and
// canvas-space mouse coordinates, so menus and steering share one source.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();       // keys held right now (event.code)
    this.pressed = new Set();    // keys pressed since last update()
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.anyGesture = false;     // first key/mouse press (unlocks audio)

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.anyGesture = true;
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.down = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
      this.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.clicked = true;
      this.anyGesture = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Steering vector from WASD / arrows, normalised. Zero when idle.
  steerVector() {
    let x = 0;
    let y = 0;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y -= 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  isDown(code) {
    return this.down.has(code);
  }

  // True only on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // True only on the frame the mouse button went down.
  wasClicked() {
    return this.mouse.clicked;
  }

  pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  // Call once per frame, after the game has read this frame's edges.
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }
}
