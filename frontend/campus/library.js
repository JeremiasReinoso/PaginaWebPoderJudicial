import { api as get } from './api.js';
import { showSection } from './navigation.js';
/* Teaching content is fetched only after server-side session authorization. */
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  let catalog,
    selected,
    pending = false,
    requestId = 0;
  function book(id, text, page) {
    const link = el('a', text, 'library-source-link');
    const baseHref =
      selected?.bookUrls?.[id] || `/api/library/books/${id}.pdf`;
    link.href = `${baseHref}${page ? '#page=' + page : ''}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  function references(items) {
    const group = el('div', undefined, 'library-references');
    group.append(el('span', 'Fuente: '));
    items.forEach((r) =>
      group.append(
        book(
          r.source,
          `Módulo ${r.source} · ${r.from === r.to ? 'p. ' + r.from : 'pp. ' + r.from + '–' + r.to}`,
          r.from,
        ),
      ),
    );
    return group;
  }
  async function loadCatalog() {
    if (catalog || pending) return;
    pending = true;
    $('library-status').textContent = 'Cargando los materiales de estudio…';
    try {
      catalog = await get('/api/library');
      $('library-grid').replaceChildren(
        ...catalog.modules.map((m) => {
          const card = el(
            'button',
            undefined,
            'library-card library-module-' + m.id,
          );
          card.type = 'button';
          card.dataset.libraryModule = m.id;
          card.append(
            el(
              'span',
              m.id === 'general'
                ? 'Repaso integrador'
                : 'Módulo ' + m.id.padStart(2, '0'),
              'eyebrow',
            ),
            el('span', m.title, 'library-card-title'),
            el('span', m.intro, 'library-card-description'),
            el(
              'span',
              'Resumen · Mapa conceptual · Cuadro · Esquema',
              'library-card-materials',
            ),
            el('span', 'Abrir materiales', 'library-card-action'),
          );
          return card;
        }),
      );
      $('library-note').textContent = catalog.note;
      $('library-status').textContent =
        '6 espacios de estudio · 5 PDF originales · Materiales con referencias de página';
    } catch (error) {
      $('library-status').textContent = error.message;
    } finally {
      pending = false;
    }
  }
  function render(resource, focus = false) {
    const m = selected.module,
      container = $('library-content');
    container.replaceChildren();
    $('library-resources')
      .querySelectorAll('button')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.resource === resource)),
      );
    const heading = el(
      'h3',
      {
        summary: 'Resumen de estudio',
        map: 'Mapa conceptual',
        comparison: 'Cuadro comparativo',
        outline: 'Esquema de repaso',
      }[resource],
    );
    heading.tabIndex = -1;
    container.append(heading);
    if (resource === 'summary') {
      m.summary.forEach((s) => {
        const chapter = el('article', undefined, 'library-chapter');
        chapter.append(el('h4', s.title));
        s.paragraphs.forEach((p) => chapter.append(el('p', p)));
        chapter.append(references(s.references));
        container.append(chapter);
      });
    } else if (resource === 'map') {
      container.append(
        el(
          'p',
          'Leé el concepto central y sus ramas: cada vínculo indica cómo se relacionan las ideas.',
          'library-help',
        ),
      );
      const map = el('div', undefined, 'concept-map');
      map.append(el('div', m.conceptMap.root, 'concept-root'));
      const branches = el('div', undefined, 'concept-branches');
      m.conceptMap.branches.forEach((b, i) => {
        const branch = el(
          'section',
          undefined,
          'concept-branch concept-branch-' + i,
        );
        branch.append(
          el('span', b.relation, 'concept-relation'),
          el('h4', b.title),
        );
        const list = el('ul');
        b.items.forEach((item) => {
          const li = el('li');
          li.append(el('strong', item.label), el('span', item.detail));
          list.append(li);
        });
        branch.append(list);
        branches.append(branch);
      });
      map.append(branches);
      container.append(map);
    } else if (resource === 'comparison') {
      const wrapper = el('div', undefined, 'library-table-scroll');
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', m.comparison.title);
      const table = el('table', undefined, 'library-table');
      table.append(el('caption', m.comparison.title));
      const head = el('thead'),
        row = el('tr');
      m.comparison.columns.forEach((c) => {
        const th = el('th', c);
        th.scope = 'col';
        row.append(th);
      });
      head.append(row);
      table.append(head);
      const body = el('tbody');
      m.comparison.rows.forEach((values) => {
        const tr = el('tr');
        values.forEach((value, i) => {
          const cell = el(i === 0 ? 'th' : 'td', value);
          if (i === 0) cell.scope = 'row';
          tr.append(cell);
        });
        body.append(tr);
      });
      table.append(body);
      wrapper.append(table);
      container.append(wrapper, references(m.comparison.references));
    } else if (resource === 'outline') {
      const steps = el('ol', undefined, 'library-outline');
      m.outline.forEach((group) => {
        const li = el('li');
        li.append(el('h4', group.title));
        const list = el('ul');
        group.items.forEach((item) => list.append(el('li', item)));
        li.append(list);
        steps.append(li);
      });
      container.append(steps);
    }
    if (resource === 'map' || resource === 'outline')
      container.append(
        references(
          m.sourceIds.map((id) => ({
            source: id,
            from: 2,
            to: selected.sources.find((s) => s.id === id).pages,
          })),
        ),
      );
    if (focus) heading.focus({ preventScroll: true });
  }
  async function openModule(id, trigger) {
    const current = ++requestId;
    trigger.disabled = true;
    try {
      const data = await get('/api/library/modules/' + encodeURIComponent(id));
      if (current !== requestId) return;
      selected = data;
      $('library-label').textContent =
        id === 'general'
          ? 'Los cinco módulos, conectados'
          : 'Biblioteca · Módulo ' + id.padStart(2, '0');
      $('library-title').textContent = data.module.title;
      $('library-intro').textContent = data.module.intro;
      $('library-editorial').replaceChildren(
        ...data.module.notes.map((note) => el('p', note)),
      );
      $('library-editorial').hidden = !data.module.notes.length;
      $('library-books').replaceChildren(
        ...data.module.sourceIds.map((sourceId) => {
          const s = data.sources.find((source) => source.id === sourceId);
          return book(
            sourceId,
            `Leer PDF original · Módulo ${sourceId} · ${s.pages} páginas`,
          );
        }),
      );
      $('library-reader-note').textContent = data.note;
      render('summary');
      showSection('library-reader');
      $('library-title').focus();
    } catch (error) {
      $('library-status').textContent = error.message;
    } finally {
      trigger.disabled = false;
    }
  }
  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-section]');
    if (tab) {
      ++requestId;
      if (tab.dataset.section === 'library') loadCatalog();
    }
    const card = event.target.closest('[data-library-module]');
    if (card) openModule(card.dataset.libraryModule, card);
    const resource = event.target.closest('[data-resource]');
    if (resource && selected) render(resource.dataset.resource, true);
  });
  $('library-back').addEventListener('click', () => {
    ++requestId;
    showSection('library');
    loadCatalog();
    document
      .querySelector(`[data-library-module="${selected.module.id}"]`)
      ?.focus();
  });
})();
