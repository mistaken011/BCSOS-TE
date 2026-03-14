/* =====================================================
   BCSO ONLINE — panel.js (v5 — hata düzeltmeli + yeni özellikler)
   Düzeltmeler:
   - Duplicate ID sorunu: panel formu ayrı prefix'li ID'ler (a-, p-)
   - Şifreler hash-like maskeleme (plain text uyarısı kaldırıldı, gerekirse SHA değiştirilebilir)
   - CU referans yönetimi: panelLogout() fonksiyonu ile script.js'e açık
   - Mesai timer memory leak giderildi (beforeunload + doLogout'ta clearInterval)
   - Yeni: Ticket sistemi
   - Yeni: Personel fotoğrafı (admin panelinden URL ile)
   - Yeni: Galeri yönetimi
   - Yeni: BCSO HQ haber/afiş sistemi
   ===================================================== */

var RANKS = ['Cadet','Deputy','Corporal','Sergeant I','Sergeant II','Lieutenant','Captain','Under Sheriff','Sheriff'];
var RL = {};
RANKS.forEach(function(r,i){ RL[r]=i; });
var UNITS = ['Patrol Division','Detective Bureau','Traffic Enforcement','K-9 Unit','Air Support','Training Academy'];
var TMPL = [
  { name:'Eğitim Sertifikası', type:'Eğitim Belgesi',  text:'Bu belge, {target} isimli personelin BCSO standart eğitimini başarıyla tamamladığını onaylar. Eğitim tarihi: {date}.' },
  { name:'Görev Raporu',       type:'Görev Raporu',     text:'{target} personeli tarafından hazırlanan görev raporu. Görev süresi: - Konum: - Notlar: ' },
  { name:'Uyarı Belgesi',      type:'Uyarı Belgesi',    text:'{target} isimli personele departman yönetmeliğinin ihlali nedeniyle resmi uyarı verilmiştir.' },
  { name:'Terfi Önerisi',      type:'Terfi Önerisi',    text:'{target} isimli personelin gösterdiği üstün performans nedeniyle terfi önerilmektedir.' },
  { name:'Takdirname',         type:'Takdirname',        text:'{target} isimli personel, görevi esnasında gösterdiği üstün başarı nedeniyle takdire layık görülmüştür.' },
];

/* ── LocalStorage yardımcıları ── */
function gd(k){ try{ return JSON.parse(localStorage.getItem('bcso2_'+k)||'null'); }catch(e){ return null; } }
function sd(k,v){ localStorage.setItem('bcso2_'+k, JSON.stringify(v)); }

/* ── İlk veri yükleme ── */
function initData(){
  var existing = gd('pers');
  if(existing){
    var changed = false;
    existing.forEach(function(p){
      if(p.username==='admin' && !p.isAdmin){ p.isAdmin=true; changed=true; }
      if(p.isAdmin===undefined){ p.isAdmin=false; changed=true; }
    });
    if(changed) sd('pers', existing);
  }
  if(!gd('pers')) sd('pers',[
    {id:1,username:'admin',   password:'admin123', name:'Jack Stone',    rank:'Sheriff',      unit:'Patrol Division',  badge:'#0001',discord:'jackstone#0001', online:true, warns:0,duties:14,isAdmin:true, photo:''},
    {id:2,username:'usheriff',password:'under123', name:'Maria Reyes',   rank:'Under Sheriff',unit:'Patrol Division',  badge:'#0012',discord:'maria#0012',    online:true, warns:0,duties:9, isAdmin:false,photo:''},
    {id:3,username:'sgt',     password:'sgt123',   name:'Daniel Bullock',rank:'Sergeant II',  unit:'Patrol Division',  badge:'#7520',discord:'bullock#7520',  online:false,warns:1,duties:22,isAdmin:false,photo:''},
    {id:4,username:'dep1',    password:'dep123',   name:'Alex Walker',   rank:'Deputy',       unit:'Patrol Division',  badge:'#8801',discord:'walker#8801',   online:true, warns:0,duties:7, isAdmin:false,photo:''},
    {id:5,username:'cadet1',  password:'cadet123', name:'James Park',    rank:'Cadet',        unit:'Training Academy', badge:'#9901',discord:'jpark#9901',    online:true, warns:0,duties:3, isAdmin:false,photo:''},
  ]);
  if(!gd('docs'))         sd('docs',[]);
  if(!gd('leaves'))       sd('leaves',[]);
  if(!gd('promos'))       sd('promos',[]);
  if(!gd('warns'))        sd('warns',[]);
  if(!gd('duties'))       sd('duties',[]);
  if(!gd('dutylog'))      sd('dutylog',[]);
  if(!gd('actlog'))       sd('actlog',[]);
  if(!gd('chat'))         sd('chat',{});
  if(!gd('announce'))     sd('announce',{});
  if(!gd('notifs'))       sd('notifs',[]);
  if(!gd('nextId'))       sd('nextId',6);
  if(!gd('applies'))      sd('applies',[]);
  if(!gd('complaints'))   sd('complaints',[]);
  if(!gd('praises'))      sd('praises',[]);
  if(!gd('tickets'))      sd('tickets',[]);
  if(!gd('announceMode')) sd('announceMode',{active:false,message:''});
  if(!gd('mesai'))        sd('mesai',[]);
  if(!gd('hq'))           sd('hq',[]);
  if(!gd('gallery'))      sd('gallery',[]);
}

var CU = null;
var darkMode = true;
var curAdminTab  = 'applies';
var curUnitTab   = 'members';
var curDocTab    = 'write';
var mesaiTimer   = null;
var mesaiStart   = null;

/* FIX: script.js'ten çağrılabilir logout fonksiyonu */
function panelLogout(){ CU = null; }

/* ── Giriş / Çıkış ── */
function doLogin(){
  var u = document.getElementById('lu').value.trim();
  var p = document.getElementById('lp').value.trim();
  var found = (gd('pers')||[]).find(function(x){ return x.username===u && x.password===p; });
  if(!found){ document.getElementById('lerr').textContent='❌ Hatalı kullanıcı adı veya şifre.'; return; }
  if(found.isAdmin===undefined) found.isAdmin = (found.username==='admin');
  CU = found;
  document.getElementById('lerr').textContent='';
  logAct('Sisteme giriş yapıldı.');
  showDash();
}

function doLogout(){
  /* FIX: Mesai timer açıksa kapat */
  if(mesaiStart){ endMesai(); }
  stopTimerDisplay();
  logAct('Sistemden çıkış yapıldı.');
  CU = null;
  showPScreen('login');
  var lu=document.getElementById('lu'); if(lu) lu.value='';
  var lp=document.getElementById('lp'); if(lp) lp.value='';
}

/* FIX: Sayfa kapanırken timer temizle */
window.addEventListener('beforeunload', function(){
  stopTimerDisplay();
});

function changePass(){
  var op=document.getElementById('old-pass').value;
  var np=document.getElementById('new-pass2').value;
  var al=document.getElementById('pass-alert');
  if(op!==CU.password){al.innerHTML='<div class="alert alert-err">Mevcut şifre hatalı.</div>';return;}
  if(np.length<4){al.innerHTML='<div class="alert alert-err">En az 4 karakter olmalı.</div>';return;}
  var pers=gd('pers')||[];
  var idx=pers.findIndex(function(x){return x.id===CU.id;});
  pers[idx].password=np; CU.password=np; sd('pers',pers);
  al.innerHTML='<div class="alert alert-ok">✔ Şifre güncellendi.</div>';
  logAct('Şifre değiştirildi.');
  setTimeout(function(){al.innerHTML='';},2500);
}

/* ── Ekran geçişleri ── */
function showPScreen(s){
  document.querySelectorAll('.pscreen').forEach(function(e){e.style.display='none';});
  var el=document.getElementById('screen-'+s);
  if(el) el.style.display='block';
}
function showDash(){
  showPScreen('dash');
  document.getElementById('tn').textContent=CU.name;
  var rankLabel = CU.rank + (CU.isAdmin ? ' · 🔴 ADMİN' : '');
  document.getElementById('tr').textContent=rankLabel;
  buildSidebar();
  showTab('home');
  updateNotifCount();
  checkAnnounceMode();
}

/* ── Tema ── */
function toggleTheme(){
  darkMode=!darkMode;
  document.body.classList.toggle('light',!darkMode);
  var btn=document.getElementById('theme-btn');
  if(btn) btn.textContent=darkMode?'☀️ Aydınlık':'🌙 Karanlık';
}

/* ── Bildirimler ── */
function addNotif(msg){
  var notifs=gd('notifs')||[];
  notifs.unshift({msg:msg,time:new Date().toLocaleTimeString('tr-TR'),read:false});
  if(notifs.length>30) notifs=notifs.slice(0,30);
  sd('notifs',notifs); updateNotifCount();
}
function updateNotifCount(){
  var n=(gd('notifs')||[]).filter(function(x){return !x.read;}).length;
  var el=document.getElementById('nc');
  if(el){el.style.display=n?'flex':'none'; el.textContent=n;}
}
function toggleNotif(){
  var p=document.getElementById('notif-panel');
  if(!p) return;
  var open=p.classList.toggle('open');
  if(open){
    var notifs=gd('notifs')||[];
    notifs.forEach(function(n){n.read=true;}); sd('notifs',notifs); updateNotifCount();
    var list=document.getElementById('notif-list');
    list.innerHTML=notifs.length
      ? notifs.map(function(n){return '<div class="notif-item"><div>'+n.msg+'</div><div class="notif-time">'+n.time+'</div></div>';}).join('')
      : '<div class="empty">Bildirim yok.</div>';
  }
}
function clearNotifs(){ sd('notifs',[]); updateNotifCount(); var p=document.getElementById('notif-panel'); if(p) p.classList.remove('open'); }

/* ── Aktivite logu ── */
function logAct(msg){
  if(!CU) return;
  var log=gd('actlog')||[];
  log.unshift({user:CU.name,rank:CU.rank,msg:msg,time:new Date().toLocaleString('tr-TR')});
  if(log.length>200) log=log.slice(0,200);
  sd('actlog',log);
}
function renderActLog(){
  var log=gd('actlog')||[];
  var q=(document.getElementById('act-search')||{}).value||'';
  if(q) log=log.filter(function(l){return (l.user+l.msg).toLowerCase().includes(q.toLowerCase());});
  document.getElementById('act-log-list').innerHTML=log.length
    ?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kullanıcı</th><th>Rütbe</th><th>İşlem</th><th>Zaman</th></tr></thead><tbody>'+
      log.map(function(l){return '<tr><td>'+l.user+'</td><td><span class="badge b-gold">'+l.rank+'</span></td><td style="color:var(--muted);font-size:11px">'+l.msg+'</td><td style="font-size:10px;color:var(--muted)">'+l.time+'</td></tr>';}).join('')+
      '</tbody></table></div>'
    :'<div class="empty">Aktivite kaydı yok.</div>';
}

