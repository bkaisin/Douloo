import { SHEET_TFS, TF_BY_KEY } from './config.js';
import { formatPct, formatPrice, formatMcap, esc, safeImg, imgSize } from './format.js';
import { textColor, barColor, cellColors } from './colors.js';
import { ICONS } from './icons.js';
import { linksHtml } from './list.js';

// Bottom sheet on phones, centred card on tablets.
export class Sheet {
  constructor(root, { onAction }) {
    this.root = root;
    this.body = root.querySelector('.sheet-body');
    this.state = null;
    this.lastFocus = null;
    root.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action],[data-tf],[data-open],[data-theme-set]');
      if (!target || !root.contains(target)) return;
      onAction(target, e);
    });
    root.addEventListener('change', (e) => {
      if (e.target.matches('[data-action]')) onAction(e.target, e);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state) this.close();
    });
  }

  get isOpen() {
    return !!this.state;
  }

  open(state, html) {
    const wasOpen = !!this.state;
    this.state = state;
    this.body.innerHTML = html;
    this.root.dataset.kind = state.type;
    if (!wasOpen) {
      this.lastFocus = document.activeElement;
      this.root.hidden = false;
      document.documentElement.classList.add('sheet-open');
      requestAnimationFrame(() => this.root.classList.add('in'));
    }
    this.body.scrollTop = 0;
    this.root.querySelector('.sheet-close')?.focus({ preventScroll: true });
  }

  update(html) {
    if (!this.state) return;
    const scroll = this.body.scrollTop;
    const active = document.activeElement?.id;
    this.body.innerHTML = html;
    this.body.scrollTop = scroll;
    if (active) document.getElementById(active)?.focus({ preventScroll: true });
  }

  close() {
    if (!this.state) return;
    this.state = null;
    this.root.classList.remove('in');
    document.documentElement.classList.remove('sheet-open');
    setTimeout(() => {
      if (!this.state) {
        this.root.hidden = true;
        this.body.innerHTML = '';
      }
    }, 220);
    this.lastFocus?.focus?.({ preventScroll: true });
  }
}

function avatar(item, size) {
  if (item.isNarrative) return `<span class="narr-badge big">${esc(item.name.slice(0, 2))}</span>`;
  const src = safeImg(imgSize(item.image, 'large'));
  if (src) return `<img class="av" src="${src}" alt="" width="${size}" height="${size}">`;
  return `<span class="av av-txt" style="width:${size}px;height:${size}px">${esc(item.sym.slice(0, 1))}</span>`;
}

function tfGrid(item, tf, theme) {
  return SHEET_TFS.map((k) => {
    const v = item.ch[k];
    const scale = TF_BY_KEY[k].scale;
    const w = v == null ? 0 : Math.max(3, Math.min(100, (Math.abs(v) / scale) * 100));
    return `<button type="button" class="sh-tfc${k === tf ? ' sel' : ''}" data-tf="${k}">
      <span class="l">${TF_BY_KEY[k].short}</span>
      <span class="v" style="color:${textColor(v, theme)}">${formatPct(v)}</span>
      <span class="bar"><i style="width:${w}%;background:${barColor(v, theme)}"></i></span>
    </button>`;
  }).join('');
}

function head(item, tf, theme, sub, back) {
  const v = item.ch[tf];
  return `<div class="sh-top">
      ${back ? `<button type="button" class="icon-btn sh-back" data-action="back" aria-label="Retour">${ICONS.back}</button>` : ''}
      <button type="button" class="icon-btn sheet-close" data-action="close" aria-label="Fermer">${ICONS.close}</button>
    </div>
    <div class="sh-head">
      ${avatar(item, 48)}
      <div class="sh-title"><div class="sh-name">${esc(item.name)}</div><div class="sh-sub">${sub}</div></div>
      <div class="sh-big"><div class="sh-pct" style="color:${textColor(v, theme)}">${formatPct(v)}</div><div class="sh-tf">${TF_BY_KEY[tf].short}</div></div>
    </div>`;
}

