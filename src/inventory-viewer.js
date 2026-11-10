export function initInventories() {
  for (const inventory of document.querySelectorAll('.definition-inventory')) {
    const search = inventory.querySelector('input');
    const filters = [...inventory.querySelectorAll('select')];
    const rows = [...inventory.querySelectorAll('.definition-item')];
    const update = () => {
      const query = search.value.toLowerCase();
      for (const row of rows) row.hidden = !row.textContent.toLowerCase().includes(query) || filters.some(filter => filter.value && row.dataset[filter.dataset.filter] !== filter.value);
      inventory.querySelector('.inventory-result').textContent = `${rows.filter(row => !row.hidden).length} of ${rows.length} definitions`;
    };
    search.addEventListener('input', update);
    filters.forEach(filter => filter.addEventListener('change', update));
    update();
  }
}