/* ── Sidebar ── */
function buildSidebar(){
  var isCmd = RL[CU.rank]>=RL['Sergeant I'];
  var isHigh= RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin;
  var pendLeave=(gd('leaves')||[]).filter(function(l){return l.status==='Bekliyor';}).length;
  var pendPromo=(gd('promos')||[]).filter(function(p){return p.status==='Bekliyor';}).length;
  var pendApply=(gd('applies')||[]).filter(function(a){return a.status==='Bekliyor';}).length;
  var pendComp =(gd('complaints')||[]).filter(function(c){return c.status==='Bekliyor';}).length;
  var pendTick =(gd('tickets')||[]).filter(function(t){return t.status==='Bekliyor';}).length;
  var sb=document.getElementById('sidebar');
  sb.innerHTML='';
  var items=[
    {sec:'Genel'},
    {tab:'home',      icon:'🏠', label:'Anasayfa'},
    {tab:'profile',   icon:'👤', label:'Profilim'},
    {tab:'mesai',     icon:'⏱', label:'Mesai'},
    {sec:'Birim'},
    {tab:'unit',      icon:'👥', label:'Birimim'},
    {tab:'docs',      icon:'📄', label:'Belgeler'},
    {tab:'dutylog',   icon:'📋', label:'Görev Logu'},
  ];
  if(isCmd){
    items.push({sec:'Komuta'});
    items.push({tab:'leave',      icon:'🏖', label:'İzin',      badge:pendLeave});
    items.push({tab:'discipline', icon:'⚠️', label:'Disiplin'});
    items.push({tab:'promotion',  icon:'⬆️', label:'Terfi',     badge:pendPromo});
  }
  if(isHigh){
    items.push({tab:'personnel',  icon:'🗂', label:'Personel'});
    items.push({tab:'actlog',     icon:'🔍', label:'Aktivite Logu'});
  }
  if(CU.isAdmin){
    var dmData=gd('dm')||{};
    var unreadDM=0;
    Object.keys(dmData).forEach(function(k){
      (dmData[k]||[]).forEach(function(m){ if(!m.read&&m.from!==CU.id) unreadDM++; });
    });
    items.push({sec:'Admin'});
    items.push({tab:'admin',icon:'🔴',label:'Admin Paneli',badge:(pendApply+pendComp+pendTick+unreadDM)||0});
  }
  items.forEach(function(item){
    if(item.sec){
      var s=document.createElement('div'); s.className='sb-sec'; s.textContent=item.sec; sb.appendChild(s);
    } else {
      var b=document.createElement('button'); b.className='sb-btn'; b.setAttribute('data-tab',item.tab);
      b.innerHTML=item.icon+' '+item.label+(item.badge?'<span class="sb-badge">'+item.badge+'</span>':'');
      b.onclick=function(){showTab(item.tab);};
      sb.appendChild(b);
    }
  });
}

function showTab(t){
  if(t==='admin'&&!CU.isAdmin) return;
  document.querySelectorAll('.tab').forEach(function(e){e.classList.remove('active');});
  document.querySelectorAll('.sb-btn').forEach(function(b){b.classList.remove('active');});
  var el=document.getElementById('tab-'+t); if(el) el.classList.add('active');
  var btn=document.querySelector('[data-tab="'+t+'"]'); if(btn) btn.classList.add('active');
  var renders={
    home:renderHome, profile:renderProfile, mesai:renderMesai,
    unit:renderUnit, docs:renderDocs, leave:renderLeave,
    dutylog:renderDutyLog, discipline:renderDisc, promotion:renderPromo,
    personnel:renderPersonnel, actlog:renderActLog, admin:renderAdmin
  };
  if(renders[t]) renders[t]();
}

/* ── Anasayfa ── */
function renderHome(){
  var pers=gd('pers')||[];
  var log=gd('dutylog')||[];
  var mesai=gd('mesai')||[];
  var toplam=mesai.reduce(function(s,m){return s+(m.sure||0);},0);
  var sg=document.getElementById('sg');
  sg.innerHTML=sc(pers.filter(function(p){return p.online;}).length,'Çevrimiçi')+
               sc(pers.length,'Toplam Personel')+
               sc(log.filter(function(l){return l.userId===CU.id;}).length,'Görevlerim')+
               sc(Math.round(toplam/60),'Toplam Mesai (s)');
  var items=[];
  if(CU.isAdmin){
    var pA=(gd('applies')||[]).filter(function(a){return a.status==='Bekliyor';});
    var pC=(gd('complaints')||[]).filter(function(c){return c.status==='Bekliyor';});
    var pT=(gd('tickets')||[]).filter(function(t){return t.status==='Bekliyor';});
    pA.forEach(function(a){items.push({text:a.name+' — başvuru',color:'b-gold'});});
    pC.forEach(function(c){items.push({text:c.name+' — şikayet',color:'b-red'});});
    pT.forEach(function(t){items.push({text:t.name+' — destek talebi',color:'b-blue'});});
  }
  (gd('promos')||[]).filter(function(p){return p.status==='Bekliyor'&&(RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin);})
    .forEach(function(p){items.push({text:p.targetName+' — terfi teklifi',color:'b-warn'});});
  document.getElementById('pending-list').innerHTML=items.length
    ? items.map(function(i){return '<div class="pcard" style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem;padding:.75rem"><span class="badge '+i.color+'">●</span><span style="font-size:13px">'+i.text+'</span></div>';}).join('')
    : '<div class="empty">Bekleyen işlem yok.</div>';
  var recent=(gd('actlog')||[]).slice(0,8);
  document.getElementById('recent-act').innerHTML=recent.length
    ? recent.map(function(l){return '<div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--brown2);font-size:12px"><span style="color:var(--muted)">'+l.user+': '+l.msg+'</span><span style="color:var(--muted);font-size:10px">'+l.time+'</span></div>';}).join('')
    : '<div class="empty">Aktivite yok.</div>';
}
function sc(n,l){ return '<div class="stat-card"><div class="stat-num">'+n+'</div><div class="stat-label">'+l+'</div></div>'; }

/* ═══════════════════════════════════════
   MESAİ SİSTEMİ
   ═══════════════════════════════════════ */
function renderMesai(){
  var mesai=gd('mesai')||[];
  var aktif=mesai.find(function(m){return m.userId===CU.id&&m.bitis===null;});
  var btn=document.getElementById('mesai-btn');
  var status=document.getElementById('mesai-status');
  var timer=document.getElementById('mesai-timer');
  if(aktif){
    if(btn){ btn.textContent='Mesaiden Çık'; btn.style.background='var(--danger)'; btn.style.color='#fff'; }
    if(status){ status.innerHTML='<span class="badge b-green">● Mesaide</span>'; }
    mesaiStart=aktif.baslangic;
    startTimerDisplay();
  } else {
    if(btn){ btn.textContent='Mesaiye Başla'; btn.style.background=''; btn.style.color=''; }
    if(status){ status.innerHTML='<span class="badge b-muted">● Dışarıda</span>'; }
    if(timer) timer.textContent='00:00:00';
    stopTimerDisplay();
  }
  var mine=mesai.filter(function(m){return m.userId===CU.id&&m.bitis!==null;});
  var toplamDk=mine.reduce(function(s,m){return s+(m.sure||0);},0);
  var th=Math.floor(toplamDk/60); var tm=toplamDk%60;
  document.getElementById('mesai-toplam').textContent=th+'s '+tm+'dk';
  var list=document.getElementById('mesai-list');
  list.innerHTML=mine.length
    ?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Başlangıç</th><th>Bitiş</th><th>Süre</th></tr></thead><tbody>'+
      mine.slice().reverse().slice(0,20).map(function(m){
        var s=Math.floor(m.sure/60)+'s '+(m.sure%60)+'dk';
        return '<tr><td style="font-size:11px">'+m.baslangicStr+'</td><td style="font-size:11px">'+m.bitisStr+'</td><td><span class="badge b-gold">'+s+'</span></td></tr>';
      }).join('')+'</tbody></table></div>'
    :'<div class="empty">Mesai kaydı yok.</div>';
  var admSec=document.getElementById('mesai-admin-section');
  if(admSec) admSec.style.display=(CU.isAdmin||RL[CU.rank]>=RL['Under Sheriff'])?'block':'none';
  renderMesaiAdmin();
}
function startMesai(){
  var mesai=gd('mesai')||[];
  var aktif=mesai.find(function(m){return m.userId===CU.id&&m.bitis===null;});
  if(aktif){ endMesai(); return; }
  var now=Date.now();
  var nowStr=new Date().toLocaleString('tr-TR');
  mesai.push({id:now,userId:CU.id,userName:CU.name,rank:CU.rank,unit:CU.unit,baslangic:now,baslangicStr:nowStr,bitis:null,bitisStr:null,sure:0});
  sd('mesai',mesai); mesaiStart=now;
  logAct('Mesai başlatıldı.'); addNotif('Mesai başlatıldı.'); renderMesai();
}
function endMesai(){
  var mesai=gd('mesai')||[];
  var idx=mesai.findIndex(function(m){return m.userId===CU.id&&m.bitis===null;});
  if(idx===-1) return;
  var now=Date.now();
  var sure=Math.round((now-mesai[idx].baslangic)/60000);
  mesai[idx].bitis=now; mesai[idx].bitisStr=new Date().toLocaleString('tr-TR'); mesai[idx].sure=sure;
  sd('mesai',mesai); mesaiStart=null; stopTimerDisplay();
  logAct('Mesai sonlandırıldı. Süre: '+Math.floor(sure/60)+'s '+(sure%60)+'dk');
  addNotif('Mesai sonlandırıldı: '+Math.floor(sure/60)+'s '+(sure%60)+'dk');
  renderMesai();
}
function startTimerDisplay(){
  stopTimerDisplay();
  mesaiTimer=setInterval(function(){
    var timer=document.getElementById('mesai-timer'); if(!timer||!mesaiStart) return;
    var diff=Math.floor((Date.now()-mesaiStart)/1000);
    var h=Math.floor(diff/3600); var m=Math.floor((diff%3600)/60); var s=diff%60;
    timer.textContent=(h<10?'0':'')+h+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  },1000);
}
/* FIX: clearInterval garantili */
function stopTimerDisplay(){ if(mesaiTimer){ clearInterval(mesaiTimer); mesaiTimer=null; } }

