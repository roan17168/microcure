// ============================================
// Organs — Environment Generation
// Each organ has unique obstacles, hazards, decorations.
// ============================================

const Organs = {
  load(organName) {
    // Reset world entities
    Game.obstacles = [];
    Game.hazards = [];
    Game.decorations = [];
    Game.enemies = [];
    Game.projectiles = [];
    Game.enemyProjectiles = [];
    Game.particles = [];
    Game.grenades = [];
    Game.pickups = [];

    const W = Game.W, H = Game.H;

    if (organName === 'Heart')   this.buildHeart(W, H);
    else if (organName === 'Lungs')   this.buildLungs(W, H);
    else if (organName === 'Brain')   this.buildBrain(W, H);
    else if (organName === 'Stomach') this.buildStomach(W, H);

    // Reposition player to safe spawn
    Game.player.x = W / 2;
    Game.player.y = H - 100;
    // If still blocked, find a clear spot
    let tries = 0;
    while (Obstacles.isBlocked(Game.player.x, Game.player.y, Game.player.radius + 5) && tries < 50) {
      Game.player.x = randRange(80, W - 80);
      Game.player.y = randRange(80, H - 80);
      tries++;
    }
  },

  // ---------- HEART ----------
  buildHeart(W, H) {
    // Central pulsing valve
    Game.obstacles.push(Obstacles.create('circle', {
      x: W / 2, y: H / 2, radius: 70,
      color: '#aa1133', decor: 'valve',
    }));

    // 4 chamber walls (with gaps)
    Game.obstacles.push(Obstacles.create('rect', { x: 180, y: 180, w: 200, h: 22, color: '#883333' }));
    Game.obstacles.push(Obstacles.create('rect', { x: W - 380, y: 180, w: 200, h: 22, color: '#883333' }));
    Game.obstacles.push(Obstacles.create('rect', { x: 180, y: H - 200, w: 200, h: 22, color: '#883333' }));
    Game.obstacles.push(Obstacles.create('rect', { x: W - 380, y: H - 200, w: 200, h: 22, color: '#883333' }));

    // Pulsing artery walls (edges)
    Game.obstacles.push(Obstacles.create('rect', { x: 0, y: 0, w: W, h: 40, color: '#661122', decor: 'artery' }));
    Game.obstacles.push(Obstacles.create('rect', { x: 0, y: H - 40, w: W, h: 40, color: '#661122', decor: 'artery' }));

    // Electric pacemaker zones
    Game.hazards.push(Hazards.create('rect', {
      x: W * 0.25 - 40, y: H * 0.5 - 30, w: 80, h: 60,
      damage: 4, color: '#ffff44', name: 'pacemaker',
    }));
    Game.hazards[Game.hazards.length - 1].type = 'electric';
    Game.hazards.push(Hazards.create('rect', {
      x: W * 0.75 - 40, y: H * 0.5 - 30, w: 80, h: 60,
      damage: 4, color: '#ffff44', name: 'pacemaker',
    }));
    Game.hazards[Game.hazards.length - 1].type = 'electric';
  },

  // ---------- LUNGS ----------
  buildLungs(W, H) {
    // Alveoli clusters (left & right)
    const leftClusterX = 230, rightClusterX = W - 230;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x = leftClusterX + (col - 1) * 55;
        const y = H / 2 + (row - 1) * 55;
        Game.obstacles.push(Obstacles.create('circle', {
          x, y, radius: 22, color: '#225577', decor: 'alveoli',
        }));
        const x2 = rightClusterX + (col - 1) * 55;
        Game.obstacles.push(Obstacles.create('circle', {
          x: x2, y, radius: 22, color: '#225577', decor: 'alveoli',
        }));
      }
    }

    // Bronchial tube walls
    Game.obstacles.push(Obstacles.create('rect', { x: 0, y: H / 2 - 8, w: 90, h: 16, color: '#336688' }));
    Game.obstacles.push(Obstacles.create('rect', { x: W - 90, y: H / 2 - 8, w: 90, h: 16, color: '#336688' }));

    // Air current hazards (push player)
    Game.hazards.push({
      type: 'wind', x: W / 2, y: 70, radius: 140, angle: Math.PI / 2,
      damage: 0, color: '#88ccff', active: true, phase: 0, hazardName: 'down-current',
    });
    Game.hazards.push({
      type: 'wind', x: W / 2, y: H - 70, radius: 140, angle: -Math.PI / 2,
      damage: 0, color: '#88ccff', active: true, phase: 0, hazardName: 'up-current',
    });
  },

  // ---------- BRAIN ----------
  buildBrain(W, H) {
    // Synaptic node obstacles in a network
    const nodes = [
      { x: 200, y: 180 }, { x: 400, y: 150 }, { x: 600, y: 200 }, { x: 800, y: 150 }, { x: 1000, y: 180 },
      { x: 250, y: 400 }, { x: 500, y: 380 }, { x: 750, y: 400 }, { x: 950, y: 380 },
      { x: 200, y: 600 }, { x: 500, y: 580 }, { x: 900, y: 600 },
    ];
    nodes.forEach(n => {
      Game.obstacles.push(Obstacles.create('circle', {
        x: n.x, y: n.y, radius: 18, color: '#5533aa', decor: 'synapse',
      }));
    });

    // Dendrite walls (partial)
    Game.obstacles.push(Obstacles.create('rect', { x: 350, y: 300, w: 120, h: 12, color: '#442288' }));
    Game.obstacles.push(Obstacles.create('rect', { x: 700, y: 300, w: 120, h: 12, color: '#442288' }));
    Game.obstacles.push(Obstacles.create('rect', { x: 350, y: 500, w: 120, h: 12, color: '#442288' }));
    Game.obstacles.push(Obstacles.create('rect', { x: 700, y: 500, w: 120, h: 12, color: '#442288' }));

    // Hallucination zones (damage)
    Game.hazards.push(Hazards.create('circle', {
      x: 330, y: 330, radius: 55, damage: 2, color: '#ff44ff', name: 'hallucination',
    }));
    Game.hazards.push(Hazards.create('circle', {
      x: W - 330, y: 430, radius: 55, damage: 2, color: '#ff44ff', name: 'hallucination',
    }));
    Game.hazards.push(Hazards.create('circle', {
      x: W / 2, y: H - 130, radius: 50, damage: 2, color: '#ff44ff', name: 'hallucination',
    }));
  },

  // ---------- STOMACH ----------
  buildStomach(W, H) {
    // Curved stomach folds (outer ring)
    Game.obstacles.push(Obstacles.create('rect', { x: 0, y: 0, w: 60, h: H, color: '#553322', decor: 'fold' }));
    Game.obstacles.push(Obstacles.create('rect', { x: W - 60, y: 0, w: 60, h: H, color: '#553322', decor: 'fold' }));
    Game.obstacles.push(Obstacles.create('rect', { x: 60, y: 0, w: W - 120, h: 50, color: '#553322', decor: 'fold' }));
    Game.obstacles.push(Obstacles.create('rect', { x: 60, y: H - 50, w: W - 120, h: 50, color: '#553322', decor: 'fold' }));

    // 4 central pillars
    Game.obstacles.push(Obstacles.create('circle', { x: 350, y: 250, radius: 32, color: '#774422', decor: 'pillar' }));
    Game.obstacles.push(Obstacles.create('circle', { x: W - 350, y: 250, radius: 32, color: '#774422', decor: 'pillar' }));
    Game.obstacles.push(Obstacles.create('circle', { x: 350, y: H - 250, radius: 32, color: '#774422', decor: 'pillar' }));
    Game.obstacles.push(Obstacles.create('circle', { x: W - 350, y: H - 250, radius: 32, color: '#774422', decor: 'pillar' }));

    // Acid pools
    Game.hazards.push(Hazards.create('circle', { x: W / 2 - 150, y: H / 2, radius: 50, damage: 3, color: '#88ff44', name: 'acid' }));
    Game.hazards.push(Hazards.create('circle', { x: W / 2 + 150, y: H / 2, radius: 50, damage: 3, color: '#88ff44', name: 'acid' }));
    Game.hazards.push(Hazards.create('circle', { x: 220, y: 470, radius: 45, damage: 3, color: '#88ff44', name: 'acid' }));
    Game.hazards.push(Hazards.create('circle', { x: W - 220, y: 470, radius: 45, damage: 3, color: '#88ff44', name: 'acid' }));
  },
};
