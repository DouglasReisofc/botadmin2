document.addEventListener('DOMContentLoaded', () => {
  if (window.Coloris) {
    Coloris({ el: '.color-input' });
  }

  const colorInputs = document.querySelectorAll('.theme-input.color-input');
  const gradients = document.querySelectorAll('.gradient-picker');

  const apply = () => {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    colorInputs.forEach(inp => {
      if (inp.dataset.theme === theme) {
        document.documentElement.style.setProperty(inp.dataset.var, inp.value);
      }
    });
    gradients.forEach(w => {
      if (w.dataset.theme === theme) {
        const c1 = w.querySelector('.grad-color1').value;
        const c2 = w.querySelector('.grad-color2').value;
        const ang = w.querySelector('.grad-angle').value;
        const val = `linear-gradient(${ang}deg, ${c1}, ${c2})`;
        const hidden = w.querySelector('.theme-input');
        hidden.value = val;
        document.documentElement.style.setProperty(w.dataset.var, val);
        const preview = w.querySelector('.grad-preview');
        if (preview) preview.style.background = val;
      }
    });
  };

  colorInputs.forEach(inp => inp.addEventListener('input', apply));
  gradients.forEach(w => {
    ['input', 'change'].forEach(evt => {
      w.querySelector('.grad-color1').addEventListener(evt, apply);
      w.querySelector('.grad-color2').addEventListener(evt, apply);
      w.querySelector('.grad-angle').addEventListener(evt, apply);
    });
  });
  apply();
});