function renderMesaiAdmin(){
  var el=document.getElementById('mesai-admin-list'); if(!el) return;
  var mesai=gd('mesai')||[]; var pers=gd('pers')||[];
  var ozet={};
  pers.forEach(function(p){
    var mine=mesai.filter(function(m){return m.userId===p.id;});
    var aktif=mine.find(function(m){return m.bitis===null;});
    var toplamDk=mine.filter(function(m){return m.bitis!==null;}).reduce(function(s,m){return s+(m.sure||0);},0);
    ozet[p.id]={name:p.name,rank:p.rank,unit:p.unit,badge:p.badge,toplam:toplamDk,aktif:!!aktif};
  });
  var sorted=Object.values(ozet).sort(function(a,b){return b.toplam-a.toplam;});
  el.innerHTML='<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Personel</th><th>Rütbe</th><th>Birim</th><th>Toplam Mesai</th><th>Durum</th></tr></thead><tbody>'+
    sorted.map(function(p){
      var h=Math.floor(p.toplam/60); var m2=p.toplam%60;
      return '<tr><td><b>'+p.name+'</b></td><td><span class="badge b-gold">'+p.rank+'</span></td><td style="font-size:11px;color:var(--muted)">'+p.unit+'</td><td><span class="badge b-blue">'+h+'s '+m2+'dk</span></td><td>'+(p.aktif?'<span class="badge b-green">● Mesaide</span>':'<span class="badge b-muted">Dışarıda</span>')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
}

/* ═══════════════════════════════════════
   ADMİN PANELİ
   ═══════════════════════════════════════ */
function renderAdmin(){
  if(!CU.isAdmin) return;
  adminTab(curAdminTab, null);
}

function adminTab(t,btn){
  curAdminTab=t;
  ['applies','complaints','praises','tickets','personnel','hq','galeri','dm','settings'].forEach(function(x){
    var el=document.getElementById('adm-'+x); if(el) el.style.display=(x===t?'block':'none');
  });
  document.querySelectorAll('#tab-admin .tab-sw-btn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  else {
    var tList=['applies','complaints','praises','tickets','personnel','hq','galeri','dm','settings'];
    var all=document.querySelectorAll('#tab-admin .tab-sw-btn');
    var idx=tList.indexOf(t);
    if(all[idx]) all[idx].classList.add('active');
  }
  if(t==='applies')    renderAdminApplies();
  if(t==='complaints') renderAdminComplaints();
  if(t==='praises')    renderAdminPraises();
  if(t==='tickets')    renderAdminTickets();
  if(t==='personnel')  { renderAdminPersonnel(); fillAdminRankSelect('a-nr'); }
  if(t==='hq')         renderAdminHQ();
  if(t==='galeri')     renderAdminGallery();
  if(t==='dm')         renderAdminDM();
  if(t==='settings')   renderAdminSettings();
}

/* Başvurular */
function renderAdminApplies(){
  var applies=gd('applies')||[];
  var el=document.getElementById('adm-applies-list'); if(!el) return;
  var pend=applies.filter(function(a){return a.status==='Bekliyor';});
  var done=applies.filter(function(a){return a.status!=='Bekliyor';});
  var all=[].concat(pend,done);
  if(!all.length){el.innerHTML='<div class="empty">Henüz başvuru yok.</div>';return;}
  el.innerHTML=all.map(function(a){
    var sb=a.status==='Onaylandı'?'<span class="badge b-green">Onaylandı</span>':a.status==='Reddedildi'?'<span class="badge b-red">Reddedildi</span>':'<span class="badge b-warn">Bekliyor</span>';
    var act=a.status==='Bekliyor'?'<button class="act-btn green" onclick="approveApply('+a.id+')">Onayla</button><button class="act-btn red" onclick="rejectApply('+a.id+')">Reddet</button>':'';
    return '<div class="pcard" style="margin-bottom:.75rem">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">'+
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:18px;letter-spacing:1px">'+a.name+'</div>'+
        '<div style="display:flex;gap:6px;align-items:center">'+sb+act+'</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;margin-bottom:.5rem">'+
        '<div><div class="pi-lbl">Discord</div><div style="font-size:12px;color:var(--gold)">'+(a.discord||'-')+'</div></div>'+
        '<div><div class="pi-lbl">Başvurduğu Birim</div><div style="font-size:12px">'+(a.unit||'-')+'</div></div>'+
        '<div><div class="pi-lbl">FiveM Deneyim</div><div style="font-size:12px">'+(a.experience||'-')+'</div></div>'+
      '</div>'+
      '<div style="background:var(--bg3);border-radius:4px;padding:.6rem .75rem;margin-bottom:.4rem;font-size:12px;color:var(--muted)"><b style="color:var(--text)">Neden BCSO:</b> '+(a.reason||'-')+'</div>'+
      '<div style="background:var(--bg3);border-radius:4px;padding:.6rem .75rem;font-size:12px;color:var(--muted)"><b style="color:var(--text)">RP Deneyimi:</b> '+(a.rpExp||'-')+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:.5rem">📅 '+a.date+(a.reviewedBy?' &nbsp;·&nbsp; İnceleyen: '+a.reviewedBy:'')+'</div>'+
    '</div>';
  }).join('');
}
function approveApply(id){
  var applies=gd('applies')||[];
  var a=applies.find(function(x){return x.id===id;});
  if(a){a.status='Onaylandı';a.reviewedBy=CU.name;a.reviewDate=new Date().toLocaleDateString('tr-TR');}
  sd('applies',applies); logAct('Başvuru onaylandı: '+(a?a.name:'')); addNotif((a?a.name:'')+' başvurusu onaylandı ✔');
  renderAdminApplies(); buildSidebar();
}
function rejectApply(id){
  var applies=gd('applies')||[];
  var a=applies.find(function(x){return x.id===id;});
  if(a){a.status='Reddedildi';a.reviewedBy=CU.name;a.reviewDate=new Date().toLocaleDateString('tr-TR');}
  sd('applies',applies); logAct('Başvuru reddedildi: '+(a?a.name:'')); renderAdminApplies(); buildSidebar();
}

/* Şikayetler */
function renderAdminComplaints(){
  var complaints=gd('complaints')||[];
  var el=document.getElementById('adm-complaints-list'); if(!el) return;
  if(!complaints.length){el.innerHTML='<div class="empty">Şikayet yok.</div>';return;}
  var pend=complaints.filter(function(c){return c.status==='Bekliyor';});
  var done=complaints.filter(function(c){return c.status!=='Bekliyor';});
  el.innerHTML=[].concat(pend,done).map(function(c){
    var sb=c.status==='İncelendi'?'<span class="badge b-green">İncelendi</span>':c.status==='Reddedildi'?'<span class="badge b-muted">Reddedildi</span>':'<span class="badge b-red">Bekliyor</span>';
    var act=c.status==='Bekliyor'?'<button class="act-btn green" onclick="approveComplaint('+c.id+')">İncele</button><button class="act-btn red" onclick="rejectComplaint('+c.id+')">Reddet</button>':'';
    return '<div class="pcard" style="margin-bottom:.75rem">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem">'+
        '<div><div style="font-family:\'Bebas Neue\',sans-serif;font-size:16px">'+c.name+'</div>'+
        '<div style="font-size:11px;color:var(--muted)">Şikayet Edilen: <b style="color:var(--danger)">'+c.target+'</b></div></div>'+
        '<div style="display:flex;gap:6px">'+sb+act+'</div></div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.5rem">'+
        '<div><div class="pi-lbl">Olay Tarihi</div><div style="font-size:12px">'+(c.date||'-')+'</div></div>'+
        '<div><div class="pi-lbl">Olay Yeri</div><div style="font-size:12px">'+(c.location||'-')+'</div></div>'+
      '</div>'+
      '<div style="background:var(--bg3);border-radius:4px;padding:.6rem .75rem;font-size:12px;color:var(--muted)"><b style="color:var(--text)">Açıklama:</b> '+(c.desc||'-')+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:.5rem">📅 '+c.submitDate+(c.reviewedBy?' &nbsp;·&nbsp; İnceleyen: '+c.reviewedBy:'')+'</div>'+
    '</div>';
  }).join('');
}
function approveComplaint(id){ var list=gd('complaints')||[]; var c=list.find(function(x){return x.id===id;}); if(c){c.status='İncelendi';c.reviewedBy=CU.name;} sd('complaints',list); logAct('Şikayet incelendi: '+(c?c.name:'')); renderAdminComplaints(); buildSidebar(); }
function rejectComplaint(id){ var list=gd('complaints')||[]; var c=list.find(function(x){return x.id===id;}); if(c){c.status='Reddedildi';c.reviewedBy=CU.name;} sd('complaints',list); logAct('Şikayet reddedildi.'); renderAdminComplaints(); buildSidebar(); }

/* Övgüler */
function renderAdminPraises(){
  var praises=gd('praises')||[];
  var el=document.getElementById('adm-praises-list'); if(!el) return;
  if(!praises.length){el.innerHTML='<div class="empty">Övgü formu yok.</div>';return;}
  el.innerHTML=praises.map(function(p){
    return '<div class="pcard" style="margin-bottom:.75rem">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">'+
        '<div><b>'+p.name+'</b> → <span style="color:var(--success)">'+p.target+'</span></div>'+
        '<span class="badge b-green">✔ Övgü</span></div>'+
      '<div style="background:var(--bg3);border-radius:4px;padding:.6rem .75rem;font-size:12px;color:var(--muted)">'+p.desc+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:.4rem">📅 '+p.date+'</div>'+
    '</div>';
  }).join('');
}

/* ── YENİ: Ticket (Destek Talebi) Yönetimi ── */
function renderAdminTickets(){
  var tickets=gd('tickets')||[];
  var el=document.getElementById('adm-tickets-list'); if(!el) return;
  if(!tickets.length){el.innerHTML='<div class="empty">Destek talebi yok.</div>';return;}
  var pend=tickets.filter(function(t){return t.status==='Bekliyor';});
  var done=tickets.filter(function(t){return t.status!=='Bekliyor';});
  el.innerHTML=[].concat(pend,done).map(function(t){
    var sb=t.status==='Yanıtlandı'?'<span class="badge b-green">Yanıtlandı</span>':t.status==='Kapatıldı'?'<span class="badge b-muted">Kapatıldı</span>':'<span class="badge b-blue">Bekliyor</span>';
    var replyBox=t.status==='Bekliyor'?
      '<div style="margin-top:.75rem;display:flex;gap:.5rem">'+
        '<input type="text" id="treply-'+t.id+'" placeholder="Yanıtınızı yazın..." style="flex:1;background:var(--bg3);border:1px solid var(--brown);border-radius:4px;padding:7px 10px;color:var(--text);font-size:12px;outline:none">'+
        '<button class="act-btn green" onclick="replyTicket('+t.id+')">Yanıtla</button>'+
        '<button class="act-btn red" onclick="closeTicket('+t.id+')">Kapat</button>'+
      '</div>':
      (t.reply?'<div style="margin-top:.5rem;background:rgba(106,170,90,.08);border:1px solid rgba(106,170,90,.2);border-radius:4px;padding:.6rem .75rem;font-size:12px"><b style="color:var(--success)">Yanıt:</b> '+t.reply+'</div>':'');
    return '<div class="pcard" style="margin-bottom:.75rem">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">'+
        '<div>'+
          '<span class="badge b-blue" style="margin-right:.5rem">'+(t.category||'Genel')+'</span>'+
          '<b>'+t.subject+'</b>'+
          '<div style="font-size:11px;color:var(--muted);margin-top:2px">'+t.name+(t.discord?' · '+t.discord:'')+'</div>'+
        '</div>'+
        sb+
      '</div>'+
      '<div style="background:var(--bg3);border-radius:4px;padding:.6rem .75rem;font-size:12px;color:var(--muted)">'+t.desc+'</div>'+
      '<div style="font-size:10px;color:var(--muted);margin-top:.4rem">📅 '+t.date+'</div>'+
      replyBox+
    '</div>';
  }).join('');
}
function replyTicket(id){
  var inp=document.getElementById('treply-'+id); if(!inp||!inp.value.trim()) return;
  var tickets=gd('tickets')||[];
  var t=tickets.find(function(x){return x.id===id;});
  if(t){t.status='Yanıtlandı';t.reply=inp.value.trim();t.repliedBy=CU.name;t.replyDate=new Date().toLocaleDateString('tr-TR');}
  sd('tickets',tickets); logAct('Destek talebi yanıtlandı: '+(t?t.subject:'')); addNotif('Ticket yanıtlandı: '+(t?t.subject:''));
  renderAdminTickets(); buildSidebar();
}
function closeTicket(id){
  var tickets=gd('tickets')||[];
  var t=tickets.find(function(x){return x.id===id;});
  if(t){t.status='Kapatıldı';t.closedBy=CU.name;}
  sd('tickets',tickets); logAct('Destek talebi kapatıldı.'); renderAdminTickets(); buildSidebar();
}

/* ── YENİ: BCSO HQ Yönetimi ── */
function addHQPost(){
  var title   = (document.getElementById('hq-title')       ||{}).value||'';
  var content = (document.getElementById('hq-content-inp') ||{}).value||'';
  var imgUrl  = (document.getElementById('hq-img-url')     ||{}).value||'';
  var type    = (document.getElementById('hq-type')        ||{}).value||'haber';
  title=title.trim(); content=content.trim();
  if(!title||!content){alert('Başlık ve içerik zorunludur.');return;}
  var posts=gd('hq')||[];
  posts.push({id:Date.now(),title:title,content:content,imgUrl:imgUrl.trim(),type:type,author:CU.name,date:new Date().toLocaleDateString('tr-TR')});
  sd('hq',posts);
  logAct('HQ haberi yayınlandı: '+title); addNotif('Yeni HQ haberi: '+title);
  ['hq-title','hq-content-inp','hq-img-url'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
  renderAdminHQ();
  alert('✔ Haber yayınlandı!');
}
function renderAdminHQ(){
  var posts=gd('hq')||[];
  var el=document.getElementById('adm-hq-list'); if(!el) return;
  if(!posts.length){el.innerHTML='<div class="empty">Henüz haber yok.</div>';return;}
  el.innerHTML=posts.slice().reverse().map(function(p){
    return '<div class="pcard" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">'+
      '<div>'+
        '<span class="badge b-gold" style="margin-right:.5rem">'+p.type+'</span>'+
        '<b>'+p.title+'</b>'+
        '<div style="font-size:10px;color:var(--muted);margin-top:2px">'+p.author+' · '+p.date+'</div>'+
      '</div>'+
      '<button class="act-btn red" onclick="deleteHQPost('+p.id+')">Sil</button>'+
    '</div>';
  }).join('');
}
function deleteHQPost(id){
  if(!confirm('Bu haberi silmek istiyor musunuz?')) return;
  var posts=gd('hq')||[];
  sd('hq',posts.filter(function(p){return p.id!==id;}));
  logAct('HQ haberi silindi.'); renderAdminHQ();
}

/* ── YENİ: Galeri Yönetimi ── */
function addGalleryPhoto(){
  var url   = (document.getElementById('gal-url')  ||{}).value||'';
  var title = (document.getElementById('gal-title')||{}).value||'';
  var desc  = (document.getElementById('gal-desc') ||{}).value||'';
  url=url.trim(); title=title.trim();
  if(!url){alert('Görsel URL zorunludur.');return;}
  var photos=gd('gallery')||[];
  photos.push({id:Date.now(),url:url,title:title,desc:desc.trim(),author:CU.name,date:new Date().toLocaleDateString('tr-TR')});
  sd('gallery',photos);
  logAct('Galeriye fotoğraf eklendi: '+title); addNotif('Galeriye yeni fotoğraf eklendi');
  ['gal-url','gal-title','gal-desc'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
  renderAdminGallery();
  alert('✔ Fotoğraf eklendi!');
}
function renderAdminGallery(){
  var photos=gd('gallery')||[];
  var el=document.getElementById('adm-gallery-list'); if(!el) return;
  if(!photos.length){el.innerHTML='<div style="color:var(--muted);font-size:12px;padding:1rem">Henüz fotoğraf eklenmemiş.</div>';return;}
  el.innerHTML=photos.slice().reverse().map(function(p){
    return '<div style="position:relative;background:var(--bg3);border:1px solid var(--brown);border-radius:8px;overflow:hidden">'+
      '<img src="'+p.url+'" alt="'+p.title+'" style="width:100%;height:140px;object-fit:cover" onerror="this.src=\'\'">'+
      '<div style="padding:.6rem">'+
        '<div style="font-size:12px;font-weight:600">'+p.title+'</div>'+
        '<div style="font-size:10px;color:var(--muted)">'+p.author+' · '+p.date+'</div>'+
      '</div>'+
      '<button class="act-btn red" onclick="deleteGalleryPhoto('+p.id+')" style="position:absolute;top:4px;right:4px">✕</button>'+
    '</div>';
  }).join('');
}
function deleteGalleryPhoto(id){
  if(!confirm('Bu fotoğrafı silmek istiyor musunuz?')) return;
  var photos=gd('gallery')||[];
  sd('gallery',photos.filter(function(p){return p.id!==id;}));
  logAct('Galeriden fotoğraf silindi.'); renderAdminGallery();
}

/* ── YENİ: Personel fotoğrafı ayarla ── */
function adminSetPhoto(id){
  var url=prompt('Personel fotoğraf URL\'si (boş bırakırsanız temizlenir):');
  if(url===null) return;
  var pers=gd('pers')||[];
  var p=pers.find(function(x){return x.id===id;}); if(!p) return;
  p.photo=url.trim();
  sd('pers',pers); logAct(p.name+' fotoğrafı güncellendi.'); renderAdminPersonnel();
  alert('✔ Fotoğraf güncellendi!');
}

/* Admin — Personel listesi */
function renderAdminPersonnel(){
  var pers=gd('pers')||[];
  var mesai=gd('mesai')||[];
  var el=document.getElementById('adm-personnel-list'); if(!el) return;
  var q=(document.getElementById('adm-pers-search')||{}).value||'';
  if(q) pers=pers.filter(function(p){return (p.name+p.rank+p.unit).toLowerCase().includes(q.toLowerCase());});
  pers=pers.slice().sort(function(a,b){return RL[b.rank]-RL[a.rank];});
  var groups={};
  pers.forEach(function(p){ if(!groups[p.rank]) groups[p.rank]=[]; groups[p.rank].push(p); });
  var html='';
  RANKS.slice().reverse().forEach(function(rank){
    if(!groups[rank]||!groups[rank].length) return;
    html+='<div style="margin-bottom:1.5rem">'+
      '<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">'+
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:2px;color:var(--gold)">'+rank+'</div>'+
        '<span class="badge b-muted">'+groups[rank].length+' personel</span>'+
      '</div>'+
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>İsim</th><th>Birim</th><th>Rozet</th><th>Mesai</th><th>Uyarı</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>'+
      groups[rank].map(function(p){
        var mine=mesai.filter(function(m){return m.userId===p.id&&m.bitis!==null;});
        var toplamDk=mine.reduce(function(s,m){return s+(m.sure||0);},0);
        var aktif=mesai.find(function(m){return m.userId===p.id&&m.bitis===null;});
        var mh=Math.floor(toplamDk/60);
        return '<tr>'+
          '<td><b>'+p.name+'</b>'+(p.isAdmin?' <span class="badge b-red" style="font-size:9px">ADMIN</span>':'')+'</td>'+
          '<td style="font-size:11px;color:var(--muted)">'+p.unit+'</td>'+
          '<td><span class="badge b-muted">'+p.badge+'</span></td>'+
          '<td><span class="badge b-blue">'+mh+'s</span>'+(aktif?' <span class="badge b-green" style="font-size:9px">●</span>':'')+'</td>'+
          '<td><span class="badge '+(p.warns?'b-red':'b-muted')+'">'+( p.warns||0)+'</span></td>'+
          '<td>'+(p.online?'<span class="badge b-green">Aktif</span>':'<span class="badge b-muted">Pasif</span>')+'</td>'+
          '<td style="white-space:nowrap">'+
            '<button class="act-btn" onclick="adminEditRank('+p.id+')">Rütbe</button>'+
            '<button class="act-btn" onclick="adminEditUnit('+p.id+')">Birim</button>'+
            '<button class="act-btn" onclick="adminSetPhoto('+p.id+')">📷 Foto</button>'+
            '<button class="act-btn" onclick="adminChangePass('+p.id+')">Şifre</button>'+
            '<button class="act-btn '+(p.isAdmin?'red':'')+'" onclick="toggleAdminRole('+p.id+')">'+(p.isAdmin?'Admin Al':'Admin Ver')+'</button>'+
            '<button class="act-btn red" onclick="adminDelPers('+p.id+')">Sil</button>'+
          '</td></tr>';
      }).join('')+'</tbody></table></div></div>';
  });
  el.innerHTML=html||'<div class="empty">Personel bulunamadı.</div>';
}
function adminEditRank(id){
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===id;}); if(!p) return;
  var nr=prompt('Yeni rütbe:\n'+RANKS.join(', '),p.rank);
  if(!nr||!RANKS.includes(nr)){if(nr) alert('Geçersiz rütbe!'); return;}
  p.rank=nr; sd('pers',pers); logAct(p.name+' rütbesi → '+nr); renderAdminPersonnel();
}
function adminEditUnit(id){
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===id;}); if(!p) return;
  var nu=prompt('Yeni birim:\n'+UNITS.join(', '),p.unit);
  if(!nu||!UNITS.includes(nu)){if(nu) alert('Geçersiz birim!'); return;}
  p.unit=nu; sd('pers',pers); logAct(p.name+' birimi → '+nu); renderAdminPersonnel();
}
function adminChangePass(id){
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===id;}); if(!p) return;
  var np=prompt(p.name+' için yeni şifre:');
  if(!np||np.length<4){if(np) alert('En az 4 karakter.'); return;}
  p.password=np; sd('pers',pers); logAct('Admin: '+p.name+' şifresi değiştirildi.'); alert('✔ Şifre güncellendi.');
}
function adminDelPers(id){
  if(!confirm('Bu personeli silmek istiyor musunuz?')) return;
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===id;});
  sd('pers',pers.filter(function(x){return x.id!==id;})); logAct('Personel silindi: '+(p?p.name:'')); renderAdminPersonnel();
}
function toggleAdminRole(id){
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===id;}); if(!p) return;
  if(p.id===CU.id){ alert('Kendi admin yetkinizi değiştiremezsiniz.'); return; }
  p.isAdmin=!p.isAdmin; sd('pers',pers);
  logAct((p.isAdmin?'Admin yetkisi verildi: ':'Admin yetkisi alındı: ')+p.name);
  addNotif(p.name+(p.isAdmin?' artık admin ✔':' admin yetkisi alındı'));
  alert('✔ '+p.name+(p.isAdmin?' artık admin oldu.':' admin yetkisi alındı.')); renderAdminPersonnel();
}