export function tokenSheet(t, { tf, theme, isFav, back }) {
  const sub = `${t.rank ? `#${t.rank} · ` : ''}${esc(t.sym)}`;
  return `${head(t, tf, theme, sub, back)}
    <div class="sh-tfs">${tfGrid(t, tf, theme)}</div>
    <div class="sh-facts">
      <div><span>Prix</span><b>${formatPrice(t.price)}</b></div>
      <div><span>Market cap</span><b>${formatMcap(t.mcap)}</b></div>
    </div>
    <div class="sh-actions">
      <button type="button" class="btn${isFav ? ' on' : ''}" data-action="fav" aria-pressed="${isFav}">${isFav ? ICONS.starFill : ICONS.star}<span>${isFav ? 'Favori' : 'Ajouter aux favoris'}</span></button>
      <div class="sh-links">${linksHtml(t)}</div>
      ${t.custom ? `<button type="button" class="btn ghost" data-action="remove">Retirer de ma liste</button>` : ''}
    </div>`;
}

export function narrativeSheet(n, { tf, theme }) {
  const sub = `${n.count} tokens · ${formatMcap(n.mcap)}`;
  const rows = n.tokens
    .map((t) => {
      const v = t.ch[tf];
      const col = cellColors(v, tf, theme, true);
      const pill = col ? `<span class="pill" style="background:${col.bg};color:${col.fg}">${formatPct(v)}</span>` : '<span class="pill none">—</span>';
      const src = safeImg(imgSize(t.image, 'small'));
      const img = src ? `<img class="av" src="${src}" alt="" width="26" height="26" loading="lazy">` : `<span class="av av-txt" style="width:26px;height:26px">${esc(t.sym.slice(0, 1))}</span>`;
      return `<button type="button" class="sh-row" data-open="${esc(t.id)}">${img}<span class="sh-row-sym">${esc(t.sym)}</span><span class="sh-row-name">${esc(t.name)}</span>${pill}</button>`;
    })
    .join('');
  return `${head(n, tf, theme, sub, false)}
    <div class="sh-tfs">${tfGrid(n, tf, theme)}</div>
    <p class="sh-note">Variation moyenne pondérée par la capitalisation des tokens du narratif présents dans le top.</p>
    <div class="sh-list">${rows}</div>`;
}

export function settingsSheet({ theme, showStables, apiKey, lastUpdate }) {
  return `<div class="sh-top"><h2>Réglages</h2><button type="button" class="icon-btn sheet-close" data-action="close" aria-label="Fermer">${ICONS.close}</button></div>
    <div class="set-row"><span>Thème</span>
      <div class="seg small" role="group" aria-label="Thème">
        <button type="button" data-theme-set="dark" class="${theme === 'dark' ? 'on' : ''}">Sombre</button>
        <button type="button" data-theme-set="light" class="${theme === 'light' ? 'on' : ''}">Clair</button>
      </div>
    </div>
    <label class="set-row"><span>Afficher les stablecoins</span><input type="checkbox" class="switch" data-action="stables" ${showStables ? 'checked' : ''}></label>
    <div class="set-block">
      <label for="cgkey">Clé API CoinGecko <em>(optionnelle)</em></label>
      <div class="set-inline"><input id="cgkey" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="CG-…" value="${esc(apiKey)}"><button type="button" class="btn" data-action="savekey">Enregistrer</button></div>
      <p class="hint">L'app fonctionne sans clé. Une clé « Demo » gratuite (coingecko.com/api) augmente la limite de requêtes si CoinGecko en refuse.</p>
    </div>
    <div class="set-block">
      <b>Installer sur iPhone / iPad</b>
      <p class="hint">Dans Safari : bouton Partager → « Sur l'écran d'accueil ». Douloo s'ouvre alors en plein écran comme une app.</p>
    </div>
    <div class="set-block">
      <b>Sources</b>
      <p class="hint">Prix, capitalisations et variations 1H → 1Y : CoinGecko. Variations 15M, 30M et 4H : DefiLlama, complété par Coinpaprika. Rafraîchissement automatique toutes les 60 s${lastUpdate ? ` (dernière mise à jour ${new Date(lastUpdate).toLocaleTimeString('fr-FR')})` : ''}.</p>
    </div>`;
}
