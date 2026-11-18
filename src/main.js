document.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.src = 'https://a.salteadorneo.dev/a.js';
  script.async = true;
  document.head.appendChild(script);

  const filterBtns = document.querySelectorAll('.filter-btn');
  const historyContainers = document.querySelectorAll('.history-container > div');
  
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      
      filterBtns.forEach(b => {
        const isActive = b.dataset.period === period;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive);
      });
      
      historyContainers.forEach((container, index) => {
        const shouldShow = (period === '60d' && index === 3) || 
                          (period === '30d' && index === 2) || 
                          (period === '72h' && index === 1) || 
                          (period === '24h' && index === 0);
        container.style.display = shouldShow ? 'block' : 'none';
      });
    });
  });
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}