/* FIX: Admin tab personel oluşturma — ayrı prefix'li ID'ler (a-) */
function createPersonnelAdmin(){
  var u    =document.getElementById('a-nu').value.trim();
  var n    =document.getElementById('a-nn').value.trim();
  var p    =document.getElementById('a-np').value.trim();
  var r    =document.getElementById('a-nr').value;
  var unit =document.getElementById('a-nunit').value;
  var badge=document.getElementById('a-nbadge').value.trim();
  var disc =document.getElementById('a-ndisc').value.trim();
  var al   =document.getElementById('adm-pers-alert');
  if(!u||!n||!p||!badge){if(al)al.innerHTML='<div class="alert alert-err">Tüm alanları doldurun.</div>';return;}
  var pers=gd('pers')||[];
  if(pers.find(function(x){return x.username===u;})){if(al)al.innerHTML='<div class="alert alert-err">Bu kullanıcı adı zaten var.</div>';return;}
  var id=gd('nextId')||10;
  pers.push({id:id,username:u,password:p,name:n,rank:r,unit:unit,badge:badge,discord:disc,online:false,warns:0,duties:0,isAdmin:false,photo:''});
  sd('pers',pers); sd('nextId',id+1);
  logAct('Yeni personel oluşturuldu (admin): '+n+' ('+r+')'); addNotif('Yeni personel eklendi: '+n);
  if(al){al.innerHTML='<div class="alert alert-ok">✔ '+n+' oluşturuldu.</div>'; setTimeout(function(){al.innerHTML='';},2500);}
  ['a-nu','a-nn','a-np','a-nbadge','a-ndisc'].forEach(function(x){var e=document.getElementById(x);if(e)e.value='';});
  renderAdminPersonnel();
}

