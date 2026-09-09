export function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

export function rollDie(sides) {
  return 1 + Math.floor(Math.random() * sides);
}

// Animates a d20 element cycling through random faces before settling on
// `finalValue`. Calls onDone() once the animation finishes.
export function animateDie(el, finalValue, onDone) {
  let ticks = 0;
  const maxTicks = 10;
  const interval = setInterval(() => {
    ticks += 1;
    if (ticks >= maxTicks) {
      clearInterval(interval);
      el.textContent = finalValue;
      el.classList.add('die-settled');
      if (onDone) onDone();
      return;
    }
    el.textContent = 1 + Math.floor(Math.random() * 20);
  }, 60);
}
