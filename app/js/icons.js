const svg = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  list: svg(
    '<circle cx="4" cy="6" r="1.6" fill="currentColor"/><circle cx="4" cy="12" r="1.6" fill="currentColor"/><circle cx="4" cy="18" r="1.6" fill="currentColor"/><path d="M8.5 6h12M8.5 12h12M8.5 18h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  ),
  swarm: svg('<circle cx="9" cy="5.5" r="3" fill="currentColor"/><circle cx="5" cy="13" r="3" fill="currentColor"/><circle cx="16.5" cy="17" r="3" fill="currentColor"/>'),
  treemap: svg('<rect x="2.5" y="3.5" width="9" height="17" rx="1" fill="currentColor"/><rect x="13" y="3.5" width="8.5" height="7.5" rx="1" fill="currentColor"/><rect x="13" y="12.5" width="3.6" height="8" rx="1" fill="currentColor"/><rect x="17.9" y="12.5" width="3.6" height="8" rx="1" fill="currentColor"/>'),
  star: svg('<path d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9L3.4 9.4l6-.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  starFill: svg('<path d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9L3.4 9.4l6-.7z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  sun: svg('<circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>'),
  moon: svg('<path d="M20 14.6A8.3 8.3 0 0 1 9.4 4a8.3 8.3 0 1 0 10.6 10.6z" fill="currentColor"/>'),
  gear: svg('<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.3 4.6l1.7 1.3-1.9 3.3-2-.8a7.7 7.7 0 0 1-1.9 1.1l-.3 2.1H10l-.3-2.1a7.7 7.7 0 0 1-1.9-1.1l-2 .8-1.9-3.3 1.7-1.3a7.6 7.6 0 0 1 0-2.2L3.9 9.7l1.9-3.3 2 .8A7.7 7.7 0 0 1 9.7 6l.3-2.1h3.8l.3 2.1c.7.3 1.3.6 1.9 1.1l2-.8 1.9 3.3-1.7 1.3c.1.8.1 1.5 0 2.3z" fill="currentColor" fill-rule="evenodd"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20.5 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  chevron: svg('<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  back: svg('<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  gecko: svg('<circle cx="12" cy="12" r="10" fill="#8dc63f"/><circle cx="13.6" cy="9.4" r="3" fill="#fff"/><circle cx="14.1" cy="9.4" r="1.5" fill="#1b1b1b"/><path d="M5.5 15.5c3 2.6 8.6 2.9 13 .2" stroke="#2f6b1b" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
  chart: svg('<rect x="2" y="2" width="20" height="20" rx="6" fill="#2962ff"/><path d="M6 16l4-5 3 3 5-7" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
};

export const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <circle cx="25" cy="27" r="17" fill="#dd483e"/>
  <circle cx="45" cy="42" r="11" fill="#28a85c"/>
  <circle cx="47" cy="16" r="6" fill="#f28b1f"/>
  <circle cx="18" cy="50" r="5" fill="#8a8a92"/>
</svg>`;