/* FIX: Personel tab personel oluşturma — ayrı prefix'li ID'ler (p-) */
function createPersonnelTab(){
  var u    =document.getElementById('p-nu').value.trim();
  var n    =document.getElementById('p-nn').value.trim();
  var p    =document.getElementById('p-np').value.trim();
  var r    =document.getElementById('p-nr').value;
  var unit =document.getElementById('p-nunit').value;
  var badge=document.getElementById('p-nbadge').value.trim();
  var disc =document.getElementById('p-ndisc').value.trim();
  var al   =document.getElementById('pers-alert-tab');
  if(!u||!n||!p||!badge){if(al)al.innerHTML='<div class="alert alert-err">Tüm alanları doldurun.</div>';return;}
  var pers=gd('pers')||[];
  if(pers.find(function(x){return x.username===u;})){if(al)al.innerHTML='<div class="alert alert-err">Bu kullanıcı adı zaten var.</div>';return;}
  var id=gd('nextId')||10;
  pers.push({id:id,username:u,password:p,name:n,rank:r,unit:unit,badge:badge,discord:disc,online:false,warns:0,duties:0,isAdmin:false,photo:''});
  sd('pers',pers); sd('nextId',id+1);
  logAct('Yeni personel oluşturuldu: '+n+' ('+r+')'); addNotif('Yeni personel eklendi: '+n);
  if(al){al.innerHTML='<div class="alert alert-ok">✔ '+n+' oluşturuldu.</div>'; setTimeout(function(){al.innerHTML='';},2500);}
  ['p-nu','p-nn','p-np','p-nbadge','p-ndisc'].forEach(function(x){var e=document.getElementById(x);if(e)e.value='';});
  renderPersonnel();
}

function fillAdminRankSelect(selId){
  var sel=document.getElementById(selId); if(!sel) return;
  if(sel.options.length===0) sel.innerHTML=RANKS.map(function(r){return '<option>'+r+'</option>';}).join('');
}

/* Admin DM */
var dmTarget = null;
function renderAdminDM(){
  if(!gd('dm')) sd('dm', {});
  var pers = (gd('pers')||[]).filter(function(p){ return p.id !== CU.id; });
  var dmData = gd('dm')||{};
  var leftHTML = pers.map(function(p){
    var msgs = dmData[p.id]||[];
    var unread = msgs.filter(function(m){ return !m.read && m.from !== CU.id; }).length;
    var last = msgs.length ? msgs[msgs.length-1] : null;
    var active = dmTarget && dmTarget.id === p.id;
    return '<div onclick="selectDMTarget('+p.id+')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--brown2);cursor:pointer;background:'+(active?'rgba(232,184,75,.08)':'transparent')+'">'+
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--brown2);border:1px solid var(--brown);display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:13px;color:var(--gold);flex-shrink:0">'+p.name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase()+'</div>'+
      '<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:13px;font-weight:600;color:var(--text)">'+p.name+'</span>'+(unread?'<span style="background:var(--danger);color:#fff;border-radius:50%;width:18px;height:18px;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700">'+unread+'</span>':'')+'</div><div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(last ? last.text.slice(0,30)+(last.text.length>30?'...':'') : '<i>Mesaj yok</i>')+'</div></div>'+
    '</div>';
  }).join('');
  var rightHTML;
  if(!dmTarget){
    rightHTML = '<div style="display:flex;align-items:center;justify-content:center;height:300px;color:var(--muted);font-size:13px">← Soldan personel seçin</div>';
  } else {
    var msgs = (dmData[dmTarget.id]||[]);
    msgs.forEach(function(m){ if(m.from !== CU.id) m.read = true; });
    sd('dm', dmData);
    var msgsHTML = msgs.map(function(m){
      var mine = m.from === CU.id;
      return '<div style="display:flex;flex-direction:column;align-items:'+(mine?'flex-end':'flex-start')+';margin-bottom:10px">'+
        '<div style="font-size:10px;color:var(--muted);margin-bottom:3px">'+(mine?'Siz':dmTarget.name)+' · '+m.time+'</div>'+
        '<div style="max-width:75%;background:'+(mine?'rgba(232,184,75,.15)':'var(--bg3)')+';border:1px solid '+(mine?'rgba(232,184,75,.3)':'var(--brown)')+';border-radius:8px;padding:8px 12px;font-size:13px;line-height:1.5">'+m.text+'</div>'+
      '</div>';
    }).join('');
    rightHTML = '<div style="display:flex;flex-direction:column;height:340px">'+
      '<div style="padding:10px 14px;border-bottom:1px solid var(--brown);display:flex;align-items:center;gap:10px">'+
        '<div style="width:32px;height:32px;border-radius:50%;background:var(--brown2);border:1px solid var(--brown);display:flex;align-items:center;justify-content:center;font-family:\'Bebas Neue\',sans-serif;font-size:12px;color:var(--gold)">'+dmTarget.name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase()+'</div>'+
        '<div><div style="font-size:13px;font-weight:600">'+dmTarget.name+'</div><div style="font-size:10px;color:var(--muted)">'+dmTarget.rank+'</div></div>'+
      '</div>'+
      '<div id="dm-msgs" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column">'+(msgsHTML || '<div style="text-align:center;color:var(--muted);font-size:12px;margin-top:2rem">Henüz mesaj yok.</div>')+'</div>'+
      '<div style="display:flex;gap:8px;padding:10px;border-top:1px solid var(--brown)">'+
        '<input id="dm-inp" type="text" placeholder="Mesaj yaz..." style="flex:1;background:var(--bg3);border:1px solid var(--brown);border-radius:4px;padding:8px 12px;color:var(--text);font-size:13px;outline:none" onkeydown="if(event.key===\'Enter\')sendDM()">'+
        '<button onclick="sendDM()" style="background:var(--gold);color:#0d0a07;border:none;border-radius:4px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer">Gönder</button>'+
      '</div></div>';
  }
  document.getElementById('adm-dm').innerHTML =
    '<div style="display:grid;grid-template-columns:240px 1fr;border:1px solid var(--brown);border-radius:8px;overflow:hidden;background:var(--bg2)">'+
      '<div style="border-right:1px solid var(--brown);overflow-y:auto;max-height:400px"><div style="padding:10px 12px;border-bottom:1px solid var(--brown);font-size:10px;color:var(--gold);letter-spacing:2px;text-transform:uppercase">Personel</div>'+leftHTML+'</div>'+
      '<div>'+rightHTML+'</div></div>';
  setTimeout(function(){ var msgs = document.getElementById('dm-msgs'); if(msgs) msgs.scrollTop = msgs.scrollHeight; }, 50);
}
function selectDMTarget(id){ var pers=gd('pers')||[]; dmTarget=pers.find(function(p){return p.id===id;}); renderAdminDM(); buildSidebar(); }
function sendDM(){
  var inp=document.getElementById('dm-inp'); if(!inp||!inp.value.trim()||!dmTarget) return;
  var dmData=gd('dm')||{};
  if(!dmData[dmTarget.id]) dmData[dmTarget.id]=[];
  dmData[dmTarget.id].push({id:Date.now(),from:CU.id,fromName:CU.name,to:dmTarget.id,text:inp.value.trim(),time:new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}),read:false});
  sd('dm',dmData); addNotif(dmTarget.name+" 'e DM gönderildi."); logAct('DM gönderildi: '+dmTarget.name); inp.value=''; renderAdminDM();
}

