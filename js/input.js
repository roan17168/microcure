// ============================================
// Input — Keyboard + Mouse
// ============================================

const Input = {
  bind() {
    document.addEventListener('keydown', (e) => {
      Game.keys[e.code] = true;
      if (!Game.running) return;
      if (e.code === 'KeyR') Player.reload();
      if (e.code === 'KeyG') Projectiles.throwGrenade();
      if (e.code === 'KeyF') Player.activateShield();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') Player.dash();
      if (e.code === 'Digit1') Player.switchWeapon(0);
      if (e.code === 'Digit2') Player.switchWeapon(1);
      if (e.code === 'Digit3') Player.switchWeapon(2);
    });

    document.addEventListener('keyup', (e) => {
      Game.keys[e.code] = false;
    });

    const canvas = Game.canvas;
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      Game.mouse.x = (e.clientX - rect.left) * (Game.W / rect.width);
      Game.mouse.y = (e.clientY - rect.top) * (Game.H / rect.height);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && Game.running) {
        const w = Game.weapons[Game.player.weaponIndex];
        if (w && w.canCharge) {
          Game.player.isCharging = true;
        } else {
          Player.shoot();
          Game.mouse.down = true;
        }
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0 && Game.running) {
        if (Game.player.isCharging) {
          Player.shoot();
          Game.player.isCharging = false;
          Game.player.chargeLevel = 0;
        }
        Game.mouse.down = false;
      }
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },
};
