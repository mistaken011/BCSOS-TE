/* =====================================================
   BCSO ONLINE — script.js (v2 — hata düzeltmeli)
   ===================================================== */

/* FIX: Dropdown CSS hover ile JS çakışması giderildi.
   Yalnızca JS ile yönetiliyor. */

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
  var page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'roster')  renderRoster();
  if (id === 'gallery') renderGalleryPage();
  if (id === 'hq')      renderHQPage();
}

/* Rütbe sırası (yüksekten düşüğe) */
var RANK_ORDER = ['Sheriff','Under Sheriff','Captain','Lieutenant','Sergeant II','Sergeant I','Corporal','Deputy','Cadet'];
var RANK_SUBS  = {
  'Sheriff':'Komuta Birimi', 'Under Sheriff':'Komuta Birimi',
  'Captain':'Üst Komuta', 'Lieutenant':'Orta Komuta',
  'Sergeant II':'Aktif Kadro', 'Sergeant I':'Aktif Kadro',
  'Corporal':'Aktif Kadro', 'Deputy':'Aktif Kadro',
  'Cadet':'Stajyer Personel'
};

function renderRoster() {
  var el = document.getElementById('roster-content');
  if (!el) return;
  var pers = [];
  try { pers = JSON.parse(localStorage.getItem('bcso2_pers') || '[]'); } catch(e) {}
  if (!pers.length) {
    el.innerHTML = '<div style="text-align:center;padding:3rem;color:#8a7a5a">Henüz personel kaydı yok.</div>';
    return;
  }
  var groups = {};
  pers.forEach(function(p) {
    if (!groups[p.rank]) groups[p.rank] = [];
    groups[p.rank].push(p);
  });
  var html = '';
  RANK_ORDER.forEach(function(rank) {
    var list = groups[rank];
    if (!list || !list.length) return;
    var isTop = (rank === 'Sheriff' || rank === 'Under Sheriff' || rank === 'Captain');
    var gridClass = isTop ? 'slots-grid slots-center-3' : 'slots-grid';
    html += '<div class="roster-section"><div class="rank-header"><div class="rank-title">' + rank.toUpperCase() + '</div><div class="rank-sub">' + (RANK_SUBS[rank] || 'Aktif Kadro') + '</div></div><div class="' + gridClass + '">';
    list.forEach(function(p) {
      var initials = p.name.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
      var isCadet  = (rank === 'Cadet');
      var avatarCls = isCadet ? 'slot-avatar cadet-avatar' : 'slot-avatar';
      var initCls   = isCadet ? 'avatar-initials cadet-initials' : 'avatar-initials';
      var badgeCls  = isCadet ? 'slot-badge-num cadet-num' : 'slot-badge-num';
      var nameCls   = isCadet ? 'slot-name cadet-name' : 'slot-name';
      var adminBadge = p.isAdmin ? '<div style="position:absolute;top:-6px;right:-6px;background:#cc4444;color:#fff;font-size:8px;font-weight:700;padding:2px 5px;border-radius:3px;letter-spacing:1px">ADMİN</div>' : '';

      /* Personel fotoğrafı varsa göster */
      var avatarContent;
      if (p.photo) {
        avatarContent = '<img src="' + p.photo + '" alt="' + p.name + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      } else {
        avatarContent = '<span class="' + initCls + '">' + initials + '</span>';
      }

      html += '<div class="slot">' +
        '<div class="' + avatarCls + '" style="position:relative">' +
          adminBadge + avatarContent +
          '<div class="' + badgeCls + '">' + (p.badge || '#----') + '</div>' +
        '</div>' +
        '<div class="' + nameCls + '">' + p.name + '</div>' +
        '<div class="slot-online">' +
          (p.online
            ? '<div class="dot-on"></div><span class="online-text">Çevrimiçi</span>'
            : '<div class="dot-off"></div><span class="offline-text">Çevrimdışı</span>') +
        '</div>' +
        '<div style="font-size:10px;color:#8a7a5a;margin-top:3px">' + (p.unit || '') + '</div>' +
      '</div>';
    });
    html += '</div></div>';
  });
  el.innerHTML = html;
}