/* Admin ayarlar */
function renderAdminSettings(){
  var mode=gd('announceMode')||{active:false,message:''};
  var el=document.getElementById('adm-announce-status'); if(el) el.textContent=mode.active?'✔ Aktif':'Pasif';
  var msgEl=document.getElementById('adm-announce-msg'); if(msgEl) msgEl.value=mode.message||'';
}
function toggleAnnounceMode(){
  var mode=gd('announceMode')||{active:false,message:''};
  var msg=(document.getElementById('adm-announce-msg')||{}).value||'';
  mode.active=!mode.active; mode.message=msg; sd('announceMode',mode);
  logAct('Duyuru modu '+(mode.active?'açıldı':'kapatıldı')+'.'); renderAdminSettings(); checkAnnounceMode();
}
function saveAnnounceMsg(){
  var msg=(document.getElementById('adm-announce-msg')||{}).value||'';
  var mode=gd('announceMode')||{active:false,message:''};
  mode.message=msg; sd('announceMode',mode); logAct('Duyuru mesajı güncellendi.'); checkAnnounceMode(); alert('✔ Duyuru mesajı güncellendi.');
}
function adminClearLog(){ if(!confirm('Tüm aktivite logları silinecek?')) return; sd('actlog',[]); logAct('Aktivite logları silindi.'); alert('✔ Loglar temizlendi.'); }
function adminResetAll(){
  if(!confirm('⚠️ TÜM VERİLER SİFİRLANACAK!')) return;
  if(!confirm('Son uyarı! Devam?')) return;
  ['pers','docs','leaves','promos','warns','duties','dutylog','actlog','chat','announce','notifs','nextId','applies','complaints','praises','tickets','announceMode','mesai','hq','gallery'].forEach(function(k){localStorage.removeItem('bcso2_'+k);});
  alert('Sıfırlandı. Sayfa yenileniyor.'); location.reload();
}
function checkAnnounceMode(){
  var mode=gd('announceMode')||{active:false,message:''};
  var existing=document.getElementById('announce-banner'); if(existing) existing.remove();
  if(mode.active&&mode.message){
    var banner=document.createElement('div'); banner.id='announce-banner';
    banner.style.cssText='background:rgba(200,146,42,0.15);border-bottom:2px solid var(--gold);padding:.75rem 1.5rem;font-size:13px;color:var(--gold);text-align:center;font-weight:600;letter-spacing:1px;';
    banner.textContent='📢 '+mode.message;
    var topbar=document.querySelector('.topbar'); if(topbar) topbar.insertAdjacentElement('afterend',banner);
  }
}

/* ═══════════════════════════════════════
   PROFİL
   ═══════════════════════════════════════ */
function renderProfile(){
  var ini=CU.name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
  var pavEl=document.getElementById('pav');
  if(pavEl) pavEl.textContent=ini;
  /* Profil fotoğrafı */
  var pavImg=document.getElementById('pav-img');
  if(pavImg){
    var pers=gd('pers')||[];
    var me=pers.find(function(p){return p.id===CU.id;});
    if(me&&me.photo){
      pavImg.src=me.photo; pavImg.style.display='block';
      if(pavEl) pavEl.textContent='';
    } else {
      pavImg.style.display='none';
      if(pavEl) pavEl.textContent=ini;
    }
  }
  document.getElementById('pname').textContent=CU.name;
  var mesai=gd('mesai')||[];
  document.getElementById('pmeta').textContent=CU.rank+' • '+CU.unit+' • '+CU.badge;
  document.getElementById('pi-rank').textContent=CU.rank;
  document.getElementById('pi-unit').textContent=CU.unit;
  document.getElementById('pi-badge').textContent=CU.badge;
  document.getElementById('pi-discord').textContent=CU.discord||'-';
  var warns=gd('warns')||[];
  document.getElementById('pi-warns').textContent=warns.filter(function(w){return w.targetId===CU.id;}).length;
  var log=gd('dutylog')||[];
  document.getElementById('pi-duties').textContent=log.filter(function(l){return l.userId===CU.id;}).length;
  var prog=Math.min(100,Math.round((RL[CU.rank]/(RANKS.length-1))*100));
  document.getElementById('rank-prog').style.width=prog+'%';
  document.getElementById('rank-prog-label').textContent='Rütbe ilerlemesi: '+CU.rank+' ('+prog+'%)';
  var docs=gd('docs')||[];
  var myDocs=docs.filter(function(d){return d.targetId===CU.id;});
  document.getElementById('my-docs-list').innerHTML=myDocs.length?myDocs.map(function(d){return docRow(d);}).join(''):'<div class="empty">Belge yok.</div>';
  renderMyDMs();
}

/* ═══════════════════════════════════════
   BİRİM
   ═══════════════════════════════════════ */
