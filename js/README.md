# 🧬 MICROCURE

A tactical bio-combat browser game. You're a Microsurgeon — shrunk to cellular size, injected into dying patients, fighting viruses across organ-themed levels.

## 🎮 Play
Open `index.html` in any modern browser, or deploy to GitHub Pages.

## 🚀 Deploy to GitHub Pages
1. Create a new GitHub repo named `microcure`
2. Upload all files keeping the folder structure
3. Go to Settings → Pages → Source: main branch / root
4. Visit `https://yourusername.github.io/microcure/`

## 🎯 Controls
- **WASD** - Move
- **Mouse** - Aim
- **Click** - Shoot (hold to charge with Bio-Volt Rifle)
- **Shift** - Dash
- **R** - Reload
- **G** - Throw Grenade
- **F** - Activate Shield
- **1/2/3** - Switch weapon slots

## 🧠 Features
- **Hub world** — Nexus Hospital with Patient Ward, Armory, Bio-Lab
- **6 patient cases** with progressive unlock and difficulty scaling
- **8 weapons** to buy and equip
- **6 permanent upgrades** in the Bio-Lab
- **4 organ environments** — Heart, Lungs, Brain, Stomach
- **5 enemy types** including 3 boss variants
- **Time-based credit rewards** — speed matters!
- **Mid-mission upgrade choices** between organs

## 🛠 Structure
All game state lives in `js/config.js` and the global `Game` object.
Modules are loaded in dependency order via `index.html`.
