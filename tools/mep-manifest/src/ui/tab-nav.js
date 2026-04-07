/**
 * Renders tab navigation: Info | Placeholders | Experiences
 */

const TABS = [
  { id: 'experiences', label: 'Experiences' },
  { id: 'placeholders', label: 'Placeholders' },
];

export function renderTabNav(container, onTabChange) {
  const nav = document.createElement('div');
  nav.className = 'mep-tabs';

  TABS.forEach((tab) => {
    const btn = document.createElement('button');
    btn.className = 'mep-tab';
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      nav.querySelectorAll('.mep-tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      onTabChange(tab.id);
    });
    nav.append(btn);
  });

  // Default to experiences tab
  nav.querySelector('[data-tab="experiences"]').classList.add('active');

  container.append(nav);
  return nav;
}