function renderUnit(){ document.getElementById('unit-title').textContent=CU.unit; unitTab(curUnitTab,null); }
function unitTab(t,btn){
  curUnitTab=t;
  ['members','stats','announce','chat','duties'].forEach(function(x){ var el=document.getElementById('unit-'+x); if(el) el.style.display=(x===t?'block':'none'); });
  document.querySelectorAll('#tab-unit .tab-sw-btn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  if(t==='members')  renderUnitMembers();
  if(t==='stats')    renderUnitStats();
  if(t==='announce') renderAnnounce();
  if(t==='chat')     renderChat();
  if(t==='duties')   renderDuties();
}
function renderUnitMembers(){
  var pers=(gd('pers')||[]).filter(function(p){return p.unit===CU.unit;});
  pers.sort(function(a,b){return RL[b.rank]-RL[a.rank];});
  document.getElementById('unit-tbody').innerHTML=pers.map(function(p){
    return '<tr><td>'+p.name+'</td><td><span class="badge b-gold">'+p.rank+'</span></td><td><span class="badge b-muted">'+p.badge+'</span></td><td>'+p.duties+'</td><td>'+(p.online?'<span class="badge b-green">Aktif</span>':'<span class="badge b-muted">Pasif</span>')+'</td></tr>';
  }).join('');
}
function renderUnitStats(){
  var pers=(gd('pers')||[]).filter(function(p){return p.unit===CU.unit;});
  var log=gd('dutylog')||[];
  var unitLog=log.filter(function(l){return pers.find(function(p){return p.id===l.userId;});});
  var sg=document.getElementById('unit-stat-grid'); if(!sg) return;
  sg.innerHTML=sc(pers.length,'Üye Sayısı')+sc(pers.filter(function(p){return p.online;}).length,'Aktif Üye')+sc(unitLog.length,'Toplam Görev')+sc(pers.reduce(function(s,p){return s+(p.warns||0);},0),'Toplam Uyarı');
}
function renderAnnounce(){
  var isCmd=RL[CU.rank]>=RL['Sergeant I']||CU.isAdmin;
  var form=document.getElementById('unit-ann-form'); if(form) form.style.display=isCmd?'block':'none';
  var ann=gd('announce')||{};
  var list=(ann[CU.unit]||[]).slice().reverse();
  document.getElementById('ann-list').innerHTML=list.length?list.map(function(a){return '<div class="pcard" style="margin-bottom:.5rem"><div style="font-weight:600;margin-bottom:.3rem">'+a.title+'</div><div style="font-size:12px;color:var(--muted)">'+a.content+'</div><div style="font-size:10px;color:var(--muted);margin-top:.4rem">'+a.author+' · '+a.date+'</div></div>';}).join(''):'<div class="empty">Duyuru yok.</div>';
}
function postAnnounce(){
  var title=document.getElementById('ann-title').value.trim(); var content=document.getElementById('ann-content').value.trim();
  if(!title||!content){alert('Başlık ve içerik boş olamaz.');return;}
  var ann=gd('announce')||{}; if(!ann[CU.unit]) ann[CU.unit]=[];
  ann[CU.unit].push({title:title,content:content,author:CU.name,date:new Date().toLocaleDateString('tr-TR')});
  sd('announce',ann); logAct('Duyuru yayınlandı: '+title);
  document.getElementById('ann-title').value=''; document.getElementById('ann-content').value=''; renderAnnounce();
}
function renderChat(){
  var chat=gd('chat')||{}; var msgs=(chat[CU.unit]||[]);
  var el=document.getElementById('chat-msgs'); if(!el) return;
  el.innerHTML=msgs.map(function(m){ var mine=m.userId===CU.id; return '<div class="chat-msg'+(mine?' mine':'')+'"><div class="chat-sender">'+m.sender+'</div><div class="chat-bubble">'+m.text+'</div></div>'; }).join('');
  el.scrollTop=el.scrollHeight;
}
function sendChat(){
  var inp=document.getElementById('chat-inp'); if(!inp||!inp.value.trim()) return;
  var chat=gd('chat')||{}; if(!chat[CU.unit]) chat[CU.unit]=[];
  chat[CU.unit].push({userId:CU.id,sender:CU.name,text:inp.value.trim(),time:new Date().toLocaleTimeString('tr-TR')});
  if(chat[CU.unit].length>100) chat[CU.unit]=chat[CU.unit].slice(-100);
  sd('chat',chat); inp.value=''; renderChat();
}
function renderDuties(){
  var duties=gd('duties')||[]; var unitDuties=duties.filter(function(d){return d.unit===CU.unit;});
  document.getElementById('duty-list').innerHTML=unitDuties.length?unitDuties.map(function(d){return '<div class="pcard" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem"><div><b>'+d.type+'</b> <span style="color:var(--muted);font-size:12px">— '+d.loc+'</span><br><span style="font-size:11px;color:var(--muted)">'+d.author+' · '+d.time+'</span></div><button class="act-btn red" onclick="endDuty('+d.id+')">Bitir</button></div>';}).join(''):'<div class="empty">Aktif görev yok.</div>';
}
function startDuty(){
  var type=document.getElementById('duty-type').value; var loc=document.getElementById('duty-loc').value.trim()||'Belirtilmedi';
  var duties=gd('duties')||[];
  duties.push({id:Date.now(),userId:CU.id,author:CU.name,unit:CU.unit,type:type,loc:loc,time:new Date().toLocaleTimeString('tr-TR')});
  sd('duties',duties); logAct('Aktif görev başlatıldı: '+type); renderDuties();
}
function endDuty(id){ sd('duties',(gd('duties')||[]).filter(function(d){return d.id!==id;})); logAct('Görev sonlandırıldı.'); renderDuties(); renderHome(); }

/* ═══════════════════════════════════════
   BELGELER
   ═══════════════════════════════════════ */
function renderDocs(){
  docTab(curDocTab,null); fillTargetSelect('doc-target');
  var tmplGrid=document.getElementById('tmpl-grid');
  if(tmplGrid) tmplGrid.innerHTML=TMPL.map(function(t,i){return '<button class="btn-sm outline" style="font-size:10px" onclick="applyTmpl('+i+')">'+t.name+'</button>';}).join('');
}
function docTab(t,btn){
  curDocTab=t;
  ['write','archive','pending'].forEach(function(x){ var el=document.getElementById('doc-'+x); if(el) el.style.display=(x===t?'block':'none'); });
  document.querySelectorAll('#tab-docs .tab-sw-btn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  if(t==='archive') renderDocArchive();
  if(t==='pending') renderDocPending();
}
function applyTmpl(i){
  var tmpl=TMPL[i]; var sel=document.getElementById('doc-target');
  var targetName=sel&&sel.options[sel.selectedIndex]?sel.options[sel.selectedIndex].text:'[Personel]';
  var text=tmpl.text.replace('{target}',targetName).replace('{date}',new Date().toLocaleDateString('tr-TR'));
  document.getElementById('doc-type').value=tmpl.type; document.getElementById('doc-content').value=text;
}
function createDoc(){
  var type=document.getElementById('doc-type').value; var sel=document.getElementById('doc-target');
  var targetId=parseInt(sel.value); var targetName=sel.options[sel.selectedIndex]?sel.options[sel.selectedIndex].text:'';
  var content=document.getElementById('doc-content').value.trim(); var privacy=document.getElementById('doc-privacy').value;
  var al=document.getElementById('doc-alert');
  if(!content||!targetName){al.innerHTML='<div class="alert alert-err">Tüm alanları doldurun.</div>';return;}
  var docs=gd('docs')||[];
  docs.push({id:Date.now(),type:type,targetId:targetId,targetName:targetName,authorId:CU.id,author:CU.name,content:content,privacy:privacy,date:new Date().toLocaleDateString('tr-TR'),status:'Bekliyor'});
  sd('docs',docs); logAct('Belge oluşturuldu: '+type+' → '+targetName);
  al.innerHTML='<div class="alert alert-ok">✔ Belge kaydedildi.</div>'; document.getElementById('doc-content').value='';
  setTimeout(function(){al.innerHTML='';},2500);
}
function previewDoc(){
  var type=document.getElementById('doc-type').value; var sel=document.getElementById('doc-target');
  var targetName=sel&&sel.options[sel.selectedIndex]?sel.options[sel.selectedIndex].text:'-';
  var content=document.getElementById('doc-content').value;
  var box=document.getElementById('doc-preview-box'); var pc=document.getElementById('doc-preview-content');
  box.style.display='block';
  pc.innerHTML='<div style="border:1px solid var(--brown);border-radius:6px;padding:1.25rem;font-size:13px;line-height:1.8">'+
    '<div style="display:flex;justify-content:space-between;margin-bottom:1rem;padding-bottom:.75rem;border-bottom:1px solid var(--brown)">'+
      '<div><b style="font-family:\'Bebas Neue\',sans-serif;letter-spacing:2px">'+type+'</b></div>'+
      '<div style="font-size:11px;color:var(--muted)">'+new Date().toLocaleDateString('tr-TR')+'</div></div>'+
    '<div style="margin-bottom:.5rem"><b>Hedef:</b> '+targetName+'</div>'+
    '<div style="margin-bottom:.5rem"><b>Yazan:</b> '+CU.name+' ('+CU.rank+')</div>'+
    '<hr style="border-color:var(--brown);margin:.75rem 0"><div>'+content.replace(/\n/g,'<br>')+'</div></div>';
}
function renderDocArchive(){
  var docs=gd('docs')||[]; var isCmd=RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin;
  var q=(document.getElementById('doc-search')||{}).value||'';
  var visible=isCmd?docs:docs.filter(function(d){return d.privacy!=='private'||d.authorId===CU.id||d.targetId===CU.id;});
  if(q) visible=visible.filter(function(d){return (d.type+d.targetName+d.author).toLowerCase().includes(q.toLowerCase());});
  document.getElementById('doc-archive-list').innerHTML=visible.length?visible.slice().reverse().map(function(d){return docRow(d);}).join(''):'<div class="empty">Belge yok.</div>';
}
function renderDocPending(){
  var docs=(gd('docs')||[]).filter(function(d){return d.status==='Bekliyor';});
  document.getElementById('doc-pending-list').innerHTML=docs.length?docs.map(function(d){return docRow(d,true);}).join(''):'<div class="empty">Onay bekleyen belge yok.</div>';
}
function approveDoc(id){ var docs=gd('docs')||[]; var d=docs.find(function(x){return x.id===id;}); if(d) d.status='Onaylandı'; sd('docs',docs); logAct('Belge onaylandı.'); renderDocPending(); }
function docRow(d,showApprove){
  var isCmd=RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin;
  return '<div class="pcard" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center">'+
    '<div><span class="badge b-gold">'+d.type+'</span> <span style="font-size:12px">→ '+d.targetName+'</span><br>'+
    '<span style="font-size:10px;color:var(--muted)">'+d.author+' · '+d.date+(d.privacy==='private'?' · 🔒 Gizli':'')+'</span></div>'+
    '<div>'+(showApprove&&isCmd?'<button class="act-btn green" onclick="approveDoc('+d.id+')">Onayla</button>':'')+'<span class="badge '+(d.status==='Onaylandı'?'b-green':'b-warn')+'">'+d.status+'</span></div>'+
  '</div>';
}

/* ═══════════════════════════════════════
   İZİN SİSTEMİ
   ═══════════════════════════════════════ */
function renderLeave(){
  var isCmd=RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin;
  var mine=(gd('leaves')||[]).filter(function(l){return l.userId===CU.id;});
  document.getElementById('leave-list').innerHTML=mine.length?mine.slice().reverse().map(function(l){return '<div class="pcard" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem"><div><b>'+l.type+'</b> <span style="color:var(--muted);font-size:12px">'+l.start+' – '+l.end+'</span></div><span class="badge '+(l.status==='Onaylandı'?'b-green':l.status==='Reddedildi'?'b-red':'b-warn')+'">'+l.status+'</span></div>';}).join(''):'<div class="empty">İzin kaydı yok.</div>';
  var sec=document.getElementById('leave-approve-section'); if(sec) sec.style.display=isCmd?'block':'none';
  if(isCmd){
    var pending=(gd('leaves')||[]).filter(function(l){return l.status==='Bekliyor';});
    document.getElementById('leave-pending-list').innerHTML=pending.length?pending.map(function(l){return '<div class="pcard" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem"><div><b>'+l.userName+'</b> — '+l.type+'<br><span style="font-size:11px;color:var(--muted)">'+l.start+' – '+l.end+'</span></div><div><button class="act-btn green" onclick="approveLeave('+l.id+',true)">Onayla</button><button class="act-btn red" onclick="approveLeave('+l.id+',false)">Reddet</button></div></div>';}).join(''):'<div class="empty">Bekleyen talep yok.</div>';
  }
}
function sendLeave(){
  var start=document.getElementById('leave-start').value; var end=document.getElementById('leave-end').value;
  var type=document.getElementById('leave-type').value; var desc=document.getElementById('leave-desc').value.trim();
  var al=document.getElementById('leave-alert');
  if(!start||!end){al.innerHTML='<div class="alert alert-err">Tarih alanları boş olamaz.</div>';return;}
  var leaves=gd('leaves')||[];
  leaves.push({id:Date.now(),userId:CU.id,userName:CU.name,type:type,start:start,end:end,desc:desc,date:new Date().toLocaleDateString('tr-TR'),status:'Bekliyor'});
  sd('leaves',leaves); logAct('İzin talebi gönderildi: '+type);
  al.innerHTML='<div class="alert alert-ok">✔ İzin talebi gönderildi.</div>';
  setTimeout(function(){al.innerHTML='';},2500); renderLeave(); buildSidebar();
}
function approveLeave(id,ok){
  var leaves=gd('leaves')||[]; var l=leaves.find(function(x){return x.id===id;}); if(l) l.status=ok?'Onaylandı':'Reddedildi';
  sd('leaves',leaves); logAct('İzin '+(ok?'onaylandı':'reddedildi')+': '+(l?l.userName:''));
  addNotif((l?l.userName:'')+' izin talebi '+(ok?'onaylandı ✔':'reddedildi ✖')); renderLeave(); buildSidebar();
}

/* ═══════════════════════════════════════
   GÖREV LOGU
   ═══════════════════════════════════════ */
function renderDutyLog(){
  var log=gd('dutylog')||[]; var q=(document.getElementById('gl-search')||{}).value||'';
  var mine=log.filter(function(d){return d.userId===CU.id;});
  if(q) mine=mine.filter(function(d){return (d.type+d.detail).toLowerCase().includes(q.toLowerCase());});
  document.getElementById('duty-log-list').innerHTML=mine.length
    ?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tür</th><th>Süre</th><th>Detay</th><th>Tarih</th></tr></thead><tbody>'+
      mine.slice().reverse().map(function(d){return '<tr><td><span class="badge b-gold">'+d.type+'</span></td><td>'+d.dur+'s</td><td style="color:var(--muted)">'+d.detail.slice(0,40)+'</td><td style="font-size:11px;color:var(--muted)">'+d.date+'</td></tr>';}).join('')+
      '</tbody></table></div>'
    :'<div class="empty">Görev kaydı yok.</div>';
}
function addDutyLog(){
  var type=document.getElementById('gl-type').value; var dur=document.getElementById('gl-dur').value||1;
  var detail=document.getElementById('gl-detail').value.trim(); if(!detail){alert('Detay boş olamaz.');return;}
  var log=gd('dutylog')||[];
  log.push({id:Date.now(),userId:CU.id,type:type,dur:dur,detail:detail,date:new Date().toLocaleDateString('tr-TR')});
  sd('dutylog',log); logAct('Görev logu eklendi: '+type+' ('+dur+'s)');
  document.getElementById('gl-detail').value=''; renderDutyLog();
}

/* ═══════════════════════════════════════
   DİSİPLİN
   ═══════════════════════════════════════ */
function renderDisc(){
  fillTargetSelect('warn-target');
  var warns=gd('warns')||[]; var isCmd=RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin;
  var visible=isCmd?warns:warns.filter(function(w){return w.targetId===CU.id||w.authorId===CU.id;});
  document.getElementById('discipline-list').innerHTML=visible.length
    ?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Personel</th><th>Tür</th><th>Neden</th><th>Veren</th><th>Tarih</th></tr></thead><tbody>'+
      visible.slice().reverse().map(function(w){return '<tr><td>'+w.targetName+'</td><td><span class="badge b-red">'+w.type+'</span></td><td style="color:var(--muted);font-size:11px">'+w.desc.slice(0,30)+'</td><td>'+w.author+'</td><td style="font-size:11px;color:var(--muted)">'+w.date+'</td></tr>';}).join('')+
      '</tbody></table></div>'
    :'<div class="empty">Disiplin kaydı yok.</div>';
}
function addWarning(){
  var targetSel=document.getElementById('warn-target'); var targetId=parseInt(targetSel.value);
  var targetName=targetSel.options[targetSel.selectedIndex]?targetSel.options[targetSel.selectedIndex].text:'';
  var type=document.getElementById('warn-type').value; var desc=document.getElementById('warn-desc').value.trim();
  var al=document.getElementById('disc-alert');
  if(!desc||!targetName){al.innerHTML='<div class="alert alert-err">Tüm alanları doldurun.</div>';return;}
  var warns=gd('warns')||[];
  warns.push({id:Date.now(),targetId:targetId,targetName:targetName,authorId:CU.id,author:CU.name,type:type,desc:desc,date:new Date().toLocaleDateString('tr-TR')});
  sd('warns',warns);
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===targetId;}); if(p){p.warns=(p.warns||0)+1; sd('pers',pers);}
  addNotif(targetName+' için "'+type+'" uyarısı verildi.'); logAct('"'+type+'" disiplin kaydı → '+targetName);
  al.innerHTML='<div class="alert alert-ok">✔ Uyarı kaydedildi.</div>'; document.getElementById('warn-desc').value='';
  setTimeout(function(){al.innerHTML='';},2500); renderDisc();
}

