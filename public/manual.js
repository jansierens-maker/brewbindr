// BrewBindr manual: language choice, search, audience filter, reading progress.
// Loaded as a file (not inline) so the Content Security Policy needs no 'unsafe-inline' for scripts.
function initManual() {
  var sections = Array.prototype.slice.call(document.querySelectorAll('section.doc'));
  var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
  var searchInput = document.getElementById('docSearch');
  var emptyMsg = document.getElementById('searchEmpty');
  var audienceButtons = Array.prototype.slice.call(document.querySelectorAll('.audience-toggle button'));
  var currentAudience = 'all';
  var currentQuery = '';

  function applyFilters() {
    var visibleCount = 0;
    sections.forEach(function (sec) {
      var matchAudience = currentAudience === 'all' ||
        sec.dataset.audience === currentAudience ||
        sec.dataset.audience === 'all';
      var matchQuery = !currentQuery ||
        sec.textContent.toLowerCase().indexOf(currentQuery) !== -1;
      var show = matchAudience && matchQuery;
      sec.classList.toggle('hidden-by-filter', !show);
      if (show) visibleCount++;
      var link = document.querySelector('.nav-item[href="#' + sec.id + '"]');
      if (link) link.style.display = show ? '' : 'none';
    });
    emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';
    updateProgress();
  }

  audienceButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      audienceButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentAudience = btn.dataset.audience;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', function () {
    currentQuery = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  // Active section highlighting
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        navItems.forEach(function (n) { n.classList.remove('active'); });
        var link = document.querySelector('.nav-item[href="#' + entry.target.id + '"]');
        if (link) link.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  sections.forEach(function (s) { observer.observe(s); });

  // Reading progress -> glass fill
  var fill = document.getElementById('progressFill');
  var pctLabel = document.getElementById('progressPct');
  function updateProgress() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
    var h = 38 * (pct / 100);
    fill.setAttribute('y', String(38 - h));
    fill.setAttribute('height', String(h));
    pctLabel.textContent = Math.round(pct) + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  // Glass indicator demo
  var range = document.getElementById('demoRange');
  var demoFill = document.getElementById('demoFill');
  var demoFoam = document.getElementById('demoFoam');
  var demoPct = document.getElementById('demoPct');
  function updateDemo() {
    var pct = parseInt(range.value, 10);
    var top = 6, bottom = 72;
    var y = bottom - (bottom - top) * (pct / 100);
    demoFill.setAttribute('y', String(y));
    demoFill.setAttribute('height', String(bottom - y + 4));
    demoFoam.setAttribute('cy', String(y));
    demoFoam.style.opacity = pct > 2 ? '1' : '0';
    var color = pct <= 20 ? '#EF4444' : pct <= 45 ? '#F59E0B' : '#F59E0B';
    demoFill.setAttribute('fill', color);
    demoPct.textContent = pct;
  }
  range.addEventListener('input', updateDemo);
  updateDemo();
}

(function () {
  var supported = ['en', 'nl', 'fr'];
  var lang = null;
  try { lang = new URLSearchParams(window.location.search).get('lang'); } catch (e) {}
  if (supported.indexOf(lang) === -1) {
    try { lang = localStorage.getItem('brewbindr-manual-lang'); } catch (e) { lang = null; }
  }
  if (supported.indexOf(lang) === -1) {
    var nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    lang = supported.indexOf(nav) !== -1 ? nav : 'en';
  }
  try { localStorage.setItem('brewbindr-manual-lang', lang); } catch (e) {}
  document.documentElement.lang = lang;
  var titles = { en: 'BrewBindr — User Manual', nl: 'BrewBindr — Handleiding', fr: 'BrewBindr — Manuel' };
  document.title = titles[lang];
  var tpl = document.getElementById('lang-' + lang);
  document.getElementById('app').appendChild(tpl.content.cloneNode(true));
  Array.prototype.forEach.call(document.querySelectorAll('.lang-switch a'), function (a) {
    var active = a.dataset.lang === lang;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'true');
    a.setAttribute('href', '?lang=' + a.dataset.lang + window.location.hash);
    a.addEventListener('click', function () {
      try { localStorage.setItem('brewbindr-manual-lang', a.dataset.lang); } catch (e) {}
    });
  });
  if (window.location.hash) {
    var target = document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView();
  }
  initManual();
})();