/* ── Galeri Sayfası ── */
function renderGalleryPage() {
  var el = document.getElementById('gallery-content');
  if (!el) return;
  var photos = [];
  try { photos = JSON.parse(localStorage.getItem('bcso2_gallery') || '[]'); } catch(e) {}
  if (!photos.length) {
    el.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--muted);grid-column:1/-1">Henüz galeri fotoğrafı eklenmemiş.</div>';
    return;
  }
  el.innerHTML = photos.slice().reverse().map(function(p) {
    return '<div class="gallery-item" onclick="openLightbox(\'' + p.url + '\')">' +
      '<img src="' + p.url + '" alt="' + (p.title||'') + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'">' +
      '<div class="gallery-caption">' +
        '<div class="gallery-caption-title">' + (p.title||'') + '</div>' +
        (p.desc ? '<div class="gallery-caption-desc">' + p.desc + '</div>' : '') +
        '<div style="font-size:10px;color:var(--muted);margin-top:4px">' + (p.author||'') + ' · ' + (p.date||'') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openLightbox(url) {
  var lb = document.getElementById('lightbox');
  var img = document.getElementById('lightbox-img');
  if (!lb || !img) return;
  img.src = url;
  lb.style.display = 'flex';
}

/* ── BCSO HQ Sayfası ── */
function renderHQPage() {
  var el = document.getElementById('hq-content');
  if (!el) return;
  var posts = [];
  try { posts = JSON.parse(localStorage.getItem('bcso2_hq') || '[]'); } catch(e) {}
  if (!posts.length) {
    el.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--muted)">Henüz haber yayınlanmamış.</div>';
    return;
  }
  var typeIcons  = { haber:'📰', afis:'🖼️', duyuru:'📢', operasyon:'🚔' };
  var typeLabels = { haber:'Haber', afis:'Afiş', duyuru:'Duyuru', operasyon:'Operasyon Raporu' };
  var cards = posts.slice().reverse().map(function(p) {
    var imgHtml = p.imgUrl
      ? '<div class="hq-post-img" onclick="openLightbox(\'' + p.imgUrl.replace(/'/g,"\\'") + '\')">' +
          '<img src="' + p.imgUrl + '" alt="' + p.title + '" onerror="this.parentElement.style.display=\'none\'">' +
        '</div>'
      : '';
    return '<div class="hq-post">' +
      imgHtml +
      '<div class="hq-post-body">' +
        '<div class="hq-post-header">' +
          '<span class="hq-type-badge">' + (typeIcons[p.type]||'📌') + ' ' + (typeLabels[p.type]||p.type) + '</span>' +
          '<span class="hq-post-date">' + p.date + '</span>' +
        '</div>' +
        '<div class="hq-post-title">' + p.title + '</div>' +
        '<div class="hq-post-content">' + p.content.replace(/\n/g,' ') + '</div>' +
        '<div class="hq-post-footer">🖊 ' + (p.author||'Komuta') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  el.innerHTML = '<div class="hq-grid">' + cards + '</div>';
}

/* ── Form seçici ── */
function selectForm(type) {
  ['apply','praise','complaint','ticket'].forEach(function(t) {
    var f = document.getElementById('form-' + t);
    if (f) f.style.display = (t === type) ? 'block' : 'none';
    var c = document.getElementById('fcard-' + t);
    if (c) c.classList.toggle('sel', t === type);
  });
}

/* FIX: Tüm form alanları ID ile seçiliyor (placeholder bağımlılığı kaldırıldı) */
function submitApply() {
  var name    = (document.getElementById('apply-name')    || {}).value || '';
  var discord = (document.getElementById('apply-discord') || {}).value || '';
  var exp     = (document.getElementById('apply-exp')     || {}).value || '';
  var unit    = (document.getElementById('apply-unit')    || {}).value || '';
  var rpExp   = (document.getElementById('apply-rpexp')   || {}).value || '';
  var reason  = (document.getElementById('apply-reason')  || {}).value || '';
  name = name.trim(); discord = discord.trim();
  if (!name || !discord) { alert('Lütfen en azından adınızı ve Discord bilginizi girin.'); return; }
  if (typeof saveApply === 'function') {
    saveApply({ name: name, discord: discord, unit: unit, experience: exp, rpExp: rpExp, reason: reason });
  }
  alert('✔ Başvurunuz alındı! Admin panelinde incelenecektir.');
  ['apply-name','apply-discord','apply-rpexp','apply-reason'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
}

function submitPraise() {
  var name   = (document.getElementById('praise-name')   || {}).value || '';
  var target = (document.getElementById('praise-target') || {}).value || '';
  var desc   = (document.getElementById('praise-desc')   || {}).value || '';
  name = name.trim(); target = target.trim();
  if (!name || !target) { alert('Ad ve personel bilgisi zorunludur.'); return; }
  if (typeof savePraise === 'function') { savePraise({ name: name, target: target, desc: desc }); }
  alert('✔ Övgü formunuz iletildi. Teşekkürler!');
  ['praise-name','praise-target','praise-desc'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
}

function submitComplaint() {
  var name    = (document.getElementById('complaint-name')   || {}).value || '';
  var target  = (document.getElementById('complaint-target') || {}).value || '';
  var iDate   = (document.getElementById('complaint-date')   || {}).value || '';
  var loc     = (document.getElementById('complaint-loc')    || {}).value || '';
  var desc    = (document.getElementById('complaint-desc')   || {}).value || '';
  name = name.trim(); target = target.trim();
  if (!name || !target) { alert('Ad ve şikayet edilen personel bilgisi zorunludur.'); return; }
  if (typeof saveComplaint === 'function') {
    saveComplaint({ name: name, target: target, incidentDate: iDate, location: loc, desc: desc });
  }
  alert('✔ Şikayetiniz kaydedildi. En kısa sürede incelenecektir.');
  ['complaint-name','complaint-target','complaint-loc','complaint-desc'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
}

/* YENİ: Ticket formu */
function submitTicket() {
  var name    = (document.getElementById('ticket-name')    || {}).value || '';
  var discord = (document.getElementById('ticket-discord') || {}).value || '';
  var cat     = (document.getElementById('ticket-cat')     || {}).value || '';
  var subject = (document.getElementById('ticket-subject') || {}).value || '';
  var desc    = (document.getElementById('ticket-desc')    || {}).value || '';
  name = name.trim(); discord = discord.trim(); subject = subject.trim(); desc = desc.trim();
  if (!name || !subject || !desc) { alert('Ad, konu ve açıklama alanları zorunludur.'); return; }
  if (typeof saveTicket === 'function') {
    saveTicket({ name: name, discord: discord, category: cat, subject: subject, desc: desc });
  }
  alert('✔ Destek talebiniz alındı! En kısa sürede yanıtlanacaktır.');
  ['ticket-name','ticket-discord','ticket-subject','ticket-desc'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
}

/* Panel aç/kapat */
function openPanel() {
  document.getElementById('main-site').style.display = 'none';
  document.getElementById('main-nav').style.display  = 'none';
  document.getElementById('panel-layer').style.display = 'block';
  document.querySelectorAll('.pscreen').forEach(function(e){ e.style.display = 'none'; });
  var login = document.getElementById('screen-login');
  if (login) login.style.display = 'block';
}

/* FIX: closePanel CU'yu panel.js scope'undan sıfırlıyor */
function closePanel() {
  document.getElementById('panel-layer').style.display = 'none';
  document.getElementById('main-site').style.display   = 'block';
  document.getElementById('main-nav').style.display    = 'flex';
  var lu = document.getElementById('lu'); if (lu) lu.value = '';
  var lp = document.getElementById('lp'); if (lp) lp.value = '';
  /* panel.js global CU'yu sıfırla */
  if (typeof panelLogout === 'function') panelLogout();
  else { try { CU = null; } catch(e) {} }
}

document.addEventListener('DOMContentLoaded', function() {
  var firstBtn = document.querySelector('.nav-btn');
  if (firstBtn) showPage('home', firstBtn);
  selectForm('apply');

  /* FIX: Dropdown sadece JS ile — CSS hover kaldırıldı, çakışma yok */
  document.querySelectorAll('.dropdown').forEach(function(dd) {
    var btn = dd.querySelector('#formBtn');
    if (btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var menu = dd.querySelector('.dropdown-menu');
        if (!menu) return;
        var isOpen = menu.style.display === 'block';
        document.querySelectorAll('.dropdown-menu').forEach(function(m) { m.style.display = 'none'; });
        if (!isOpen) menu.style.display = 'block';
      });
    }
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-menu').forEach(function(m) { m.style.display = 'none'; });
    }
  });
});