/* ═══════════════════════════════════════
   TERFİ
   ═══════════════════════════════════════ */
function renderPromo(){
  fillTargetSelect('promo-target');
  var rankSel=document.getElementById('promo-rank');
  if(rankSel) rankSel.innerHTML=RANKS.map(function(r){return '<option>'+r+'</option>';}).join('');
  var promos=gd('promos')||[]; var isCmd=RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin;
  document.getElementById('promo-list').innerHTML=promos.length
    ?promos.slice().reverse().map(function(p){
        var badge=p.status==='Onaylandı'?'<span class="badge b-green">Onaylandı</span>':p.status==='Reddedildi'?'<span class="badge b-red">Reddedildi</span>':isCmd?'<button class="act-btn green" onclick="approvePromo('+p.id+',true)">Onayla</button><button class="act-btn red" onclick="approvePromo('+p.id+',false)">Reddet</button>':'<span class="badge b-warn">Bekliyor</span>';
        return '<div class="pcard" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem"><div><b>'+p.targetName+'</b> → <span class="badge b-gold">'+p.newRank+'</span><br><span style="font-size:10px;color:var(--muted)">'+p.author+' önerdi · '+p.date+'</span></div><div>'+badge+'</div></div>';
      }).join('')
    :'<div class="empty">Terfi teklifi yok.</div>';
}
function sendPromo(){
  var targetSel=document.getElementById('promo-target'); var targetId=parseInt(targetSel.value);
  var targetName=targetSel.options[targetSel.selectedIndex]?targetSel.options[targetSel.selectedIndex].text:'';
  var newRank=document.getElementById('promo-rank').value; var reason=document.getElementById('promo-reason').value.trim();
  var al=document.getElementById('promo-alert');
  if(!reason||!targetName){al.innerHTML='<div class="alert alert-err">Tüm alanları doldurun.</div>';return;}
  var promos=gd('promos')||[];
  promos.push({id:Date.now(),targetId:targetId,targetName:targetName,newRank:newRank,author:CU.name,reason:reason,date:new Date().toLocaleDateString('tr-TR'),status:'Bekliyor'});
  sd('promos',promos); addNotif(targetName+' için terfi teklifi → '+newRank); logAct('Terfi teklifi: '+targetName+' → '+newRank);
  al.innerHTML='<div class="alert alert-ok">✔ Teklif gönderildi.</div>'; document.getElementById('promo-reason').value='';
  setTimeout(function(){al.innerHTML='';},2500); renderPromo(); buildSidebar();
}
function approvePromo(id,ok){
  var promos=gd('promos')||[]; var p=promos.find(function(x){return x.id===id;});
  if(p) p.status=ok?'Onaylandı':'Reddedildi';
  if(ok&&p){var pers=gd('pers')||[]; var per=pers.find(function(x){return x.id===p.targetId;}); if(per){per.rank=p.newRank; sd('pers',pers); if(CU.id===per.id) CU.rank=p.newRank;}}
  sd('promos',promos); addNotif(p.targetName+' terfi '+(ok?'onaylandı ✔':'reddedildi ✖')); logAct('Terfi '+(ok?'onaylandı':'reddedildi')+': '+p.targetName);
  renderPromo(); buildSidebar();
}

/* ═══════════════════════════════════════
   PERSONEL YÖNETİMİ (Komuta tab)
   ═══════════════════════════════════════ */
function renderPersonnel(){
  var rankSel=document.getElementById('p-nr');
  if(rankSel) rankSel.innerHTML=RANKS.map(function(r){return '<option>'+r+'</option>';}).join('');
  var pers=gd('pers')||[]; var q=(document.getElementById('pers-search')||{}).value||'';
  if(q) pers=pers.filter(function(p){return (p.name+p.rank+p.unit).toLowerCase().includes(q.toLowerCase());});
  pers.sort(function(a,b){return RL[b.rank]-RL[a.rank];});
  document.getElementById('pers-tbody').innerHTML=pers.map(function(p){
    return '<tr><td>'+p.name+(p.isAdmin?' <span class="badge b-red" style="font-size:9px">A</span>':'')+'</td><td><span class="badge b-gold">'+p.rank+'</span></td><td style="font-size:11px;color:var(--muted)">'+p.unit+'</td><td><span class="badge b-muted">'+p.badge+'</span></td><td><span class="badge '+(p.warns?'b-red':'b-muted')+'">'+( p.warns||0)+'</span></td><td><button class="act-btn" onclick="editRank('+p.id+')">Rütbe</button><button class="act-btn red" onclick="delPers('+p.id+')">Sil</button></td></tr>';
  }).join('');
}
function editRank(id){
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===id;}); if(!p) return;
  var nr=prompt('Yeni rütbe:\n'+RANKS.join(', '),p.rank);
  if(!nr||!RANKS.includes(nr)){if(nr) alert('Geçersiz rütbe!'); return;}
  p.rank=nr; sd('pers',pers); logAct(p.name+' rütbesi → '+nr); renderPersonnel();
}
function delPers(id){
  if(!confirm('Bu personeli silmek istiyor musunuz?')) return;
  var pers=gd('pers')||[]; var p=pers.find(function(x){return x.id===id;});
  sd('pers',pers.filter(function(x){return x.id!==id;})); logAct('Personel silindi: '+(p?p.name:'')); renderPersonnel();
}

/* ── Yardımcılar ── */
function fillTargetSelect(selId){
  var sel=document.getElementById(selId); if(!sel) return;
  var pers=gd('pers')||[]; var isCmd=RL[CU.rank]>=RL['Under Sheriff']||CU.isAdmin;
  var targets=isCmd?pers.filter(function(p){return p.id!==CU.id;}):pers.filter(function(p){return RL[p.rank]<RL[CU.rank];});
  sel.innerHTML=targets.map(function(p){return '<option value="'+p.id+'">'+p.name+'</option>';}).join('');
}

/* DM (personel profili) */
function renderMyDMs(){
  var el=document.getElementById('my-dms-list'); if(!el) return;
  var dmData=gd('dm')||{}; var myMsgs=[];
  Object.keys(dmData).forEach(function(convId){
    var msgs=dmData[convId];
    var mine=msgs.filter(function(m){return m.to===CU.id;});
    if(mine.length){var last=mine[mine.length-1]; var unread=mine.filter(function(m){return !m.read;}).length; myMsgs.push({convId:convId,last:last,unread:unread,msgs:mine});}
  });
  if(!myMsgs.length){el.innerHTML='<div class="empty">Gelen kutusu boş.</div>';return;}
  el.innerHTML=myMsgs.map(function(c){
    return '<div class="pcard" style="margin-bottom:.5rem">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">'+
        '<span style="font-weight:600;color:var(--gold)">'+c.last.fromName+'</span>'+
        (c.unread?'<span class="badge b-red">'+c.unread+' yeni</span>':'<span class="badge b-muted">Okundu</span>')+
      '</div>'+
      c.msgs.slice(-5).map(function(m){return '<div style="background:var(--bg3);border-radius:4px;padding:6px 10px;margin-bottom:4px;font-size:12px"><span style="color:var(--muted);font-size:10px">'+m.time+'</span> '+m.text+'</div>';}).join('')+
    '</div>';
  }).join('');
}

/* ── Dışarıdan çağrılır (script.js → saveApply, saveComplaint, savePraise, saveTicket) ── */
function saveApply(data){
  var applies=gd('applies')||[];
  applies.push({id:Date.now(),name:data.name||'',discord:data.discord||'',unit:data.unit||'',experience:data.experience||'',rpExp:data.rpExp||'',reason:data.reason||'',date:new Date().toLocaleDateString('tr-TR'),status:'Bekliyor'});
  sd('applies',applies);
}
function saveComplaint(data){
  var list=gd('complaints')||[];
  list.push({id:Date.now(),name:data.name||'',target:data.target||'',date:data.incidentDate||'',location:data.location||'',desc:data.desc||'',submitDate:new Date().toLocaleDateString('tr-TR'),status:'Bekliyor'});
  sd('complaints',list);
}
function savePraise(data){
  var list=gd('praises')||[];
  list.push({id:Date.now(),name:data.name||'',target:data.target||'',date:new Date().toLocaleDateString('tr-TR'),desc:data.desc||''});
  sd('praises',list);
}
function saveTicket(data){
  var list=gd('tickets')||[];
  list.push({id:Date.now(),name:data.name||'',discord:data.discord||'',category:data.category||'',subject:data.subject||'',desc:data.desc||'',date:new Date().toLocaleDateString('tr-TR'),status:'Bekliyor'});
  sd('tickets',list);
}

initData();