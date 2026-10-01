/* SPA sem dependências. Uma rota por tela (#/painel, #/frequencia/analise ...). */
const $app = document.getElementById('app');
const estado = { usuario: null };

/* ---------- marca (cores e logotipo personalizáveis) ---------- */
const MARCA_PADRAO = { cor_principal: '#1d3766', cor_secundaria: '#c8962c', logo: null };
let marca = { ...MARCA_PADRAO };
function aplicarMarca(m, salvar = true) {
  const raiz = document.documentElement.style;
  raiz.setProperty('--cor-p', m.cor_principal);
  raiz.setProperty('--cor-s', m.cor_secundaria);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', m.cor_principal);
  const icone = document.querySelector('link[rel=icon]');
  if (icone && salvar) { icone.href = m.logo || '/favicon.svg'; icone.type = m.logo ? 'image/png' : 'image/svg+xml'; }
  if (salvar) { marca = { ...MARCA_PADRAO, ...m }; try { localStorage.setItem('marca', JSON.stringify(marca)); } catch { /* sem armazenamento */ } }
}
try { const guardada = JSON.parse(localStorage.getItem('marca')); if (guardada) aplicarMarca(guardada, false), (marca = { ...MARCA_PADRAO, ...guardada }); } catch { /* primeira visita */ }
async function carregarMarca() {
  try { const r = await fetch('/api/marca'); if (r.ok) { const m = await r.json(); aplicarMarca(m); } } catch { /* usa a marca em cache */ }
}
function mostrarDemo() {
  if (!marca.demo || document.getElementById('pill-demo')) return;
  const p = document.createElement('div');
  p.id = 'pill-demo'; p.className = 'pill-demo'; p.setAttribute('role', 'note');
  p.textContent = 'Demonstração · dados temporários';
  document.body.append(p);
}
const logoHtml = () => (marca.logo ? `<img src="${marca.logo}" alt="Logotipo da pastoral">` : LOGO);
const classeLogo = () => (marca.logo ? 'com-logo' : '');
const contrasteHex = (a, b) => {
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05);
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iniciais = (n) => String(n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const fmtTel = (d) => (!d ? '' : d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmtData = (iso) => { if (!iso) return ''; const [a, m, d] = iso.slice(0, 10).split('-'); return `${+d} de ${MESES[+m - 1].slice(0, 3)}. de ${a}`; };
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const TIPOS = { reuniao: 'Reunião', missa: 'Missa', escala: 'Escala', evento: 'Evento' };
const CATEGORIAS = { recado: 'Recado', encontro: 'Encontro', escala: 'Escala', evento: 'Evento' };
const ehCoord = () => !!estado.usuario && (estado.usuario.superadmin || estado.usuario.funcao === 'coordenacao');
const ehMestre = () => !!estado.usuario?.superadmin;
const temGuia = (id) => !!estado.usuario?.guias?.includes(id);
const papelRotulo = () => (ehMestre() ? 'Administrador' : ehCoord() ? 'Coordenação' : 'Usuário');

const ICONES = {
  painel: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  frequencia: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 13l2 2 4-4"/>',
  aniversariantes: '<path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7c-2 0-4-1-4-3s3-2 4 3c1-5 4-5 4-3s-2 3-4 3z"/>',
  avisos: '<path d="M3 11v3a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M15 9a4 4 0 010 6"/><path d="M18 6a8 8 0 010 12"/>',
  membros: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14a6 6 0 013.5 6"/>',
  configuracoes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18h.01"/>',
  pessoas: '<path d="M4 20a8 8 0 0116 0"/><circle cx="12" cy="8" r="4"/>',
  sair: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  'minha-presenca': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sino: '<path d="M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 004 0"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  galeria: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5.5-5.5L6 20"/>',
  usuarios: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  financeiro: '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><circle cx="16.5" cy="14.5" r="1.4"/><path d="M6 3.5l10 2"/>',
};
const icone = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[n] || ''}</svg>`;
const LOGO = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:26px;height:26px"><path d="M12 3v18M7 8h10"/><path d="M4 21h16"/></svg>';
const IGREJA = '<svg class="igreja" viewBox="0 0 120 100" fill="currentColor" aria-hidden="true"><path d="M58 4h4v10h8v4h-8v6l26 22v54H22V42l26-22v-6h-8v-4h8z"/><path d="M50 100V74a10 10 0 0120 0v26z" fill="#122445" opacity=".6"/></svg>';

/* ---------- animações (GSAP) ---------- */
const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const G = !reduzir && window.gsap ? window.gsap : null;

function contar(el) {
  const alvo = Number(el.textContent);
  if (!G || !Number.isFinite(alvo) || alvo === 0) return;
  const o = { v: 0 };
  el.textContent = '0';
  G.to(o, { v: alvo, duration: 0.9, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v); }, onComplete: () => { el.textContent = alvo; } });
}

function revelar(nos) {
  if (!G) return;
  const itens = [];
  nos.forEach((n) => {
    if (n.nodeType !== 1) return;
    n.querySelectorAll?.('.banner, .card, .abas, .aviso-card, .evento-card, .aviso-resumo').forEach((e) => itens.push(e));
    if (n.matches?.('.banner, .card, .abas, .aviso-card, .evento-card, .aviso-resumo')) itens.push(n);
  });
  const novos = [...new Set(itens)].filter((e) => !e.dataset.anim);
  if (!novos.length) return;
  novos.forEach((e) => { e.dataset.anim = 1; });
  G.fromTo(novos, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: { each: 0.06, amount: 0.6 }, clearProps: 'transform,opacity,visibility' });
  novos.forEach((e) => e.querySelectorAll('.kpi').forEach(contar));
}
new MutationObserver((muts) => revelar(muts.flatMap((m) => [...m.addedNodes]))).observe(document.getElementById('app'), { childList: true, subtree: true });

function toast(msg, erro) {
  const el = document.createElement('div');
  if (erro) el.className = 'erro';
  el.textContent = msg;
  document.getElementById('toast').append(el);
  if (G) G.from(el, { y: 24, autoAlpha: 0, duration: 0.35, ease: 'back.out(1.6)' });
  setTimeout(() => (G ? G.to(el, { autoAlpha: 0, y: 10, duration: 0.3, onComplete: () => el.remove() }) : el.remove()), 3800);
}

async function api(url, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { throw new Error('Sem conexão com o servidor. Tente novamente.'); }
  if (res.status === 401 && !url.includes('/login') && url !== '/api/me') { estado.usuario = null; location.hash = '#/entrar'; } // /api/me = "ainda não entrou", não sessão expirada
  const tipo = res.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(dados?.erro || 'Não foi possível concluir a ação.');
  return dados;
}

function confirmar(msg) { return window.confirm(msg); }

function dialogo(html) {
  const d = document.createElement('dialog');
  d.innerHTML = html;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  if (G) { G.from(d, { y: 30, scale: 0.96, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }); }
  return d;
}

/* ---------- roteamento ---------- */
const ROTAS = [
  { id: 'painel', rotulo: 'Início', titulo: 'Início', render: telaPainel },
  { id: 'minha-presenca', rotulo: 'Minha presença', curto: 'Presença', titulo: 'Minha presença', render: telaMinhaPresenca },
  { id: 'avisos', rotulo: 'Avisos', titulo: 'Avisos', render: telaAvisos },
  { id: 'galeria', rotulo: 'Galeria', titulo: 'Galeria', render: telaGaleria },
  { id: 'aniversariantes', rotulo: 'Aniversariantes', curto: 'Datas', titulo: 'Aniversariantes', render: telaAniversariantes },
  { id: 'frequencia', rotulo: 'Frequência', curto: 'Chamada', titulo: 'Frequência', render: telaFrequencia },
  { id: 'membros', rotulo: 'Membros', titulo: 'Membros', render: telaMembros },
  { id: 'financeiro', rotulo: 'Financeiro', curto: 'Caixa', titulo: 'Financeiro', render: telaFinanceiro },
  { id: 'usuarios', rotulo: 'Usuários', curto: 'Acessos', titulo: 'Usuários e acessos', render: telaUsuarios },
  { id: 'configuracoes', rotulo: 'Configurações', curto: 'Perfil', titulo: 'Configurações', render: telaConfiguracoes },
];
const GRUPOS = [['Geral', ['painel', 'minha-presenca', 'avisos', 'galeria', 'aniversariantes']], ['Gestão', ['frequencia', 'membros', 'financeiro']], ['Administração', ['usuarios']], ['Conta', ['configuracoes']]];

// Navegações rápidas (ou rede lenta) não podem se atropelar: uma tela antiga que termina depois da nova a sobrescreveria.
// Enquanto uma renderização está em curso, a navegação mais recente fica na fila e roda quando ela acaba.
let roteando = false, rotearDeNovo = false;
async function rotear() {
  if (roteando) { rotearDeNovo = true; return; }
  roteando = true;
  try { do { rotearDeNovo = false; await rotearUma(); } while (rotearDeNovo); } finally { roteando = false; }
}

async function rotearUma() {
  if (estado.previa) { aplicarMarca(marca, false); estado.previa = false; } // prévia de cores não salva não fica para as outras telas
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const [id, sub, extra] = partes;
  if (id === 'redefinir') return telaRedefinir(sub);
  try { estado.usuario = await api('/api/me'); } catch { estado.usuario = null; }
  if (!estado.usuario) return id === 'recuperar' ? telaRecuperar() : id === 'cadastro' ? telaCadastro() : telaLogin();
  if (!id || id === 'entrar' || id === 'recuperar' || id === 'cadastro') { location.replace('#/painel'); return; }
  const rota = ROTAS.find((r) => r.id === id && temGuia(r.id));
  if (!rota) { location.replace('#/painel'); return; }
  casca(rota);
  const conteudo = document.getElementById('conteudo');
  atualizarNotificacoes();
  try { await rota.render(conteudo, sub, extra); atualizarNotificacoes(); } catch (e) { conteudo.innerHTML = `<div class="card"><p class="erro-msg">${esc(e.message)}</p><button class="btn sec" onclick="rotear()">Tentar de novo</button></div>`; }
}
window.addEventListener('hashchange', rotear);

function pintarBadge() {
  const b = document.getElementById('badge-avisos');
  if (!b) return;
  const n = estado.usuario?.avisos_nao_lidos || 0;
  b.textContent = n > 99 ? '99+' : n;
  b.hidden = n === 0;
  b.setAttribute('aria-label', `${n} aviso(s) não lido(s)`);
}

function ligarMenuRecolhivel() {
  const shell = document.getElementById('shell');
  const btn = document.getElementById('recolher');
  let tip = document.getElementById('tip-menu');
  if (!tip) { tip = document.createElement('div'); tip.id = 'tip-menu'; tip.hidden = true; tip.setAttribute('role', 'tooltip'); document.body.append(tip); }
  btn.onclick = () => {
    const rec = shell.classList.toggle('recolhido');
    btn.setAttribute('aria-expanded', String(!rec));
    btn.setAttribute('aria-label', `${rec ? 'Expandir' : 'Recolher'} menu`);
    tip.hidden = true;
    try { localStorage.setItem('menuRecolhido', rec ? '1' : '0'); } catch { /* ignora */ }
  };
  // Menu recolhido mostra só ícones: a dica com o nome aparece ao passar o mouse ou focar.
  const mostrar = (a) => { if (!shell.classList.contains('recolhido') || window.innerWidth <= 860) return; const r = a.getBoundingClientRect(); tip.textContent = a.dataset.rotulo; tip.style.left = `${r.right + 14}px`; tip.style.top = `${r.top + r.height / 2}px`; tip.hidden = false; };
  document.querySelectorAll('.menu nav a').forEach((a) => {
    a.addEventListener('mouseenter', () => mostrar(a)); a.addEventListener('focus', () => mostrar(a));
    a.addEventListener('mouseleave', () => { tip.hidden = true; }); a.addEventListener('blur', () => { tip.hidden = true; });
  });
}

let rotaAtual = null;
function casca(rota) {
  const u = estado.usuario;
  const papel = papelRotulo();
  const assinatura = `${papel}|${(u.guias || []).join(',')}`;
  if (!document.getElementById('conteudo') || estado.reconstruir || estado.assinatura !== assinatura) {
    estado.reconstruir = false;
    estado.assinatura = assinatura;
    const itens = ROTAS.filter((r) => temGuia(r.id));
    const link = (r) => `<a href="#/${r.id}" data-rota="${r.id}" data-rotulo="${r.rotulo}"><span class="ni">${icone(r.id)}</span><span class="l-longo">${r.rotulo}</span><span class="l-curto">${r.curto || r.rotulo}</span>${r.id === 'avisos' ? '<span class="badge-nav" id="badge-avisos" hidden></span>' : ''}</a>`;
    const grupos = GRUPOS.map(([nome, ids]) => [nome, itens.filter((r) => ids.includes(r.id))]).filter(([, rs]) => rs.length);
    let recolhido = false;
    try { recolhido = localStorage.getItem('menuRecolhido') === '1'; } catch { /* sem armazenamento */ }
    $app.innerHTML = `
    <div class="shell ${recolhido ? 'recolhido' : ''}" id="shell">
      <aside class="menu" id="menu">
        <button type="button" class="menu-toggle" id="recolher" aria-label="${recolhido ? 'Expandir' : 'Recolher'} menu" aria-expanded="${!recolhido}" aria-controls="menu"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="marca"><div class="logo ${classeLogo()}">${logoHtml()}</div><div><strong>Pastoral do Acolhimento</strong><small>Santuário do Bugio</small></div></div>
        <nav aria-label="Menu principal">${grupos.map(([nome, rs]) => `<div class="nav-grupo" role="group" aria-label="${nome}"><span class="nav-titulo">${nome}</span>${rs.map(link).join('')}</div>`).join('')}</nav>
        <div class="frase">Acolher também é anunciar</div>
      </aside>
      <div class="principal">
        <header class="topo">
          <div><div class="secao" id="secao">${papel}</div><h1 id="titulo-tela"></h1></div>
          <div class="espaco"></div>
          <div class="notif"><button type="button" class="btn sec mini notif-btn" id="notif-btn" aria-haspopup="true" aria-expanded="false" aria-controls="notif-painel" aria-label="Notificações">${icone('sino')}<span class="badge-notif" id="badge-notif" hidden></span></button>
            <div class="notif-painel" id="notif-painel" role="region" aria-label="Notificações" hidden></div></div>
          <div class="usuaria">
            ${u.foto ? `<img class="avatar" src="/uploads/${esc(u.foto)}" alt="Foto de ${esc(u.nome)}">` : `<div class="avatar" aria-hidden="true">${esc(iniciais(u.nome))}</div>`}
            <div class="nome"><strong>${esc(u.nome.split(' ')[0])}</strong><small>${papel}</small></div>
            <button class="btn sec mini" id="sair" aria-label="Sair">${icone('sair')}<span class="sr">Sair</span></button>
          </div>
        </header>
        <main class="conteudo" id="conteudo"></main>
        <footer class="rodape">© 2026 Pastoral do Acolhimento – Santuário do Bugio.</footer>
      </div>
    </div>`;
    document.getElementById('sair').onclick = async () => { clearInterval(notif.timer); notif.vistos = null; await api('/api/logout', { method: 'POST' }); estado.usuario = null; location.hash = '#/entrar'; rotear(); };
    ligarSino();
    ligarMenuRecolhivel();
    if (G) {
      G.from('.menu nav a', { x: -16, autoAlpha: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out', clearProps: 'all' });
      G.from('.topo', { y: -20, autoAlpha: 0, duration: 0.4, clearProps: 'all' });
    }
    rotaAtual = null;
  }
  document.querySelectorAll('.menu nav a').forEach((a) => (a.dataset.rota === rota.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.querySelector('.menu nav a[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  pintarBadge();
  document.getElementById('titulo-tela').textContent = rota.titulo;
  document.title = `${rota.titulo} · Pastoral do Acolhimento`;
  const c = document.getElementById('conteudo');
  c.innerHTML = '<p class="carregando">Carregando…</p>';
  if (G && rotaAtual && rotaAtual !== rota.id) G.fromTo(c, { autoAlpha: 0, x: 18 }, { autoAlpha: 1, x: 0, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
  rotaAtual = rota.id;
  window.scrollTo(0, 0);
}

/* ---------- autenticação ---------- */
/* ---------- telas de acesso (login, recuperar, redefinir) ---------- */
const OLHO = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const OLHO_X = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a10 10 0 004-.8"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';

function telaAuth(conteudo) {
  $app.innerHTML = `<div class="auth">
    <section class="auth-hero" aria-hidden="false">
      <span class="orb a"></span><span class="orb b"></span><span class="orb c"></span>
      ${Array.from({ length: 16 }, () => '<i class="pt"></i>').join('')}
      <div class="hero-conteudo">
        <div class="logo hero-item ${classeLogo()}">${logoHtml()}</div>
        <h1 class="hero-item">Pastoral do <br>Acolhimento</h1>
        <p class="sub hero-item">Santuário Nossa Senhora Aparecida do Bugio</p>
        <blockquote class="hero-item">“Nada te perturbe, nada te amedronte. Tudo passa.”<small>— Santa Teresa d'Ávila</small></blockquote>
        <ul class="hero-lista">
          <li class="hero-item">${icone('frequencia')}<span>Chamada em poucos toques</span></li>
          <li class="hero-item">${icone('avisos')}<span>Avisos e aniversariantes da equipe</span></li>
          <li class="hero-item">${icone('financeiro')}<span>Caixa da pastoral sempre em dia</span></li>
        </ul>
      </div>
      ${IGREJA}
    </section>
    <section class="auth-painel"><div class="auth-card" id="auth-card">${conteudo}</div></section>
  </div>`;
  if (!G) return;
  const tl = G.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.auth-hero', { autoAlpha: 0, duration: 0.5 })
    .from('.hero-item', { y: 28, autoAlpha: 0, duration: 0.6, stagger: 0.09 }, '-=0.2')
    .from('.auth-hero .igreja', { y: 60, autoAlpha: 0, duration: 0.9 }, '-=0.6')
    .from('.auth-card', { y: 30, scale: 0.96, autoAlpha: 0, duration: 0.65, clearProps: 'transform,opacity,visibility' }, '-=0.9')
    .from('.auth-card .fl, .auth-card h2, .auth-card .auth-sub, .auth-card .btn, .auth-card .auth-link', { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.07, clearProps: 'transform,opacity,visibility' }, '-=0.45');
  G.to('.auth-hero .orb.a', { x: 50, y: 40, duration: 8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  G.to('.auth-hero .orb.b', { x: -40, y: -50, duration: 10, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  G.to('.auth-hero .orb.c', { x: 30, y: -30, scale: 1.2, duration: 7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  document.querySelectorAll('.auth-hero .pt').forEach((pt) => {
    G.set(pt, { left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, scale: 0.4 + Math.random() * 1.2, opacity: 0.15 + Math.random() * 0.4 });
    G.to(pt, { y: -(60 + Math.random() * 120), x: (Math.random() - 0.5) * 60, duration: 6 + Math.random() * 8, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: Math.random() * 3 });
  });
  const hero = document.querySelector('.auth-hero');
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    G.to('.auth-hero .hero-conteudo', { x: dx * 14, y: dy * 10, duration: 0.8, overwrite: 'auto' });
    G.to('.auth-hero .igreja', { x: dx * -24, y: dy * -10, duration: 1, overwrite: 'auto' });
  });
}

function campoFlutuante(id, rotulo, tipo, extra = '') {
  return `<div class="fl"><input id="${id}" type="${tipo}" placeholder=" " ${extra}><label for="${id}">${rotulo}</label></div>`;
}

function ativarOlho(btn, input) {
  btn.onclick = () => {
    const ver = input.type === 'password';
    input.type = ver ? 'text' : 'password';
    btn.innerHTML = ver ? OLHO_X : OLHO;
    btn.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
  };
}

function enviando(btn, rotulo) {
  btn.disabled = true;
  btn.dataset.rotulo = btn.innerHTML;
  btn.innerHTML = `<span class="spin"></span>${rotulo}`;
  return () => { btn.disabled = false; btn.innerHTML = btn.dataset.rotulo; };
}

function erroAuth(msg) {
  document.getElementById('erro').textContent = msg;
  if (G) G.fromTo('.auth-card', { x: -12 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, .3)' });
}

function telaLogin() {
  telaAuth(`<form id="f" novalidate>
    <h2>Bem-vinda(o) de volta</h2><p class="auth-sub">Entre para acessar o painel da pastoral.</p>
    ${campoFlutuante('email', 'E-mail', 'email', 'autocomplete="username" required')}
    <div class="fl com-olho"><input id="senha" type="password" placeholder=" " autocomplete="current-password" required><label for="senha">Senha</label>
      <button type="button" class="olho" id="olho" aria-label="Mostrar senha">${OLHO}</button></div>
    <p class="erro-msg" id="erro" role="alert"></p>
    <button type="submit" class="btn grande bloco">Entrar</button>
    <p class="auth-link"><a href="#/recuperar">Esqueci minha senha</a></p>
    <div class="auth-criar" id="criar-conta"><span class="muted">Ainda não tem conta?</span><a class="btn sec bloco" href="#/cadastro">Criar conta</a></div></form>`);
  ativarOlho(document.getElementById('olho'), document.getElementById('senha'));
  api('/api/cadastro/status').then((st) => { if (!st.aberto) document.getElementById('criar-conta')?.remove(); }).catch(() => {}); // visível por padrão; some só se o cadastro estiver fechado
  if (marca.demo) document.getElementById('criar-conta')?.insertAdjacentHTML('beforebegin', '<div class="dica-demo"><strong>Versão de demonstração</strong><span>Coordenação: <code>maria@pastoral.local</code> / <code>Pastoral2026</code></span><span>Administrador: <code>admin@pastoral.local</code> / <code>Mestre2026</code></span><small>Os dados são temporários e podem ser apagados a qualquer momento.</small></div>');
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const fim = enviando(e.target.querySelector('[type=submit]'), 'Entrando…');
    try {
      estado.usuario = await api('/api/login', { method: 'POST', body: { email: document.getElementById('email').value, senha: document.getElementById('senha').value } });
      location.hash = '#/painel'; rotear();
    } catch (err) { fim(); erroAuth(err.message); }
  };
}

function telaCadastro() {
  telaAuth(`<form id="f" novalidate>
    <h2>Criar conta</h2><p class="auth-sub">Você entra como <strong>Usuário</strong>. A administração pode liberar mais acessos depois.</p>
    ${campoFlutuante('nome', 'Nome completo', 'text', 'autocomplete="name" required')}
    ${campoFlutuante('email', 'E-mail', 'email', 'autocomplete="username" required')}
    ${campoFlutuante('tel', 'Telefone (opcional)', 'text', 'inputmode="tel" autocomplete="tel"')}
    <div class="fl com-olho"><input id="senha" type="password" placeholder=" " autocomplete="new-password" required><label for="senha">Senha</label>
      <button type="button" class="olho" id="olho" aria-label="Mostrar senha">${OLHO}</button></div>
    ${campoFlutuante('confirma', 'Confirmar senha', 'password', 'autocomplete="new-password" required')}
    <p class="pequeno muted" style="margin:-.4rem 0 .9rem">Mínimo de 8 caracteres, com letras e números.</p>
    <input type="text" name="site" id="site" class="isca" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="consentimento"><input type="checkbox" id="lgpd"> Concordo com o uso dos meus dados pela pastoral, conforme a LGPD.</label>
    <p class="erro-msg" id="erro" role="alert"></p>
    <button type="submit" class="btn grande bloco">Criar conta</button>
    <p class="auth-link">Já tem conta? <a href="#/entrar">Entrar</a></p></form>`);
  ativarOlho(document.getElementById('olho'), document.getElementById('senha'));
  const tel = document.getElementById('tel');
  tel.oninput = () => { const n = tel.value.replace(/\D/g, '').slice(0, 11); tel.value = fmtTel(n) || n; };
  api('/api/cadastro/status').then((st) => {
    if (st.aberto) return;
    document.getElementById('auth-card').innerHTML = '<h2>Cadastro fechado</h2><p class="auth-sub">A administração não está aceitando novos cadastros no momento. Fale com a coordenação da pastoral.</p><p class="auth-link"><a href="#/entrar">Voltar ao login</a></p>';
  }).catch(() => {});
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const v = (id) => document.getElementById(id).value;
    if (v('senha') !== v('confirma')) return erroAuth('A confirmação não confere com a senha.');
    const fim = enviando(e.target.querySelector('[type=submit]'), 'Criando conta…');
    try {
      estado.usuario = await api('/api/cadastro', { method: 'POST', body: { nome: v('nome'), email: v('email'), telefone: v('tel'), senha: v('senha'), confirmacao: v('confirma'), consentimento: document.getElementById('lgpd').checked, site: v('site') } });
      toast('Conta criada. Seja bem-vinda(o)!');
      location.hash = '#/painel'; rotear();
    } catch (err) { fim(); erroAuth(err.message); }
  };
}

function telaRecuperar() {
  telaAuth(`<form id="f" novalidate>
    <h2>Recuperar senha</h2><p class="auth-sub">Informe o e-mail cadastrado para receber o link de redefinição.</p>
    ${campoFlutuante('email', 'E-mail', 'email', 'autocomplete="username" required')}
    <p class="erro-msg" id="erro" role="alert"></p>
    <button type="submit" class="btn grande bloco">Enviar link</button>
    <p class="auth-link"><a href="#/entrar">Voltar ao login</a></p></form>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const fim = enviando(e.target.querySelector('[type=submit]'), 'Enviando…');
    try { const r = await api('/api/recuperar-senha', { method: 'POST', body: { email: document.getElementById('email').value } }); document.getElementById('erro').textContent = ''; toast(r.mensagem); } catch (err) { erroAuth(err.message); }
    fim();
  };
}

function telaRedefinir(token) {
  telaAuth(`<form id="f" novalidate>
    <h2>Nova senha</h2><p class="auth-sub">Mínimo de 8 caracteres, com letras e números.</p>
    ${campoFlutuante('s1', 'Nova senha', 'password', 'autocomplete="new-password" required')}
    ${campoFlutuante('s2', 'Confirmar nova senha', 'password', 'autocomplete="new-password" required')}
    <p class="erro-msg" id="erro" role="alert"></p>
    <button type="submit" class="btn grande bloco">Salvar senha</button></form>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const s1 = document.getElementById('s1'); const s2 = document.getElementById('s2');
    if (s1.value !== s2.value) return erroAuth('A confirmação não confere.');
    const fim = enviando(e.target.querySelector('[type=submit]'), 'Salvando…');
    try { await api('/api/redefinir-senha', { method: 'POST', body: { token, senha: s1.value } }); toast('Senha redefinida. Entre com a nova senha.'); location.hash = '#/entrar'; }
    catch (err) { fim(); erroAuth(err.message); }
  };
}

/* ---------- painel ---------- */
async function telaPainel(el) {
  const p = await api('/api/painel');
  const nome = estado.usuario.nome.split(' ')[0];
  const f = p.frequencia;
  const chip = (i, cor = '') => `<div class="chip-ic ${cor}">${icone(i)}</div>`;
  el.innerHTML = `<div class="pilha">
    <section class="banner"><span class="orb a"></span><span class="orb b"></span>${IGREJA}
      <h2>Que bom ter você aqui, ${esc(nome)}.</h2><p>Santuário Nossa Senhora Aparecida do Bugio</p>
      ${temGuia('frequencia') ? '<a class="btn" href="#/frequencia">Fazer chamada de hoje</a>' : temGuia('minha-presenca') ? '<a class="btn" href="#/minha-presenca">Ver minha presença</a>' : temGuia('avisos') ? '<a class="btn" href="#/avisos">Ver avisos</a>' : ''}</section>
    ${p.aniversariantes_hoje?.length ? `<section class="card" style="border-color:var(--ouro);background:var(--ouro-cl)"><h3>🎂 Aniversariantes de hoje</h3>${p.aniversariantes_hoje.map((a) => `<p><strong>${esc(a.nome)}</strong><br><span class="muted">${esc(p.mensagem_aniversario.replace(/\{nome\}/g, a.nome.split(' ')[0]))}</span></p>`).join('')}</section>` : ''}
    <div class="grade painel-grade">
      ${f ? `<a class="card" href="#/frequencia/analise">${chip('frequencia', 'verde')}<h3>Presenças</h3><div class="kpi">${f.presencas}</div><span class="muted pequeno">faltas: ${f.faltas} · justificadas: ${f.justificadas}</span></a>
      <a class="card ${f.em_alerta ? 'alerta' : ''}" href="#/frequencia/analise">${chip('alerta', f.em_alerta ? 'verm' : 'ouro')}<h3>Em alerta de faltas</h3><div class="kpi">${f.em_alerta}</div><span class="muted pequeno">de ${f.membros_ativos} membros ativos</span></a>
      <a class="card" href="#/frequencia">${chip('painel')}<h3>Último encontro</h3>${f.ultimo_encontro ? `<div class="kpi">${f.ultimo_encontro.presentes}/${f.ultimo_encontro.registrados}</div><span class="muted pequeno">${fmtData(f.ultimo_encontro.data)} · ${TIPOS[f.ultimo_encontro.tipo]}</span>` : '<span class="muted">Nenhuma chamada registrada ainda.</span>'}</a>` : ''}
      ${p.minha_presenca ? `<a class="card ${p.minha_presenca.em_alerta ? 'alerta' : ''}" href="#/minha-presenca">${chip('minha-presenca', p.minha_presenca.em_alerta ? 'verm' : 'verde')}<h3>Minha presença</h3><div class="kpi">${p.minha_presenca.percentual ?? '—'}${p.minha_presenca.percentual != null ? '%' : ''}</div><span class="muted pequeno">${p.minha_presenca.presencas} presença(s) · ${p.minha_presenca.faltas} falta(s)</span></a>` : ''}
      ${temGuia('avisos') ? `<a class="card" href="#/avisos">${chip('avisos', 'ouro')}<h3>Último aviso</h3>${p.ultimo_aviso ? `<strong>${esc(p.ultimo_aviso.titulo)}</strong><br><span class="muted pequeno">${fmtData(p.ultimo_aviso.criado_em)}</span>` : '<span class="muted">Nenhum aviso publicado.</span>'}</a>
      <a class="card" href="#/avisos">${chip('configuracoes')}<h3>Próximo evento</h3>${p.proximo_evento ? `<strong>${esc(p.proximo_evento.titulo)}</strong><br><span class="muted pequeno">${fmtData(p.proximo_evento.data_evento)}</span>` : '<span class="muted">Sem evento agendado.</span>'}</a>` : ''}
      ${temGuia('aniversariantes') ? `<a class="card" href="#/aniversariantes">${chip('aniversariantes', 'ouro')}<h3>Aniversariantes</h3><div class="kpi">${p.aniversariantes_mes}</div><span class="muted pequeno">em ${MESES[+p.hoje.split('-')[1] - 1]} · um gesto de carinho aproxima</span></a>` : ''}
    </div>
    <blockquote class="card citacao">“Nada te perturbe, nada te amedronte. Tudo passa.”<br><small>— Santa Teresa d'Ávila</small></blockquote></div>`;
  if (G) { G.to('.banner .orb.a', { x: -30, y: 20, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut' }); G.from('.banner .igreja', { y: 40, autoAlpha: 0, duration: 0.8, delay: 0.3, ease: 'power3.out' }); }
}

/* ---------- minha presença ---------- */
async function telaMinhaPresenca(el) {
  const d = await api('/api/minha-presenca');
  const SIT = { presente: ['Presente', 'ok'], ausente: ['Faltou', 'alerta'], justificado: ['Justificada', 'ouro'] };
  const pct = d.percentual ?? 0;
  el.innerHTML = `<div class="pilha">
    ${d.em_alerta ? `<section class="card alerta"><h3>Atenção às faltas</h3><p style="margin:0">Você chegou ao limite de ${d.limite_faltas} falta(s). Converse com a coordenação, se precisar de apoio.</p></section>` : ''}
    <div class="grade presenca-grade">
      <section class="card anel-card"><div class="anel" style="--p:${pct}" role="img" aria-label="${d.percentual == null ? 'Sem registros' : pct + '% de presença'}"><span>${d.percentual == null ? '—' : pct + '%'}</span></div><h3>Presença</h3><span class="muted pequeno">${d.percentual == null ? 'Ainda sem registros' : 'dos encontros registrados'}</span></section>
      <section class="card"><div class="chip-ic verde">${icone('frequencia')}</div><h3>Presenças</h3><div class="kpi">${d.presencas}</div></section>
      <section class="card"><div class="chip-ic verm">${icone('alerta')}</div><h3>Faltas</h3><div class="kpi">${d.faltas}</div><span class="muted pequeno">limite de alerta: ${d.limite_faltas}</span></section>
      <section class="card"><div class="chip-ic ouro">${icone('minha-presenca')}</div><h3>Justificadas</h3><div class="kpi">${d.justificadas}</div></section></div>
    <section class="card"><h3>Meu histórico</h3>
      ${d.historico.length ? `<ol class="linha-tempo">${d.historico.map((h) => `<li><span class="selo ${SIT[h.situacao][1]}">${SIT[h.situacao][0]}</span>
        <div><strong>${fmtData(h.data)}</strong> · ${TIPOS[h.tipo]}${h.titulo ? ` · ${esc(h.titulo)}` : ''}${h.observacao ? `<br><span class="muted pequeno">${esc(h.observacao)}</span>` : ''}</div></li>`).join('')}</ol>` : '<p class="vazio">Nenhuma chamada registrada para você ainda.</p>'}</section></div>`;
  if (G) G.from('.anel', { '--p': 0, duration: 1.2, ease: 'power2.out' });
}

/* ---------- frequência ---------- */
async function telaFrequencia(el, aba = 'chamada') {
  const abas = [['chamada', 'Chamada'], ['analise', 'Análise'], ['relatorios', 'Relatórios']];
  el.innerHTML = `<nav class="abas" aria-label="Seções de frequência">${abas.map(([id, r]) => `<a href="#/frequencia/${id}" ${id === aba ? 'aria-current="page"' : ''}>${r}</a>`).join('')}</nav><div id="aba"></div>`;
  const alvo = document.getElementById('aba');
  ({ chamada: abaChamada, analise: abaAnalise, relatorios: abaRelatorios }[aba] || abaChamada)(alvo);
}

async function abaChamada(el) {
  let data = hoje(), tipo = 'reuniao';
  async function carregar() {
    el.innerHTML = '<p class="carregando">Preparando a chamada…</p>';
    let c;
    try { c = await api(`/api/frequencia/chamada?data=${data}&tipo=${tipo}`); }
    catch (e) { el.innerHTML = `<div class="card"><p class="erro-msg">${esc(e.message)}</p><button class="btn sec" id="rt">Tentar de novo</button></div>`; document.getElementById('rt').onclick = carregar; return; }
    const chave = `rascunho:${data}:${tipo}`;
    const marc = new Map(c.membros.map((m) => [m.id, { situacao: m.situacao, observacao: m.observacao || '' }]));
    let rascunho = false;
    if (!c.encontro) { try { const r = JSON.parse(localStorage.getItem(chave)); if (r) { r.forEach(([id, v]) => marc.has(id) && marc.set(id, v)); rascunho = true; } } catch { /* sem rascunho */ } }
    const persistir = () => { try { localStorage.setItem(chave, JSON.stringify([...marc])); } catch { /* ignora */ } };
    let busca = '';

    el.innerHTML = `<div class="pilha">
      <div class="card"><div class="form-grade">
        <div class="campo"><label for="d">Data do encontro</label><input type="date" id="d" value="${data}"></div>
        <div class="campo"><label for="t">Tipo</label><select id="t">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="campo"><label for="ti">Título (opcional)</label><input type="text" id="ti" maxlength="120" value="${esc(c.encontro?.titulo || '')}"></div></div>
        <label><input type="checkbox" id="ca" ${c.encontro && !c.encontro.conta_alerta ? '' : 'checked'}> Conta para o alerta de faltas</label>
        ${rascunho ? '<p class="pequeno" style="color:var(--aviso)">Rascunho recuperado deste aparelho. Salve para gravar.</p>' : ''}
        ${c.encontro ? '<p class="pequeno muted">Chamada já registrada para este encontro. Ajustes substituem o registro.</p>' : ''}</div>
      <div class="card">
        <div class="linha entre"><input type="search" id="b" placeholder="Buscar por nome" aria-label="Buscar por nome" style="max-width:280px">
          <div class="linha" style="flex:1;justify-content:flex-end"><div class="progresso" aria-hidden="true"><i id="prog"></i></div><span id="cont" class="selo"></span><button class="btn sec mini" id="todos">Marcar todos presentes</button></div></div>
        <div class="chamada-lista" id="lista"></div>
        <div class="barra-salvar"><button class="btn" id="salvar">Salvar chamada</button><span id="msg" class="pequeno muted"></span></div></div></div>`;

    const lista = document.getElementById('lista');
    function contador() {
      const n = [...marc.values()].filter((v) => v.situacao).length;
      document.getElementById('cont').textContent = `${n} de ${marc.size} marcados`;
      const pct = marc.size ? (n / marc.size) * 100 : 0;
      if (G) G.to('#prog', { width: `${pct}%`, duration: 0.4, ease: 'power2.out' }); else document.getElementById('prog').style.width = `${pct}%`;
    }
    function desenhar() {
      const termo = busca.toLowerCase();
      const vis = c.membros.filter((m) => m.nome.toLowerCase().includes(termo));
      lista.innerHTML = vis.length ? vis.map((m) => {
        const v = marc.get(m.id);
        const b = (s, r) => `<button type="button" class="${s}" data-id="${m.id}" data-s="${s}" aria-pressed="${v.situacao === s}">${r}</button>`;
        return `<div class="chamada-item"><div><strong>${esc(m.nome)}</strong><br><span class="muted pequeno">${esc(fmtTel(m.telefone))}</span></div>
          <div class="sit" role="group" aria-label="Situação de ${esc(m.nome)}">${b('presente', 'Presente')}${b('ausente', 'Ausente')}${b('justificado', 'Justificado')}</div>
          ${v.situacao === 'ausente' || v.situacao === 'justificado' ? `<input class="obs" type="text" maxlength="300" placeholder="Observação (opcional)" aria-label="Observação de ${esc(m.nome)}" data-obs="${m.id}" value="${esc(v.observacao)}">` : ''}</div>`;
      }).join('') : '<p class="vazio">Nenhum membro encontrado.</p>';
      contador();
    }
    desenhar();
    lista.onclick = (e) => {
      const btn = e.target.closest('button[data-id]'); if (!btn) return;
      const v = marc.get(+btn.dataset.id);
      v.situacao = v.situacao === btn.dataset.s ? null : btn.dataset.s;
      if (v.situacao === 'presente') v.observacao = '';
      persistir(); desenhar();
      if (G && v.situacao) G.fromTo(lista.querySelector(`button[data-id="${btn.dataset.id}"][data-s="${v.situacao}"]`), { scale: 0.8 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
    };
    lista.oninput = (e) => { if (e.target.dataset.obs) { marc.get(+e.target.dataset.obs).observacao = e.target.value; persistir(); } };
    document.getElementById('b').oninput = (e) => { busca = e.target.value; desenhar(); };
    document.getElementById('todos').onclick = () => { c.membros.forEach((m) => { if (!marc.get(m.id).situacao) marc.get(m.id).situacao = 'presente'; }); persistir(); desenhar(); };
    document.getElementById('d').onchange = (e) => { if (e.target.value) { data = e.target.value; carregar(); } };
    document.getElementById('t').onchange = (e) => { tipo = e.target.value; carregar(); };
    document.getElementById('salvar').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const msg = document.getElementById('msg'); msg.textContent = 'Salvando…';
      try {
        const r = await api('/api/frequencia/chamada', { method: 'POST', body: {
          data, tipo, titulo: document.getElementById('ti').value, conta_alerta: document.getElementById('ca').checked,
          registros: [...marc].map(([usuario_id, v]) => ({ usuario_id, situacao: v.situacao, observacao: v.observacao })) } });
        try { localStorage.removeItem(chave); } catch { /* ignora */ }
        msg.textContent = `✔ Chamada salva (${r.gravados} registros) às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
        toast('Chamada salva.');
      } catch (err) { msg.textContent = ''; toast(`${err.message} Seu rascunho continua neste aparelho.`, true); }
      btn.disabled = false;
    };
  }
  carregar();
}

async function abaAnalise(el) {
  const a = await api('/api/frequencia/analise');
  el.innerHTML = `<div class="pilha">
    <div class="grade"><div class="card"><h3>Presenças registradas</h3><div class="kpi">${a.totais.presencas}</div></div>
      <div class="card"><h3>Faltas registradas</h3><div class="kpi">${a.totais.faltas}</div><span class="muted pequeno">não justificadas</span></div>
      <div class="card"><h3>Justificadas</h3><div class="kpi">${a.totais.justificadas}</div></div></div>
    <form class="card" id="lim"><div class="linha"><div class="campo" style="margin:0"><label for="l">Alerta após __ faltas</label><input id="l" type="number" min="1" max="99" value="${a.limite_faltas}" style="width:110px"></div>
      <div class="campo" style="margin:0"><label for="c">Critério</label><select id="c"><option value="acumuladas" ${a.criterio_alerta === 'acumuladas' ? 'selected' : ''}>Faltas acumuladas</option><option value="consecutivas" ${a.criterio_alerta === 'consecutivas' ? 'selected' : ''}>Faltas consecutivas</option></select></div>
      <button class="btn" style="align-self:end">Salvar limite</button></div></form>
    <h3>Análise da equipe</h3>
    <div class="grade">${a.membros.length ? a.membros.map((m) => `<div class="card ${m.em_alerta ? 'alerta' : ''}"><strong>${esc(m.nome)}</strong> ${m.em_alerta ? '<span class="selo alerta">Alerta</span>' : ''}
      <div class="muted pequeno">${m.presencas} presença(s) · ${m.faltas} falta(s) · ${m.justificadas} justificada(s)</div>
      ${m.consecutivas ? `<div class="pequeno">${m.consecutivas} falta(s) seguida(s)</div>` : ''}</div>`).join('') : '<p class="vazio">Nenhum membro ativo.</p>'}</div></div>`;
  document.getElementById('lim').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/frequencia/limite', { method: 'PUT', body: { limite_faltas: +document.getElementById('l').value, criterio_alerta: document.getElementById('c').value } }); toast('Limite salvo.'); abaAnalise(el); }
    catch (err) { toast(err.message, true); }
  };
}

async function abaRelatorios(el) {
  const d1 = new Date(); d1.setDate(1);
  let de = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-01`, ate = hoje();
  async function carregar() {
    const a = await api(`/api/frequencia/analise?de=${de}&ate=${ate}`);
    el.innerHTML = `<div class="pilha"><div class="card"><div class="linha">
      <div class="campo" style="margin:0"><label for="de">De</label><input type="date" id="de" value="${de}"></div>
      <div class="campo" style="margin:0"><label for="ate">Até</label><input type="date" id="ate" value="${ate}"></div>
      <a class="btn sec" style="align-self:end;text-decoration:none" href="/api/frequencia/relatorio.csv?de=${de}&ate=${ate}">Exportar planilha (CSV)</a>
      <button class="btn sec" style="align-self:end" onclick="window.print()">Imprimir / PDF</button></div></div>
      <div class="card tabela-rolagem"><table class="empilha"><thead><tr><th>Nome</th><th>Presenças</th><th>Faltas</th><th>Justificadas</th><th>% presença</th></tr></thead>
      <tbody>${a.membros.map((m) => `<tr><td data-label="Nome">${esc(m.nome)}</td><td data-label="Presenças">${m.presencas}</td><td data-label="Faltas">${m.faltas}</td><td data-label="Justificadas">${m.justificadas}</td><td data-label="% presença">${m.percentual_presenca ?? '—'}${m.percentual_presenca != null ? '%' : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
    document.getElementById('de').onchange = (e) => { de = e.target.value || de; carregar(); };
    document.getElementById('ate').onchange = (e) => { ate = e.target.value || ate; carregar(); };
  }
  carregar();
}

/* ---------- aniversariantes ---------- */
async function telaAniversariantes(el) {
  let mes = new Date().getMonth() + 1;
  async function carregar() {
    const r = await api(`/api/aniversariantes?mes=${mes}`);
    el.innerHTML = `<div class="pilha"><div class="campo" style="max-width:240px"><label for="mes">Mês</label><select id="mes">${MESES.map((m, i) => `<option value="${i + 1}" ${i + 1 === mes ? 'selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select></div>
      <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section class="card"><h3>Aniversariantes</h3>${r.aniversariantes.length ? r.aniversariantes.map((a) => `<div class="membro"><div class="avatar" aria-hidden="true">${a.dia}</div><div class="info"><strong>${esc(a.nome)}</strong><br><span class="muted pequeno">dia ${a.dia}</span></div></div>`).join('') : '<p class="vazio">Não há aniversariantes cadastrados neste mês.</p>'}</section>
      <section class="card"><h3>Mensagem de parabéns</h3>
        ${ehCoord() ? `<form id="fm"><div class="campo"><label for="msg">Use {nome} para incluir o primeiro nome</label><textarea id="msg" maxlength="500">${esc(r.mensagem)}</textarea></div>
          <p class="pequeno muted" id="prev"></p><button class="btn">Salvar mensagem</button></form>` : `<p>${esc(r.mensagem)}</p>`}</section></div></div>`;
    document.getElementById('mes').onchange = (e) => { mes = +e.target.value; carregar(); };
    if (ehCoord()) {
      const prev = () => { document.getElementById('prev').textContent = 'Pré-visualização: ' + document.getElementById('msg').value.replace(/\{nome\}/g, 'Maria'); };
      prev(); document.getElementById('msg').oninput = prev;
      document.getElementById('fm').onsubmit = async (e) => { e.preventDefault(); try { await api('/api/aniversariantes/mensagem', { method: 'PUT', body: { mensagem: document.getElementById('msg').value } }); toast('Mensagem salva.'); } catch (err) { toast(err.message, true); } };
    }
  }
  carregar();
}

/* ---------- notificações (sino) ---------- */
const notif = { itens: [], naoLidas: 0, vistos: null, timer: null };
const tempoRelativo = (iso) => {
  const seg = Math.max(0, (Date.now() - new Date(`${iso.replace(' ', 'T')}Z`).getTime()) / 1000);
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  return `há ${Math.floor(seg / 86400)} d`;
};

function pintarSino() {
  const b = document.getElementById('badge-notif');
  if (!b) return;
  b.textContent = notif.naoLidas > 99 ? '99+' : notif.naoLidas;
  b.hidden = notif.naoLidas === 0;
  document.getElementById('notif-btn').setAttribute('aria-label', notif.naoLidas ? `Notificações, ${notif.naoLidas} não lida(s)` : 'Notificações');
  const painel = document.getElementById('notif-painel');
  if (painel && !painel.hidden) desenharPainelSino();
}

function desenharPainelSino() {
  const painel = document.getElementById('notif-painel');
  painel.innerHTML = `<div class="notif-topo"><strong>Notificações</strong><button type="button" class="btn sec mini" id="notif-todas" ${notif.naoLidas ? '' : 'disabled'}>Marcar todas como lidas</button></div>
    ${notif.itens.length ? `<ul class="notif-lista">${notif.itens.map((i) => `<li><button type="button" class="notif-item ${i.lida ? '' : 'nova'}" data-id="${i.id}">
      <span class="notif-ic">${icone(i.tipo === 'aviso' ? 'avisos' : 'galeria')}</span>
      <span class="txt"><strong>${esc(i.titulo)}</strong>${i.mensagem ? `<small>${esc(i.mensagem)}</small>` : ''}<em>${tempoRelativo(i.criado_em)}</em></span>${i.lida ? '' : '<i class="ponto-nova" aria-label="não lida"></i>'}</button></li>`).join('')}</ul>` : '<p class="vazio" style="margin:0">Nenhuma notificação por enquanto.</p>'}`;
  document.getElementById('notif-todas').onclick = async () => {
    try { await api('/api/notificacoes/marcar-todas', { method: 'POST' }); notif.itens.forEach((i) => { i.lida = 1; }); notif.naoLidas = 0; pintarSino(); } catch (err) { toast(err.message, true); }
  };
  painel.querySelectorAll('.notif-item').forEach((b) => {
    b.onclick = async () => {
      const i = notif.itens.find((x) => x.id === +b.dataset.id);
      try { await api(`/api/notificacoes/${i.id}/lida`, { method: 'PUT', body: { lida: true } }); } catch { /* segue para o link */ }
      fecharSino();
      if (location.hash === i.link) rotear(); else location.hash = i.link;
    };
  });
}

function fecharSino() {
  const painel = document.getElementById('notif-painel');
  if (!painel || painel.hidden) return;
  painel.hidden = true;
  document.getElementById('notif-btn')?.setAttribute('aria-expanded', 'false');
}

function ligarSino() {
  const btn = document.getElementById('notif-btn');
  const painel = document.getElementById('notif-painel');
  btn.onclick = (e) => {
    e.stopPropagation();
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    if (abrir) { atualizarNotificacoes(); desenharPainelSino(); if (G) G.from(painel, { y: -10, autoAlpha: 0, duration: 0.25, ease: 'power2.out' }); }
  };
  painel.addEventListener('click', (e) => e.stopPropagation());
  clearInterval(notif.timer);
  notif.timer = setInterval(() => atualizarNotificacoes(), 30000);
}
document.addEventListener('click', fecharSino);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSino(); });

async function atualizarNotificacoes() {
  if (!estado.usuario || !document.getElementById('notif-btn')) return;
  try {
    const d = await api('/api/notificacoes');
    const chave = (i) => `${i.id}:${i.criado_em}`;
    if (notif.vistos) {
      d.itens.filter((i) => !i.lida && !notif.vistos.has(chave(i))).slice(0, 2).forEach((i) => toast(i.titulo));
    }
    notif.vistos = new Set([...(notif.vistos || []), ...d.itens.map(chave)]);
    notif.itens = d.itens; notif.naoLidas = d.nao_lidas;
    pintarSino();
  } catch { /* sem rede: tenta no próximo ciclo */ }
}

/* ---------- avisos ---------- */
const excerto = (t, n = 150) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n).trimEnd()}…` : x; };
const urlMidia = (f) => `/uploads/${encodeURIComponent(f)}`;

async function telaAvisos(el, sub, extra) {
  if (sub === 'novo' || extra === 'editar') {
    if (!ehCoord()) { location.replace('#/avisos'); return; }
    return paginaAviso(el, sub === 'novo' ? null : +sub);
  }
  let avisos = await api('/api/avisos');
  let filtro = 'todos', categoria = '', busca = '';
  const naoLidos = () => avisos.filter((a) => !a.lido).length;
  function sincronizar() { estado.usuario.avisos_nao_lidos = naoLidos(); pintarBadge(); }

  el.innerHTML = `<div class="pilha">
    <div class="linha entre">
      <div class="abas" role="tablist" aria-label="Filtrar avisos" style="margin:0">
        <a href="#" data-f="todos" role="tab">Todos</a><a href="#" data-f="nao-lidos" role="tab">Não lidos <span class="contagem" id="c-nl"></span></a><a href="#" data-f="lidos" role="tab">Lidos</a></div>
      <div class="linha"><button class="btn sec" id="todos-lidos">Marcar todos como lidos</button>${ehCoord() ? '<a class="btn ouro" id="novo-aviso" href="#/avisos/novo">+ Novo aviso</a>' : ''}</div></div>
    <div class="linha"><input type="search" id="av-q" placeholder="Buscar nos avisos" aria-label="Buscar nos avisos" style="max-width:300px">
      <select id="av-cat" aria-label="Filtrar por categoria" style="max-width:200px"><option value="">Todas as categorias</option>${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <span class="muted pequeno" id="av-total"></span></div>
    <div id="av-lista"></div></div>`;

  function cartao(a) {
    const midia = a.midia_tipo === 'video'
      ? `<div class="thumb video"><video src="${urlMidia(a.midia)}#t=0.1" preload="metadata" muted></video><span class="play">▶</span></div>`
      : a.midia ? `<div class="thumb"><img src="${urlMidia(a.midia)}" alt="" loading="lazy"></div>` : `<div class="thumb vazia cat-${a.categoria}">${icone(a.categoria === 'recado' ? 'avisos' : a.categoria === 'escala' ? 'frequencia' : a.categoria === 'encontro' ? 'minha-presenca' : 'galeria')}</div>`;
    return `<article class="aviso-resumo ${a.lido ? '' : 'nao-lido'} ${a.fixado ? 'fixado' : ''}" data-id="${a.id}">
      <button type="button" class="abrir" aria-label="Abrir aviso: ${esc(a.titulo)}${a.lido ? '' : ' (não lido)'}">
        ${midia}
        <div class="corpo"><div class="linha topo-card"><span class="selo">${CATEGORIAS[a.categoria]}</span>${a.fixado ? `<span class="pin" title="Fixado">${icone('pin')}</span>` : ''}${a.data_evento ? `<span class="selo ok">${dataBR(a.data_evento)}</span>` : ''}</div>
          <h3>${esc(a.titulo)}</h3><p>${esc(excerto(a.texto))}</p>
          <span class="meta muted pequeno">${fmtData(a.criado_em)}${a.autor_nome ? ' · ' + esc(a.autor_nome.split(' ')[0]) : ''}</span></div>
      </button>
      <button type="button" class="flag-lido" data-flag="${a.id}" aria-pressed="${a.lido ? 'true' : 'false'}" aria-label="${a.lido ? 'Lido. Marcar como não lido' : 'Não lido. Marcar como lido'}" title="${a.lido ? 'Marcar como não lido' : 'Marcar como lido'}">${icone('flag')}<span>${a.lido ? 'Lido' : 'Não lido'}</span></button></article>`;
  }

  function desenhar(animar = true) {
    const t = busca.toLowerCase();
    const lista = avisos.filter((a) => (filtro === 'todos' || (filtro === 'lidos' ? a.lido : !a.lido)) && (!categoria || a.categoria === categoria) && (`${a.titulo} ${a.texto}`.toLowerCase().includes(t)));
    el.querySelectorAll('[data-f]').forEach((x) => (x.dataset.f === filtro ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current')));
    const nl = naoLidos();
    document.getElementById('c-nl').textContent = nl ? nl : '';
    document.getElementById('c-nl').hidden = !nl;
    document.getElementById('todos-lidos').hidden = !nl;
    document.getElementById('av-total').textContent = `${lista.length} de ${avisos.length} aviso(s)`;
    const alvo = document.getElementById('av-lista');
    alvo.innerHTML = lista.length ? `<div class="grade-avisos">${lista.map(cartao).join('')}</div>` : `<div class="card vazio">${icone('avisos')}<p>${avisos.length ? 'Nenhum aviso com esses filtros.' : 'Nenhum aviso publicado ainda.'}</p></div>`;
    if (!animar) alvo.querySelectorAll('.aviso-resumo, .card').forEach((x) => { x.dataset.anim = 1; });
  }
  desenhar();
  if (/^\d+$/.test(sub || '') && !extra) { const alvo = avisos.find((x) => x.id === +sub); if (alvo) modalAviso(alvo); }

  el.querySelectorAll('[data-f]').forEach((x) => { x.onclick = (e) => { e.preventDefault(); filtro = x.dataset.f; desenhar(); }; });
  document.getElementById('av-q').oninput = (e) => { busca = e.target.value; desenhar(false); };
  document.getElementById('av-cat').onchange = (e) => { categoria = e.target.value; desenhar(); };
  document.getElementById('todos-lidos').onclick = async () => {
    try { await api('/api/avisos/marcar-todos-lidos', { method: 'POST' }); avisos.forEach((a) => { a.lido = 1; }); sincronizar(); desenhar(false); toast('Todos os avisos marcados como lidos.'); } catch (err) { toast(err.message, true); }
  };

  async function definirLido(a, lido) {
    await api(`/api/avisos/${a.id}/lido`, { method: 'PUT', body: { lido } });
    a.lido = lido ? 1 : 0; sincronizar();
    atualizarNotificacoes();
  }

  document.getElementById('av-lista').onclick = async (e) => {
    const flag = e.target.closest('[data-flag]');
    if (flag) {
      const a = avisos.find((x) => x.id === +flag.dataset.flag);
      try {
        await definirLido(a, !a.lido);
        desenhar(false);
        const novo = el.querySelector(`[data-flag="${a.id}"]`);
        if (G && novo) G.fromTo(novo.querySelector('svg'), { rotate: -25, scale: 0.6 }, { rotate: 0, scale: 1, duration: 0.5, ease: 'back.out(3)' });
        if (filtro !== 'todos') toast(a.lido ? 'Marcado como lido.' : 'Marcado como não lido.');
      } catch (err) { toast(err.message, true); }
      return;
    }
    const abrir = e.target.closest('.abrir');
    if (abrir) modalAviso(avisos.find((x) => x.id === +abrir.closest('.aviso-resumo').dataset.id));
  };

  function modalAviso(a) {
    const d = dialogo(`<article class="aviso-modal">
      <button class="lb-fechar btn sec mini" id="m-x" aria-label="Fechar">✕</button>
      ${a.midia_tipo === 'video' ? `<video controls src="${urlMidia(a.midia)}" class="m-midia"></video>` : a.midia ? `<img class="m-midia" src="${urlMidia(a.midia)}" alt="Mídia do aviso: ${esc(a.titulo)}">` : ''}
      <div class="m-corpo"><div class="linha"><span class="selo">${CATEGORIAS[a.categoria]}</span>${a.fixado ? `<span class="selo ouro">Fixado</span>` : ''}${a.data_evento ? `<span class="selo ok">Evento: ${dataBR(a.data_evento)}</span>` : ''}</div>
        <h2 id="m-titulo">${esc(a.titulo)}</h2>
        <p class="muted pequeno" style="margin:0 0 1rem">Publicado em ${fmtData(a.criado_em)}${a.autor_nome ? ' por ' + esc(a.autor_nome) : ''}</p>
        <div class="m-texto">${esc(a.texto)}</div></div>
      <div class="m-rodape"><button type="button" class="flag-lido grande" id="m-flag"></button>
        ${ehCoord() ? `<div class="linha"><a class="btn sec mini" id="m-editar" href="#/avisos/${a.id}/editar">Editar</a><button class="btn sec mini" id="m-leituras">Leituras (${a.leituras})</button><button class="btn sec mini" id="m-excluir">Excluir</button></div>` : ''}</div></article>`);
    d.classList.add('dlg-aviso');
    d.addEventListener('close', () => { if (/^#\/avisos\/\d+$/.test(location.hash)) history.replaceState(null, '', '#/avisos'); });
    d.setAttribute('aria-labelledby', 'm-titulo');
    const flag = d.querySelector('#m-flag');
    const pintar = () => {
      flag.setAttribute('aria-pressed', a.lido ? 'true' : 'false');
      flag.innerHTML = `${icone('flag')}<span>${a.lido ? 'Lido · marcar como não lido' : 'Não lido · marcar como lido'}</span>`;
    };
    pintar();
    // Abrir o aviso conta como leitura; a flag permite voltar para "não lido".
    if (!a.lido) definirLido(a, true).then(() => { pintar(); desenhar(false); }).catch(() => {});
    flag.onclick = async () => {
      try { await definirLido(a, !a.lido); pintar(); desenhar(false); if (G) G.fromTo(flag.querySelector('svg'), { rotate: -25, scale: 0.6 }, { rotate: 0, scale: 1, duration: 0.5, ease: 'back.out(3)' }); } catch (err) { toast(err.message, true); }
    };
    d.querySelector('#m-x').onclick = () => d.close();
    if (ehCoord()) {
      d.querySelector('#m-editar').onclick = () => d.close();
      d.querySelector('#m-excluir').onclick = async () => {
        if (!confirmar(`Excluir o aviso "${a.titulo}"? Esta ação não pode ser desfeita.`)) return;
        try { await api(`/api/avisos/${a.id}`, { method: 'DELETE' }); d.close(); avisos = avisos.filter((x) => x.id !== a.id); sincronizar(); desenhar(false); toast('Aviso excluído.'); } catch (err) { toast(err.message, true); }
      };
      d.querySelector('#m-leituras').onclick = async () => {
        const l = await api(`/api/avisos/${a.id}/leituras`);
        const d2 = dialogo(`<h3>Leituras: ${esc(a.titulo)}</h3><p class="muted pequeno">${l.filter((x) => x.lido_em).length} de ${l.length} leram.</p>${l.map((x) => `<div class="linha entre" style="padding:.25rem 0"><span>${esc(x.nome)}</span>${x.lido_em ? '<span class="selo ok">Leu</span>' : '<span class="selo cinza">Não leu</span>'}</div>`).join('')}<p><button class="btn sec" id="fechar2">Fechar</button></p>`);
        d2.querySelector('#fechar2').onclick = () => d2.close();
      };
    }
  }
}

// Página própria para criar (#/avisos/novo) ou editar (#/avisos/ID/editar).
async function paginaAviso(el, id) {
  const a = id ? await api(`/api/avisos/${id}`) : { titulo: '', texto: '', categoria: 'recado', data_evento: '', fixado: 0, midia: null, midia_tipo: null };
  let arquivo = null, removerMidia = false, urlLocal = null;
  el.innerHTML = `<div class="pilha"><a href="#/avisos" class="voltar">‹ Voltar aos avisos</a>
    <div class="aviso-form-grid">
    <form class="card" id="fa" novalidate><h3>${id ? 'Editar aviso' : 'Novo aviso'}</h3>
      <div class="campo"><label for="titulo">Título</label><input id="titulo" type="text" maxlength="150" value="${esc(a.titulo)}" placeholder="Ex.: Reunião geral da pastoral"><small class="muted" id="ct">0/150</small></div>
      <div class="campo"><label for="texto">Mensagem</label><textarea id="texto" style="min-height:170px" placeholder="Escreva o aviso para a equipe…">${esc(a.texto)}</textarea></div>
      <div class="form-grade"><div class="campo"><label for="categoria">Categoria</label><select id="categoria">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}" ${a.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="campo"><label for="data_evento">Data do evento (opcional)</label><input id="data_evento" type="date" value="${esc(a.data_evento || '')}"></div></div>
      <div class="campo"><label>Foto ou vídeo (opcional, até 50 MB)</label>
        <label class="zona-drop" id="zona"><input type="file" id="arquivo" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" class="sr"><span>${icone('galeria')}<strong>Escolha um arquivo</strong> ou arraste para cá<br><small class="muted">JPG, PNG, WebP, MP4, WebM ou MOV</small></span></label>
        <div id="midia-atual" class="linha pequeno"></div></div>
      <label class="switch-linha" style="margin-bottom:1rem"><span class="switch"><input type="checkbox" role="switch" id="fixado" ${a.fixado ? 'checked' : ''}><span class="trilho"></span></span><span><strong>Fixar no topo</strong><br><small class="muted">Aparece antes dos demais avisos.</small></span></label>
      <p class="erro-msg" id="er" role="alert"></p>
      <div class="linha"><button class="btn ouro" id="salvar">${id ? 'Salvar alterações' : 'Publicar aviso'}</button><a class="btn sec" href="#/avisos">Cancelar</a></div></form>
    <aside class="card previa-aviso" aria-label="Pré-visualização"><h3>Pré-visualização</h3><p class="muted pequeno" style="margin-top:0">Assim o cartão aparece na lista.</p><div id="previa"></div></aside></div></div>`;
  const v = (i) => document.getElementById(i);
  function midiaAtual() {
    const tem = arquivo || (a.midia && !removerMidia);
    v('midia-atual').innerHTML = tem ? `<span class="selo ok">${arquivo ? esc(arquivo.name) : 'Mídia atual mantida'}</span><button type="button" class="btn sec mini" id="rm-midia">Remover</button>` : '<span class="muted">Nenhuma mídia anexada.</span>';
    const rm = v('rm-midia'); if (rm) rm.onclick = () => { arquivo = null; removerMidia = true; if (urlLocal) URL.revokeObjectURL(urlLocal); urlLocal = null; v('arquivo').value = ''; midiaAtual(); previa(); };
  }
  function previa() {
    const cat = v('categoria').value;
    const t = v('titulo').value.trim(), tx = v('texto').value;
    const src = arquivo ? urlLocal : (a.midia && !removerMidia ? urlMidia(a.midia) : null);
    const ehVideo = arquivo ? arquivo.type.startsWith('video/') : a.midia_tipo === 'video';
    v('ct').textContent = `${v('titulo').value.length}/150`;
    v('previa').innerHTML = `<article class="aviso-resumo nao-lido ${v('fixado').checked ? 'fixado' : ''}" style="pointer-events:none"><div class="abrir" style="cursor:default">
      ${src ? (ehVideo ? `<div class="thumb video"><video src="${src}#t=0.1" preload="metadata" muted></video><span class="play">▶</span></div>` : `<div class="thumb"><img src="${src}" alt=""></div>`) : `<div class="thumb vazia cat-${cat}">${icone('avisos')}</div>`}
      <div class="corpo"><div class="linha topo-card"><span class="selo">${CATEGORIAS[cat]}</span>${v('fixado').checked ? `<span class="pin">${icone('pin')}</span>` : ''}${v('data_evento').value ? `<span class="selo ok">${dataBR(v('data_evento').value)}</span>` : ''}</div>
      <h3>${esc(t || 'Título do aviso')}</h3><p>${esc(excerto(tx) || 'O início da mensagem aparece aqui.')}</p><span class="meta muted pequeno">${fmtData(hoje())}</span></div></div></article>`;
  }
  ['titulo', 'texto', 'categoria', 'data_evento', 'fixado'].forEach((i) => v(i).addEventListener('input', previa));
  function escolher(f) {
    if (!f) return;
    if (!/^(image|video)\//.test(f.type)) { v('er').textContent = 'Envie uma foto ou um vídeo.'; return; }
    v('er').textContent = '';
    arquivo = f; removerMidia = false;
    if (urlLocal) URL.revokeObjectURL(urlLocal);
    urlLocal = URL.createObjectURL(f);
    midiaAtual(); previa();
  }
  v('arquivo').onchange = (e) => escolher(e.target.files[0]);
  const zona = v('zona');
  ['dragover', 'dragenter'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('sobre'); }));
  zona.addEventListener('drop', (e) => escolher(e.dataTransfer.files[0]));
  midiaAtual(); previa();
  v('fa').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('titulo', v('titulo').value); fd.append('texto', v('texto').value); fd.append('categoria', v('categoria').value);
    fd.append('data_evento', v('data_evento').value);
    if (v('fixado').checked) fd.append('fixado', 'true');
    if (arquivo) fd.append('arquivo', arquivo);
    if (removerMidia && !arquivo) fd.append('remover_midia', 'true');
    const fim = enviando(v('salvar'), id ? 'Salvando…' : 'Publicando…');
    try { await api(id ? `/api/avisos/${id}` : '/api/avisos', { method: id ? 'PUT' : 'POST', form: fd }); toast(id ? 'Aviso atualizado.' : 'Aviso publicado.'); location.hash = '#/avisos'; }
    catch (err) { fim(); v('er').textContent = err.message; }
  };
}

/* ---------- membros ---------- */
async function telaMembros(el) {
  let q = '', status = 'ativos';
  async function carregar() {
    const lista = await api(`/api/membros?q=${encodeURIComponent(q)}&status=${status}`);
    document.getElementById('lista-m').innerHTML = lista.length ? lista.map((m) => `<div class="membro"><div class="avatar" aria-hidden="true">${esc(iniciais(m.nome))}</div>
      <div class="info"><strong>${esc(m.nome)}</strong> ${m.ativo ? '' : '<span class="selo cinza">Inativo</span>'}<br><span class="muted pequeno">${esc(fmtTel(m.telefone) || 'sem telefone')} · ${m.funcao === 'coordenacao' ? 'Coordenação' : 'Usuário'}</span></div>
      <div class="acoes"><button class="btn sec mini" data-a="editar" data-id="${m.id}" aria-label="Editar ${esc(m.nome)}">Editar</button>
      ${m.ativo ? `<button class="btn sec mini" data-a="inativar" data-id="${m.id}" aria-label="Inativar ${esc(m.nome)}">Inativar</button>` : `<button class="btn sec mini" data-a="reativar" data-id="${m.id}">Reativar</button>`}
      <button class="btn sec mini" data-a="mais" data-id="${m.id}" aria-label="Dados pessoais de ${esc(m.nome)}">LGPD</button></div></div>`).join('') : '<p class="vazio">Nenhum membro encontrado.</p>';
    document.getElementById('total').textContent = `${lista.length} pessoa(s) ${status === 'ativos' ? 'ativa(s)' : ''}`;
    document.getElementById('lista-m').onclick = async (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const m = lista.find((x) => x.id === +b.dataset.id);
      try {
        if (b.dataset.a === 'editar') formMembro(m, carregar);
        else if (b.dataset.a === 'inativar') { if (confirmar(`Inativar ${m.nome}? O histórico de frequência é mantido e você pode reativar depois.`)) { await api(`/api/membros/${m.id}/inativar`, { method: 'POST' }); toast('Membro inativado.'); carregar(); } }
        else if (b.dataset.a === 'reativar') { await api(`/api/membros/${m.id}/reativar`, { method: 'POST' }); toast('Membro reativado.'); carregar(); }
        else if (b.dataset.a === 'mais') dadosPessoais(m, carregar);
      } catch (err) { toast(err.message, true); }
    };
  }
  el.innerHTML = `<div class="pilha"><div class="linha entre"><div><span id="total" class="muted"></span></div><button class="btn" id="novo">Cadastrar membro</button></div>
    <div class="linha"><input type="search" id="q" placeholder="Buscar por nome ou telefone" aria-label="Buscar membro" style="max-width:320px">
      <select id="st" aria-label="Filtrar por situação" style="max-width:180px"><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></div>
    <div class="card" id="lista-m"></div></div>`;
  let t; document.getElementById('q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value; carregar(); }, 250); };
  document.getElementById('st').onchange = (e) => { status = e.target.value; carregar(); };
  document.getElementById('novo').onclick = () => formMembro(null, carregar);
  carregar();
}

function formMembro(m, depois) {
  const d = dialogo(`<form id="fm" novalidate><h3>${m ? 'Editar membro' : 'Cadastrar membro'}</h3>
    <div class="campo"><label for="nome">Nome completo</label><input id="nome" type="text" required value="${esc(m?.nome || '')}"></div>
    <div class="form-grade"><div class="campo"><label for="tel">Telefone (com DDD)</label><input id="tel" type="text" inputmode="tel" placeholder="(47) 99999-9999" value="${esc(fmtTel(m?.telefone))}"></div>
      <div class="campo"><label for="nasc">Data de nascimento</label><input id="nasc" type="date" value="${esc(m?.data_nascimento || '')}"></div></div>
    <div class="form-grade"><div class="campo"><label for="mail">E-mail (só para quem acessa o sistema)</label><input id="mail" type="email" value="${esc(m?.email || '')}"></div>
      <div class="campo"><label for="fn">Função</label><select id="fn"><option value="membro">Usuário</option><option value="coordenacao" ${m?.funcao === 'coordenacao' ? 'selected' : ''}>Coordenação</option></select></div></div>
    <div class="campo"><label for="pw">${m ? 'Nova senha (deixe em branco para manter)' : 'Senha de acesso (opcional)'}</label><input id="pw" type="password" autocomplete="new-password"></div>
    <label><input type="checkbox" id="lgpd" ${m?.consentimento_lgpd_em ? 'checked disabled' : ''}> A pessoa consentiu com o uso dos seus dados pela pastoral (LGPD)</label>
    <p class="erro-msg" id="er" role="alert"></p>
    <div class="linha"><button class="btn">Salvar</button><button type="button" class="btn sec" id="cancelar">Cancelar</button></div></form>`);
  const tel = d.querySelector('#tel');
  tel.oninput = () => { const n = tel.value.replace(/\D/g, '').slice(0, 11); tel.value = fmtTel(n) || n; };
  d.querySelector('#cancelar').onclick = () => d.close();
  d.querySelector('#fm').onsubmit = async (e) => {
    e.preventDefault();
    const body = { nome: d.querySelector('#nome').value, telefone: tel.value, data_nascimento: d.querySelector('#nasc').value, email: d.querySelector('#mail').value, funcao: d.querySelector('#fn').value, senha: d.querySelector('#pw').value, consentimento: d.querySelector('#lgpd').checked };
    try { await api(m ? `/api/membros/${m.id}` : '/api/membros', { method: m ? 'PUT' : 'POST', body }); d.close(); toast(m ? 'Membro atualizado.' : 'Membro cadastrado.'); depois(); }
    catch (err) { d.querySelector('#er').textContent = err.message; }
  };
}

function dadosPessoais(m, depois) {
  const d = dialogo(`<h3>Dados pessoais: ${esc(m.nome)}</h3>
    <p class="muted">Consentimento: ${m.consentimento_lgpd_em ? 'registrado em ' + fmtData(m.consentimento_lgpd_em) : 'não registrado'}.</p>
    <div class="linha"><a class="btn sec" style="text-decoration:none" href="/api/membros/${m.id}/exportar">Exportar dados (JSON)</a>
    <button class="btn perigo" id="anon">Apagar dados pessoais</button><button class="btn sec" id="fechar">Fechar</button></div>
    <p class="pequeno muted">Apagar remove nome, telefone, e-mail, nascimento e foto. As presenças ficam no histórico sem identificação. Não dá para desfazer.</p>`);
  d.querySelector('#fechar').onclick = () => d.close();
  d.querySelector('#anon').onclick = async () => {
    if (!confirmar(`Apagar definitivamente os dados pessoais de ${m.nome}?`)) return;
    try { await api(`/api/membros/${m.id}/anonimizar`, { method: 'POST' }); d.close(); toast('Dados apagados.'); depois(); } catch (err) { toast(err.message, true); }
  };
}

/* ---------- configurações (perfil e permissões) ---------- */
async function telaConfiguracoes(el, aba = 'perfil') {
  if (aba === 'aparencia' && !ehMestre()) { location.replace('#/configuracoes'); return; }
  el.innerHTML = `${ehMestre() ? `<nav class="abas" aria-label="Seções de configurações"><a href="#/configuracoes/perfil" ${aba !== 'aparencia' ? 'aria-current="page"' : ''}>Meu perfil</a><a href="#/configuracoes/aparencia" ${aba === 'aparencia' ? 'aria-current="page"' : ''}>Aparência</a></nav>` : ''}<div id="cfg"></div>`;
  const alvo = document.getElementById('cfg');
  if (aba === 'aparencia') return abaAparencia(alvo);
  abaPerfil(alvo);
}

const TEMAS = [
  ['Azul clássico', '#1d3766', '#c8962c'], ['Verde sereno', '#14532d', '#e9b949'], ['Vinho', '#6b1d3a', '#e0b15a'],
  ['Roxo real', '#4a2a82', '#f0b84b'], ['Grafite', '#2b3345', '#2bb3a3'], ['Oceano', '#0b4f6c', '#f29e4c'],
];

function abaAparencia(el) {
  let salva = { cor_principal: marca.cor_principal, cor_secundaria: marca.cor_secundaria };
  let atual = { ...salva };
  el.innerHTML = `<div class="aparencia-grid">
    <section class="card"><h3>Cores da marca</h3>
      <p class="muted pequeno" style="margin-top:0">A cor principal vale para menu, botões e títulos. A secundária, para destaques. A tela inteira muda enquanto você escolhe; só vale para todos depois de salvar.</p>
      <div class="presets" role="group" aria-label="Temas prontos">${TEMAS.map(([n, p1, s1], i) => `<button type="button" class="preset" data-tema="${i}" aria-pressed="false"><i style="background:linear-gradient(135deg, ${p1} 50%, ${s1} 50%)"></i>${n}</button>`).join('')}</div>
      <div class="campo"><label for="cp-hex">Cor principal</label><div class="cor-linha"><input type="color" id="cp" aria-label="Escolher cor principal"><input type="text" id="cp-hex" maxlength="7" spellcheck="false" autocomplete="off"><span class="contraste" id="cp-c"></span></div></div>
      <div class="campo"><label for="cs-hex">Cor secundária</label><div class="cor-linha"><input type="color" id="cs" aria-label="Escolher cor secundária"><input type="text" id="cs-hex" maxlength="7" spellcheck="false" autocomplete="off"><span class="contraste" id="cs-c"></span></div></div>
      <p class="erro-msg" id="er-cor" role="alert"></p>
      <div class="linha"><button class="btn" id="salvar-cores" disabled>Salvar cores</button><button class="btn sec" id="desfazer" disabled>Desfazer alterações</button><button class="btn sec" id="restaurar">Restaurar padrão</button></div></section>
    <div class="pilha">
      <section class="card"><h3>Logotipo</h3>
        <p class="muted pequeno" style="margin-top:0">Aparece no menu e na tela de login. Prefira imagem quadrada ou com fundo transparente (PNG, JPG ou WebP, até 2 MB).</p>
        <div class="logo-previa"><div class="tile escuro">${logoHtml()}</div><div class="tile claro">${logoHtml()}</div></div>
        <label class="zona-drop" id="zona-logo"><input type="file" id="arq-logo" accept="image/png,image/jpeg,image/webp" class="sr"><span>${icone('galeria')}<strong>Escolha o logotipo</strong> ou arraste para cá</span></label>
        <div class="linha" style="margin-top:.75rem"><button class="btn sec" id="remover-logo" ${marca.logo ? '' : 'disabled'}>Remover logotipo</button></div>
        <p class="erro-msg" id="er-logo" role="alert"></p></section>
      <section class="card"><h3>Prévia</h3><div class="mini-previa" aria-hidden="true"><div class="m-menu"><i class="ativo"></i><i></i><i></i><i></i></div>
        <div class="m-corpo"><div class="m-banner">Que bom ter você aqui</div><div class="linha"><span class="btn mini">Botão principal</span><span class="btn mini ouro">Destaque</span><span class="selo">Selo</span></div></div></div></section></div></div>`;
  const v = (i) => document.getElementById(i);
  const HEX = /^#[0-9a-f]{6}$/i;
  function validar() {
    const pOk = HEX.test(atual.cor_principal), sOk = HEX.test(atual.cor_secundaria);
    const cp = pOk ? contrasteHex(atual.cor_principal, '#ffffff') : 0, cs = sOk ? contrasteHex(atual.cor_secundaria, '#2a1c05') : 0;
    const chip = (elc, ok, r, txt) => { elc.className = `contraste ${ok ? 'ok' : 'ruim'}`; elc.textContent = ok ? `Contraste ${r.toFixed(1)}:1 ✓` : txt; };
    chip(v('cp-c'), pOk && cp >= 4.5, cp, pOk ? `Clara demais (${cp.toFixed(1)}:1)` : 'Use #RRGGBB');
    chip(v('cs-c'), sOk && cs >= 4.5, cs, sOk ? `Escura demais (${cs.toFixed(1)}:1)` : 'Use #RRGGBB');
    const valido = pOk && sOk && cp >= 4.5 && cs >= 4.5;
    const mudou = atual.cor_principal.toLowerCase() !== salva.cor_principal.toLowerCase() || atual.cor_secundaria.toLowerCase() !== salva.cor_secundaria.toLowerCase();
    v('salvar-cores').disabled = !(valido && mudou);
    v('desfazer').disabled = !mudou;
    v('er-cor').textContent = '';
    if (pOk && sOk) { aplicarMarca({ ...marca, ...atual }, false); estado.previa = mudou; }
    document.querySelectorAll('.preset').forEach((b) => { const t = TEMAS[+b.dataset.tema]; b.setAttribute('aria-pressed', String(t[1] === atual.cor_principal.toLowerCase() && t[2] === atual.cor_secundaria.toLowerCase())); });
  }
  function preencher() {
    v('cp').value = HEX.test(atual.cor_principal) ? atual.cor_principal : '#000000'; v('cp-hex').value = atual.cor_principal;
    v('cs').value = HEX.test(atual.cor_secundaria) ? atual.cor_secundaria : '#000000'; v('cs-hex').value = atual.cor_secundaria;
    validar();
  }
  v('cp').oninput = (e) => { atual.cor_principal = e.target.value; v('cp-hex').value = e.target.value; validar(); };
  v('cs').oninput = (e) => { atual.cor_secundaria = e.target.value; v('cs-hex').value = e.target.value; validar(); };
  const hex = (campo, cor) => (e) => { let t = e.target.value.trim(); if (t && t[0] !== '#') t = `#${t}`; atual[campo] = t; if (HEX.test(t)) v(cor).value = t; validar(); };
  v('cp-hex').oninput = hex('cor_principal', 'cp'); v('cs-hex').oninput = hex('cor_secundaria', 'cs');
  document.querySelectorAll('.preset').forEach((b) => { b.onclick = () => { const t = TEMAS[+b.dataset.tema]; atual = { cor_principal: t[1], cor_secundaria: t[2] }; preencher(); }; });
  v('desfazer').onclick = () => { atual = { ...salva }; preencher(); };
  v('salvar-cores').onclick = async () => {
    try { const m = await api('/api/marca/cores', { method: 'PUT', body: atual }); estado.previa = false; aplicarMarca(m); salva = { cor_principal: m.cor_principal, cor_secundaria: m.cor_secundaria }; atual = { ...salva }; preencher(); toast('Cores salvas para todos os usuários.'); }
    catch (err) { v('er-cor').textContent = err.message; }
  };
  v('restaurar').onclick = async () => {
    if (!confirmar('Voltar às cores e ao logotipo originais para todos os usuários?')) return;
    try { const m = await api('/api/marca/restaurar', { method: 'POST' }); estado.previa = false; aplicarMarca(m); estado.reconstruir = true; toast('Marca restaurada.'); rotear(); } catch (err) { toast(err.message, true); }
  };
  async function enviarLogo(f) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { v('er-logo').textContent = 'O logotipo precisa ser PNG, JPG ou WebP.'; return; }
    const fd = new FormData(); fd.append('arquivo', f);
    try { const m = await api('/api/marca/logo', { method: 'POST', form: fd }); estado.previa = false; aplicarMarca({ ...m, cor_principal: marca.cor_principal, cor_secundaria: marca.cor_secundaria }); marca.logo = m.logo; estado.reconstruir = true; toast('Logotipo atualizado.'); rotear(); }
    catch (err) { v('er-logo').textContent = err.message; }
  }
  v('arq-logo').onchange = (e) => { enviarLogo(e.target.files[0]); e.target.value = ''; };
  const zona = v('zona-logo');
  ['dragover', 'dragenter'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.remove('sobre'); }));
  zona.addEventListener('drop', (e) => enviarLogo(e.dataTransfer.files[0]));
  v('remover-logo').onclick = async () => {
    try { const m = await api('/api/marca/logo', { method: 'DELETE' }); marca.logo = null; aplicarMarca({ ...marca, logo: null }); estado.reconstruir = true; toast('Logotipo removido.'); rotear(); } catch (err) { toast(err.message, true); }
  };
  preencher();
  estado.previa = false; // nada alterado ainda
}

function abaPerfil(el) {
  const u = estado.usuario;
  const info = (rot, v) => `<li><span class="muted pequeno">${rot}</span><strong>${esc(v || '—')}</strong></li>`;
  const nomesGuias = Object.fromEntries(ROTAS.map((r) => [r.id, r.rotulo]));
  el.innerHTML = `<div class="cfg-grid">
    <aside class="card perfil-card"><div class="capa"></div>
      <div class="perfil-avatar">${u.foto ? `<img class="avatar grande" src="/uploads/${esc(u.foto)}" alt="Sua foto">` : `<div class="avatar grande" aria-hidden="true">${esc(iniciais(u.nome))}</div>`}</div>
      <h3>${esc(u.nome)}</h3><span class="selo ${ehMestre() ? 'ouro' : ''}">${papelRotulo()}</span>
      <ul class="perfil-info">${info('E-mail', u.email)}${info('Telefone', fmtTel(u.telefone))}${info('Aniversário', u.data_nascimento ? dataBR(u.data_nascimento) : '')}</ul>
      <label class="btn sec foto-btn">${icone('pessoas')} Alterar foto<input type="file" id="foto" accept="image/jpeg,image/png,image/webp" class="sr"></label>
      <small class="muted">JPG, PNG ou WebP, até 3 MB.</small></aside>
    <div class="pilha">
      <form class="card" id="fp" novalidate><h3>Seus dados</h3>
        <div class="form-grade">
          <div class="campo"><label for="nome">Nome completo</label><input id="nome" type="text" value="${esc(u.nome)}" required></div>
          <div class="campo"><label for="mail">E-mail</label><input id="mail" type="email" value="${esc(u.email || '')}" required></div>
          <div class="campo"><label for="tel">Telefone</label><input id="tel" type="text" inputmode="tel" placeholder="(47) 99999-9999" value="${esc(fmtTel(u.telefone))}"></div>
          <div class="campo"><label for="nasc">Aniversário</label><input id="nasc" type="date" value="${esc(u.data_nascimento || '')}"></div></div>
        <p class="erro-msg" id="e1" role="alert"></p><button class="btn">Salvar alterações</button></form>
      <form class="card" id="fs" novalidate><h3>Alterar senha</h3>
        <div class="form-grade">
          <div class="campo"><label for="sa">Senha atual</label><input id="sa" type="password" autocomplete="current-password"></div>
          <span></span>
          <div class="campo"><label for="ns">Nova senha</label><input id="ns" type="password" autocomplete="new-password"></div>
          <div class="campo"><label for="cs">Confirmar nova senha</label><input id="cs" type="password" autocomplete="new-password"></div></div>
        <div class="forca"><i id="forca-barra"></i></div><small id="forca" class="muted">Mínimo de 8 caracteres, com letras e números.</small>
        <p class="erro-msg" id="e2" role="alert"></p><button class="btn">Alterar senha</button></form>
      <section class="card"><h3>Suas guias</h3><p class="muted pequeno" style="margin-top:0">O que está liberado no seu menu. Quem define isso é a administração.</p>
        <div class="linha">${u.guias.map((g) => `<span class="selo ok">${esc(nomesGuias[g] || g)}</span>`).join('')}</div></section></div></div>`;
  const tel = document.getElementById('tel');
  tel.oninput = () => { const n = tel.value.replace(/\D/g, '').slice(0, 11); tel.value = fmtTel(n) || n; };
  document.getElementById('ns').oninput = (e) => {
    const v = e.target.value; const pts = (v.length >= 8) + /[A-Za-z]/.test(v) + /\d/.test(v) + (v.length >= 12 || /[^A-Za-z0-9]/.test(v));
    document.getElementById('forca').textContent = v ? ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'][pts] : 'Mínimo de 8 caracteres, com letras e números.';
    const barra = document.getElementById('forca-barra');
    barra.style.width = `${v ? (pts / 4) * 100 : 0}%`;
    barra.style.background = ['#b3261e', '#b3261e', '#d08a2a', '#7cb342', '#247a4a'][pts];
  };
  document.getElementById('foto').onchange = async (e) => {
    if (!e.target.files[0]) return;
    const f = new FormData(); f.append('arquivo', e.target.files[0]);
    try { const r = await api('/api/me/foto', { method: 'POST', form: f }); estado.usuario.foto = r.foto; estado.reconstruir = true; toast('Foto atualizada.'); rotear(); } catch (err) { toast(err.message, true); }
  };
  document.getElementById('fp').onsubmit = async (e) => {
    e.preventDefault();
    try { estado.usuario = await api('/api/me', { method: 'PUT', body: { nome: document.getElementById('nome').value, telefone: tel.value, data_nascimento: document.getElementById('nasc').value, email: document.getElementById('mail').value } }); toast('Dados atualizados.'); estado.reconstruir = true; rotear(); }
    catch (err) { document.getElementById('e1').textContent = err.message; }
  };
  document.getElementById('fs').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/me/senha', { method: 'PUT', body: { senha_atual: document.getElementById('sa').value, nova_senha: document.getElementById('ns').value, confirmacao: document.getElementById('cs').value } }); toast('Senha alterada.'); e.target.reset(); document.getElementById('e2').textContent = ''; document.getElementById('forca-barra').style.width = 0; }
    catch (err) { document.getElementById('e2').textContent = err.message; }
  };
}

/* ---------- usuários e acessos (só administrador) ---------- */
async function telaUsuarios(el) {
  const d = await api('/api/usuarios');
  let busca = '', filtroCargo = '', mostrar = 'ativos';
  const nomesCargo = d.cargos;
  const padroesTxt = (c) => d.guias.filter((g) => d.padroes[c].includes(g.id)).map((g) => g.rotulo).join(', ') || 'nenhuma';
  function desenhar() {
    const t = busca.toLowerCase();
    const lista = d.usuarios.filter((u) => (u.nome + ' ' + (u.email || '')).toLowerCase().includes(t) && (!filtroCargo || u.cargo === filtroCargo) && (mostrar === 'todos' || u.ativo));
    document.getElementById('u-total').textContent = `${lista.length} de ${d.usuarios.length} usuário(s)`;
    document.getElementById('perm-corpo').innerHTML = lista.length ? lista.map((u) => {
      const adm = u.cargo === 'administrador';
      return `<tr class="${u.ativo ? '' : 'inativo'}">
      <td data-label="Pessoa"><strong>${esc(u.nome)}</strong>${u.eu ? ' <span class="selo ouro">você</span>' : ''}<br><span class="muted pequeno">${esc(u.email || 'sem e-mail')}</span></td>
      <td data-label="Cargo"><select data-cargo="${u.id}" aria-label="Cargo de ${esc(u.nome)}" ${u.eu ? 'disabled title="Você não pode mudar o seu próprio cargo"' : ''}>${Object.entries(nomesCargo).map(([k, v]) => `<option value="${k}" ${u.cargo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      ${d.guias.map((g) => { const c = u.guias[g.id]; return `<td data-label="${esc(g.rotulo)}" class="celula-guia"><label class="switch"><input type="checkbox" role="switch" data-u="${u.id}" data-g="${g.id}" ${c.liberado || adm ? 'checked' : ''} ${adm ? 'disabled' : ''} aria-label="${esc(g.rotulo)} para ${esc(u.nome)}"><span class="trilho"></span></label>${c.personalizado && !adm ? '<i class="ponto-custom" title="Diferente do padrão do cargo"></i>' : ''}</td>`; }).join('')}
      <td data-label="Ativo" class="celula-guia"><label class="switch"><input type="checkbox" role="switch" data-ativo="${u.id}" ${u.ativo ? 'checked' : ''} ${u.eu ? 'disabled' : ''} aria-label="Conta ativa de ${esc(u.nome)}"><span class="trilho"></span></label></td>
      <td data-label=""><button class="btn sec mini" data-restaurar="${u.id}" ${!adm && Object.values(u.guias).some((c) => c.personalizado) ? '' : 'disabled'}>Restaurar</button></td></tr>`;
    }).join('') : `<tr><td colspan="${d.guias.length + 4}" class="vazio">Nenhum usuário encontrado.</td></tr>`;
  }
  el.innerHTML = `<div class="pilha">
    <section class="card"><div class="linha entre"><div style="flex:1;min-width:260px"><h3 style="margin:0">Como funcionam os acessos</h3>
      <ul class="pequeno muted" style="margin:.4rem 0 0;padding-left:1.1rem">
        <li>Quem se cadastra entra como <strong>Usuário</strong>: vê ${padroesTxt('membro')} (e Painel e Configurações, sempre).</li>
        <li>Aqui você muda o <strong>cargo</strong> (Usuário, Coordenação ou Administrador) e libera ou bloqueia <strong>guias</strong> para pessoas específicas.</li>
        <li>Trocar o cargo volta as guias ao padrão do novo cargo. Coordenação vê ${padroesTxt('coordenacao')}. Administrador vê tudo, inclusive esta página.</li></ul></div>
      <label class="switch-linha"><span class="switch"><input type="checkbox" role="switch" id="cad-aberto" ${d.cadastro_aberto ? 'checked' : ''}><span class="trilho"></span></span><span><strong>Cadastro aberto</strong><br><small class="muted">Permite criar conta pela tela de login.</small></span></label></div></section>
    <section class="card"><div class="linha" style="margin-bottom:.5rem"><span id="u-total" class="muted" style="flex:1"></span>
      <input type="search" id="pb" placeholder="Buscar nome ou e-mail" aria-label="Buscar usuário" style="max-width:260px">
      <select id="fc" aria-label="Filtrar por cargo" style="max-width:190px"><option value="">Todos os cargos</option>${Object.entries(nomesCargo).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select id="fs2" aria-label="Filtrar por situação" style="max-width:150px"><option value="ativos">Ativos</option><option value="todos">Todos</option></select></div>
      <div class="tabela-rolagem"><table class="empilha perm"><thead><tr><th>Pessoa</th><th>Cargo</th>${d.guias.map((g) => `<th style="text-align:center">${esc(g.rotulo)}</th>`).join('')}<th style="text-align:center">Ativo</th><th></th></tr></thead><tbody id="perm-corpo"></tbody></table></div></section></div>`;
  desenhar();
  document.getElementById('pb').oninput = (e) => { busca = e.target.value; desenhar(); };
  document.getElementById('fc').onchange = (e) => { filtroCargo = e.target.value; desenhar(); };
  document.getElementById('fs2').onchange = (e) => { mostrar = e.target.value; desenhar(); };
  document.getElementById('cad-aberto').onchange = async (e) => {
    try { const r = await api('/api/usuarios/cadastro', { method: 'PUT', body: { aberto: e.target.checked } }); toast(r.cadastro_aberto ? 'Cadastro aberto.' : 'Cadastro fechado.'); } catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
  };
  const corpo = document.getElementById('perm-corpo');
  const aplicar = (u, novo) => { Object.assign(u, novo); desenhar(); };
  corpo.onchange = async (e) => {
    const i = e.target;
    try {
      if (i.dataset.g) {
        const u = d.usuarios.find((x) => x.id === +i.dataset.u);
        aplicar(u, await api(`/api/usuarios/${u.id}/guias`, { method: 'PUT', body: { guia: i.dataset.g, liberado: i.checked } }));
        toast(`${d.guias.find((g) => g.id === i.dataset.g).rotulo} ${i.checked ? 'liberada' : 'bloqueada'} para ${u.nome.split(' ')[0]}.`);
      } else if (i.dataset.cargo) {
        const u = d.usuarios.find((x) => x.id === +i.dataset.cargo);
        if (i.value === 'administrador' && !confirmar(`Tornar ${u.nome} administrador? Administradores têm acesso total, inclusive a esta página.`)) return desenhar();
        aplicar(u, await api(`/api/usuarios/${u.id}/cargo`, { method: 'PUT', body: { cargo: i.value } }));
        toast(`${u.nome.split(' ')[0]} agora é ${nomesCargo[u.cargo]}.`);
      } else if (i.dataset.ativo) {
        const u = d.usuarios.find((x) => x.id === +i.dataset.ativo);
        aplicar(u, await api(`/api/usuarios/${u.id}/ativo`, { method: 'PUT', body: { ativo: i.checked } }));
        toast(`Conta de ${u.nome.split(' ')[0]} ${u.ativo ? 'reativada' : 'desativada'}.`);
      }
    } catch (err) { toast(err.message, true); desenhar(); }
  };
  corpo.onclick = async (e) => {
    const b = e.target.closest('[data-restaurar]'); if (!b) return;
    const u = d.usuarios.find((x) => x.id === +b.dataset.restaurar);
    try { aplicar(u, await api(`/api/usuarios/${u.id}/restaurar`, { method: 'POST' })); toast(`Padrão restaurado para ${u.nome.split(' ')[0]}.`); } catch (err) { toast(err.message, true); }
  };
}

/* ---------- galeria ---------- */
const urlFoto = (f) => `/uploads/${encodeURIComponent(f)}`;

async function telaGaleria(el, id) {
  if (id) return telaEventoGaleria(el, +id);
  const eventos = await api('/api/galeria');
  el.innerHTML = `<div class="pilha">
    <div class="linha entre"><p class="muted" style="margin:0">${eventos.length ? `${eventos.length} evento(s) na galeria.` : ''}</p>
      ${ehCoord() ? '<button class="btn ouro" id="novo-evento">+ Novo evento</button>' : ''}</div>
    ${eventos.length ? `<div class="grade-eventos">${eventos.map((e) => `<a class="evento-card" href="#/galeria/${e.id}">
      <div class="capa-evento">${e.capa ? `<img src="${urlFoto(e.capa)}" alt="Capa do evento ${esc(e.titulo)}" loading="lazy">` : `<div class="sem-capa">${icone('galeria')}</div>`}<span class="contador-fotos">${e.total_fotos} foto${e.total_fotos === 1 ? '' : 's'}</span></div>
      <div class="info-evento"><strong>${esc(e.titulo)}</strong><span class="muted pequeno">${fmtData(e.data_evento)}</span></div></a>`).join('')}</div>`
      : `<div class="card vazio">${icone('galeria')}<p>Nenhum evento na galeria ainda.${ehCoord() ? ' Crie o primeiro pelo botão acima.' : ''}</p></div>`}</div>`;
  if (ehCoord()) document.getElementById('novo-evento').onclick = () => formEvento(null, (novo) => { location.hash = `#/galeria/${novo.id}`; });
}

function formEvento(e, depois) {
  const d = dialogo(`<form id="fe" novalidate><h3>${e ? 'Editar evento' : 'Novo evento'}</h3>
    <div class="campo"><label for="et">Título do evento</label><input id="et" type="text" maxlength="150" value="${esc(e?.titulo || '')}" placeholder="Ex.: Festa de Nossa Senhora Aparecida"></div>
    <div class="campo"><label for="ed">Data do evento</label><input id="ed" type="date" value="${esc(e?.data_evento || hoje())}"></div>
    <div class="campo"><label for="ex">Descrição (opcional)</label><textarea id="ex" maxlength="1000">${esc(e?.descricao || '')}</textarea></div>
    <p class="erro-msg" id="er" role="alert"></p>
    <div class="linha"><button class="btn">${e ? 'Salvar' : 'Criar evento'}</button><button type="button" class="btn sec" id="cancelar">Cancelar</button></div></form>`);
  d.querySelector('#cancelar').onclick = () => d.close();
  d.querySelector('#fe').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const r = await api(e ? `/api/galeria/${e.id}` : '/api/galeria', { method: e ? 'PUT' : 'POST', body: { titulo: d.querySelector('#et').value, data_evento: d.querySelector('#ed').value, descricao: d.querySelector('#ex').value } });
      d.close(); toast(e ? 'Evento atualizado.' : 'Evento criado. Agora adicione as fotos.'); depois(r);
    } catch (err) { d.querySelector('#er').textContent = err.message; }
  };
}

async function telaEventoGaleria(el, id) {
  const e = await api(`/api/galeria/${id}`);
  const podeEditar = ehCoord();
  el.innerHTML = `<div class="pilha">
    <a href="#/galeria" class="voltar">‹ Todos os eventos</a>
    <section class="card cabecalho-evento"><div style="flex:1;min-width:240px"><h2 style="margin:0">${esc(e.titulo)}</h2>
      <p class="muted" style="margin:.2rem 0 0">${fmtData(e.data_evento)} · ${e.fotos.length} foto${e.fotos.length === 1 ? '' : 's'}</p>
      ${e.descricao ? `<p style="margin:.6rem 0 0;white-space:pre-wrap">${esc(e.descricao)}</p>` : ''}</div>
      <div class="linha">
        ${e.fotos.length ? `<a class="btn sec" id="baixar-tudo" href="/api/galeria/${e.id}/download">Baixar todas (.zip)</a>` : ''}
        ${podeEditar ? '<button class="btn ouro" id="add-fotos">+ Adicionar fotos</button><button class="btn sec" id="edit-evento">Editar evento</button><button class="btn sec" id="del-evento">Excluir evento</button>' : ''}</div></section>
    ${e.fotos.length ? `<div class="grade-fotos">${e.fotos.map((f, i) => `<button type="button" class="foto" data-i="${i}" aria-label="Abrir foto ${esc(f.titulo || i + 1)}">
      <img src="${urlFoto(f.arquivo)}" alt="${esc(f.titulo || 'Foto do evento')}" loading="lazy"><span class="legenda">${esc(f.titulo || '')}</span></button>`).join('')}</div>`
      : `<div class="card vazio">${icone('galeria')}<p>Este evento ainda não tem fotos.${podeEditar ? ' Use "Adicionar fotos".' : ''}</p></div>`}</div>`;
  if (G && e.fotos.length) G.from('.grade-fotos .foto', { y: 24, autoAlpha: 0, scale: 0.94, duration: 0.5, ease: 'power3.out', stagger: { each: 0.04, amount: 0.7 }, clearProps: 'transform,opacity,visibility' });
  const recarregar = () => telaEventoGaleria(el, id);
  el.querySelectorAll('.foto').forEach((b) => { b.onclick = () => lightbox(e, +b.dataset.i, podeEditar, recarregar); });
  if (podeEditar) {
    document.getElementById('add-fotos').onclick = () => enviarFotos(e, recarregar);
    document.getElementById('edit-evento').onclick = () => formEvento(e, recarregar);
    document.getElementById('del-evento').onclick = async () => {
      if (!confirmar(`Excluir o evento "${e.titulo}" e as ${e.fotos.length} foto(s)? Esta ação não pode ser desfeita.`)) return;
      try { await api(`/api/galeria/${e.id}`, { method: 'DELETE' }); toast('Evento excluído.'); location.hash = '#/galeria'; } catch (err) { toast(err.message, true); }
    };
  }
}

function lightbox(e, inicio, podeEditar, recarregar) {
  let i = inicio;
  const d = dialogo(`<div class="lb"><button class="lb-fechar btn sec mini" id="lb-x" aria-label="Fechar">✕</button>
    <button class="lb-nav ant" id="lb-ant" aria-label="Foto anterior">‹</button><button class="lb-nav prox" id="lb-prox" aria-label="Próxima foto">›</button>
    <div class="lb-img"><img id="lb-foto" alt=""></div>
    <div class="lb-rodape"><div><strong id="lb-titulo"></strong><div class="muted pequeno" id="lb-pos"></div></div>
      <div class="linha"><a class="btn mini" id="lb-baixar" href="#">Baixar foto</a>
      ${podeEditar ? '<button class="btn sec mini" id="lb-titular">Editar título</button><button class="btn sec mini" id="lb-capa">Usar como capa</button><button class="btn sec mini" id="lb-excluir">Excluir foto</button>' : ''}</div></div></div>`);
  d.classList.add('dlg-lb');
  const img = d.querySelector('#lb-foto');
  function mostrar(dir = 0) {
    const f = e.fotos[i];
    img.src = urlFoto(f.arquivo); img.alt = f.titulo || 'Foto do evento';
    d.querySelector('#lb-titulo').textContent = f.titulo || 'Sem título';
    d.querySelector('#lb-pos').textContent = `${i + 1} de ${e.fotos.length}`;
    d.querySelector('#lb-baixar').href = `/api/galeria/fotos/${f.id}/download`;
    d.querySelector('#lb-ant').hidden = d.querySelector('#lb-prox').hidden = e.fotos.length < 2;
    if (G && dir) G.fromTo(img, { x: dir * 40, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.35, ease: 'power2.out' });
  }
  const ir = (dir) => { i = (i + dir + e.fotos.length) % e.fotos.length; mostrar(dir); };
  d.querySelector('#lb-x').onclick = () => d.close();
  d.querySelector('#lb-ant').onclick = () => ir(-1);
  d.querySelector('#lb-prox').onclick = () => ir(1);
  d.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft') ir(-1); if (ev.key === 'ArrowRight') ir(1); });
  if (podeEditar) {
    const f = () => e.fotos[i];
    d.querySelector('#lb-titular').onclick = async () => {
      const novo = window.prompt('Título da foto:', f().titulo || '');
      if (novo === null) return;
      try { await api(`/api/galeria/fotos/${f().id}`, { method: 'PUT', body: { titulo: novo } }); f().titulo = novo.trim(); mostrar(); toast('Título atualizado.'); } catch (err) { toast(err.message, true); }
    };
    d.querySelector('#lb-capa').onclick = async () => { try { await api(`/api/galeria/${e.id}/capa`, { method: 'PUT', body: { foto_id: f().id } }); toast('Capa do evento atualizada.'); } catch (err) { toast(err.message, true); } };
    d.querySelector('#lb-excluir').onclick = async () => {
      if (!confirmar('Excluir esta foto? Esta ação não pode ser desfeita.')) return;
      try { await api(`/api/galeria/fotos/${f().id}`, { method: 'DELETE' }); d.close(); toast('Foto excluída.'); recarregar(); } catch (err) { toast(err.message, true); }
    };
  }
  d.addEventListener('close', () => { if (podeEditar) recarregar(); });
  mostrar();
}

function enviarFotos(e, depois) {
  const d = dialogo(`<form id="ff" novalidate><h3>Adicionar fotos a "${esc(e.titulo)}"</h3>
    <label class="zona-drop" id="zona"><input type="file" id="arq" accept="image/jpeg,image/png,image/webp" multiple class="sr"><span>${icone('galeria')}<strong>Escolha as fotos</strong> ou arraste para cá<br><small class="muted">JPG, PNG ou WebP · até 20 fotos por vez · 15 MB cada</small></span></label>
    <div id="previas" class="previas"></div><p class="erro-msg" id="er" role="alert"></p>
    <div class="linha"><button class="btn" id="enviar" disabled>Enviar fotos</button><button type="button" class="btn sec" id="cancelar">Cancelar</button></div></form>`);
  let arquivos = [];
  const arq = d.querySelector('#arq');
  function desenhar() {
    d.querySelector('#previas').innerHTML = arquivos.map((f, i) => `<div class="previa"><img src="${URL.createObjectURL(f)}" alt=""><input type="text" maxlength="120" data-t="${i}" value="${esc(f.name.replace(/\.[^.]+$/, ''))}" aria-label="Título da foto ${i + 1}"><button type="button" class="btn sec mini" data-rm="${i}" aria-label="Remover">✕</button></div>`).join('');
    d.querySelector('#enviar').disabled = !arquivos.length;
    d.querySelector('#enviar').textContent = arquivos.length ? `Enviar ${arquivos.length} foto${arquivos.length === 1 ? '' : 's'}` : 'Enviar fotos';
  }
  const adicionar = (lista) => {
    const ok = [...lista].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (ok.length < lista.length) d.querySelector('#er').textContent = 'Alguns arquivos foram ignorados: só JPG, PNG e WebP.';
    arquivos = [...arquivos, ...ok].slice(0, 20); desenhar();
  };
  arq.onchange = () => { adicionar(arq.files); arq.value = ''; };
  const zona = d.querySelector('#zona');
  ['dragover', 'dragenter'].forEach((t) => zona.addEventListener(t, (ev) => { ev.preventDefault(); zona.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (ev) => { ev.preventDefault(); zona.classList.remove('sobre'); }));
  zona.addEventListener('drop', (ev) => adicionar(ev.dataTransfer.files));
  d.querySelector('#previas').onclick = (ev) => { const b = ev.target.closest('[data-rm]'); if (b) { arquivos.splice(+b.dataset.rm, 1); desenhar(); } };
  d.querySelector('#cancelar').onclick = () => d.close();
  d.querySelector('#ff').onsubmit = async (ev) => {
    ev.preventDefault();
    const fim = enviando(d.querySelector('#enviar'), 'Enviando…');
    const fd = new FormData();
    arquivos.forEach((f) => fd.append('fotos', f));
    fd.append('titulos', JSON.stringify([...d.querySelectorAll('[data-t]')].map((i) => i.value)));
    try { const r = await api(`/api/galeria/${e.id}/fotos`, { method: 'POST', form: fd }); d.close(); toast(`${r.adicionadas} foto(s) adicionada(s).`); depois(); }
    catch (err) { fim(); d.querySelector('#er').textContent = err.message; }
  };
}

/* ---------- financeiro ---------- */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = (c) => BRL.format(c / 100);
const mesRotulo = (m) => { const [a, n] = m.split('-'); return `${MESES[+n - 1][0].toUpperCase()}${MESES[+n - 1].slice(1)} de ${a}`; };
const mesCurto = (m) => MESES[+m.split('-')[1] - 1].slice(0, 3);
const somaMes = (m, d) => { const [a, n] = m.split('-').map(Number); const x = new Date(Date.UTC(a, n - 1 + d, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };

function animarValor(el, centavos) {
  if (!G) return (el.textContent = dinheiro(centavos));
  const o = { v: 0 };
  el.textContent = dinheiro(0);
  G.to(o, { v: centavos, duration: 0.9, ease: 'power2.out', onUpdate: () => { el.textContent = dinheiro(Math.round(o.v)); }, onComplete: () => { el.textContent = dinheiro(centavos); } });
}

async function telaFinanceiro(el) {
  let mes = hoje().slice(0, 7), tipo = '', q = '';
  async function carregar(animar = true) {
    const f = await api(`/api/financeiro?mes=${mes}&tipo=${tipo}&q=${encodeURIComponent(q)}`);
    const max = Math.max(1, ...f.serie.flatMap((x) => [x.entradas, x.saidas]));
    const totCat = (t) => f.por_categoria.filter((c) => c.tipo === t);
    const barraCat = (c, cor) => { const tot = totCat(c.tipo).reduce((s, x) => s + x.total, 0) || 1; return `<div style="margin:.55rem 0"><div class="linha entre pequeno"><span>${esc(c.rotulo)}</span><strong>${dinheiro(c.total)}</strong></div><div class="progresso" style="width:100%"><i class="cat-bar" data-w="${Math.round((c.total / tot) * 100)}" style="background:${cor}"></i></div></div>`; };
    el.innerHTML = `<div class="pilha">
      <div class="linha entre">
        <div class="linha"><button class="btn sec mini" id="ant" aria-label="Mês anterior">‹</button>
          <input type="month" id="mes" value="${mes}" aria-label="Mês" style="width:190px"><button class="btn sec mini" id="prox" aria-label="Próximo mês">›</button>
          <strong class="muted">${mesRotulo(mes)}</strong></div>
        <div class="linha"><a class="btn sec" href="/api/financeiro/relatorio.csv?mes=${mes}">Exportar CSV</a><button class="btn ouro" id="novo">+ Novo lançamento</button></div></div>
      <div class="grade fin-kpis">
        <div class="card"><div class="chip-ic verde">${icone('financeiro')}</div><h3>Entradas</h3><div class="kpi money" data-v="${f.resumo.entradas}">${dinheiro(f.resumo.entradas)}</div></div>
        <div class="card"><div class="chip-ic verm">${icone('financeiro')}</div><h3>Saídas</h3><div class="kpi money" data-v="${f.resumo.saidas}">${dinheiro(f.resumo.saidas)}</div></div>
        <div class="card ${f.resumo.saldo < 0 ? 'alerta' : ''}"><div class="chip-ic">${icone('financeiro')}</div><h3>Saldo do mês</h3><div class="kpi money" data-v="${f.resumo.saldo}">${dinheiro(f.resumo.saldo)}</div></div>
        <div class="card"><div class="chip-ic ouro">${icone('financeiro')}</div><h3>Saldo em caixa</h3><div class="kpi money" data-v="${f.saldo_caixa}">${dinheiro(f.saldo_caixa)}</div><span class="muted pequeno">acumulado de todos os meses</span></div></div>
      <div class="grade larga">
        <section class="card"><h3>Últimos 6 meses</h3>
          <div class="grafico" role="img" aria-label="Entradas e saídas dos últimos 6 meses">${f.serie.map((x) => `<div class="col ${x.mes === mes ? 'atual' : ''}"><div class="barras">
            <i class="b-ent" title="Entradas ${dinheiro(x.entradas)}" style="height:${(x.entradas / max) * 100}%"></i><i class="b-sai" title="Saídas ${dinheiro(x.saidas)}" style="height:${(x.saidas / max) * 100}%"></i></div><span>${mesCurto(x.mes)}</span></div>`).join('')}</div>
          <div class="linha pequeno muted"><span><i class="ponto ent"></i> Entradas</span><span><i class="ponto sai"></i> Saídas</span></div></section>
        <section class="card"><h3>Por categoria em ${mesRotulo(mes)}</h3>
          ${f.por_categoria.length ? `${totCat('entrada').length ? '<div class="pequeno muted">Entradas</div>' + totCat('entrada').map((c) => barraCat(c, 'linear-gradient(90deg,#2fae6b,#7be0a8)')).join('') : ''}${totCat('saida').length ? '<div class="pequeno muted" style="margin-top:.8rem">Saídas</div>' + totCat('saida').map((c) => barraCat(c, 'linear-gradient(90deg,#ef6a5f,#f5a49d)')).join('') : ''}` : '<p class="vazio">Sem lançamentos neste mês.</p>'}</section></div>
      <section class="card"><div class="linha" style="margin-bottom:.5rem"><h3 style="margin:0;flex:1">Lançamentos</h3>
        <select id="ft" aria-label="Filtrar por tipo" style="max-width:150px"><option value="">Todos</option><option value="entrada" ${tipo === 'entrada' ? 'selected' : ''}>Entradas</option><option value="saida" ${tipo === 'saida' ? 'selected' : ''}>Saídas</option></select>
        <input type="search" id="fq" placeholder="Buscar descrição" aria-label="Buscar descrição" value="${esc(q)}" style="max-width:240px"></div>
        ${f.lancamentos.length ? `<div class="tabela-rolagem"><table class="empilha"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
          ${f.lancamentos.map((l) => `<tr><td data-label="Data">${dataBR(l.data)}</td><td data-label="Descrição"><strong>${esc(l.descricao)}</strong>${l.observacao ? `<br><span class="muted pequeno">${esc(l.observacao)}</span>` : ''}</td>
            <td data-label="Categoria"><span class="selo ${l.tipo === 'entrada' ? 'ok' : 'alerta'}">${esc(f.categorias[l.categoria])}</span></td>
            <td data-label="Valor" style="text-align:right;font-weight:700;color:var(${l.tipo === 'entrada' ? '--ok' : '--erro'})">${l.tipo === 'entrada' ? '+' : '−'} ${dinheiro(l.valor_centavos)}</td>
            <td><div class="linha" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sec mini" data-a="editar" data-id="${l.id}" aria-label="Editar ${esc(l.descricao)}">Editar</button><button class="btn sec mini" data-a="excluir" data-id="${l.id}" aria-label="Excluir ${esc(l.descricao)}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="vazio">Nenhum lançamento encontrado.</p>'}</section></div>`;

    document.getElementById('mes').onchange = (e) => { if (e.target.value) { mes = e.target.value; carregar(); } };
    document.getElementById('ant').onclick = () => { mes = somaMes(mes, -1); carregar(); };
    document.getElementById('prox').onclick = () => { mes = somaMes(mes, 1); carregar(); };
    document.getElementById('ft').onchange = (e) => { tipo = e.target.value; carregar(false); };
    let t; document.getElementById('fq').oninput = (e) => { clearTimeout(t); t = setTimeout(async () => { q = e.target.value; await carregar(false); const i = document.getElementById('fq'); i.focus(); i.setSelectionRange(q.length, q.length); }, 300); };
    document.getElementById('novo').onclick = () => formLancamento(null, mes, carregar);
    el.querySelectorAll('tbody [data-a]').forEach((b) => { b.onclick = async () => {
      const l = f.lancamentos.find((x) => x.id === +b.dataset.id);
      if (b.dataset.a === 'editar') return formLancamento(l, mes, carregar);
      if (!confirmar(`Excluir "${l.descricao}" (${dinheiro(l.valor_centavos)})? Esta ação não pode ser desfeita.`)) return;
      try { await api(`/api/financeiro/${l.id}`, { method: 'DELETE' }); toast('Lançamento excluído.'); carregar(false); } catch (err) { toast(err.message, true); }
    }; });
    if (G && animar) {
      el.querySelectorAll('.money').forEach((k) => animarValor(k, +k.dataset.v));
      G.from(el.querySelectorAll('.grafico .barras i'), { scaleY: 0, transformOrigin: 'bottom', duration: 0.8, ease: 'power3.out', stagger: 0.05, delay: 0.2 });
    }
    el.querySelectorAll('.cat-bar').forEach((b) => (G ? G.to(b, { width: `${b.dataset.w}%`, duration: 0.8, ease: 'power2.out', delay: 0.3 }) : (b.style.width = `${b.dataset.w}%`)));
  }
  carregar();
}

function formLancamento(l, mes, depois) {
  const cats = { oferta: 'Ofertas', doacao: 'Doações', evento: 'Eventos e festas', compras: 'Compras', manutencao: 'Manutenção', materiais: 'Materiais', outros: 'Outros' };
  const valorIni = l ? (l.valor_centavos / 100).toFixed(2).replace('.', ',') : '';
  const dataIni = l ? l.data : (mes === hoje().slice(0, 7) ? hoje() : `${mes}-01`);
  const d = dialogo(`<form id="fl" novalidate><h3>${l ? 'Editar lançamento' : 'Novo lançamento'}</h3>
    <div class="abas" role="radiogroup" aria-label="Tipo" style="width:100%"><label style="flex:1"><input type="radio" name="tipo" value="entrada" class="sr" ${!l || l.tipo === 'entrada' ? 'checked' : ''}><span class="seg ent">Entrada</span></label>
      <label style="flex:1"><input type="radio" name="tipo" value="saida" class="sr" ${l?.tipo === 'saida' ? 'checked' : ''}><span class="seg sai">Saída</span></label></div>
    <div class="form-grade"><div class="campo"><label for="lv">Valor (R$)</label><input id="lv" type="text" inputmode="decimal" placeholder="0,00" value="${valorIni}"></div>
      <div class="campo"><label for="ld">Data</label><input id="ld" type="date" value="${dataIni}"></div></div>
    <div class="campo"><label for="lc">Categoria</label><select id="lc">${Object.entries(cats).map(([k, v]) => `<option value="${k}" ${l?.categoria === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="campo"><label for="ldesc">Descrição</label><input id="ldesc" type="text" maxlength="150" value="${esc(l?.descricao || '')}"></div>
    <div class="campo"><label for="lo">Observação (opcional)</label><input id="lo" type="text" maxlength="300" value="${esc(l?.observacao || '')}"></div>
    <p class="erro-msg" id="er" role="alert"></p>
    <div class="linha"><button class="btn">Salvar</button><button type="button" class="btn sec" id="cancelar">Cancelar</button></div></form>`);
  d.querySelector('#cancelar').onclick = () => d.close();
  d.querySelector('#fl').onsubmit = async (e) => {
    e.preventDefault();
    const body = { tipo: d.querySelector('input[name=tipo]:checked').value, valor: d.querySelector('#lv').value, data: d.querySelector('#ld').value, categoria: d.querySelector('#lc').value, descricao: d.querySelector('#ldesc').value, observacao: d.querySelector('#lo').value };
    try { await api(l ? `/api/financeiro/${l.id}` : '/api/financeiro', { method: l ? 'PUT' : 'POST', body }); d.close(); toast(l ? 'Lançamento atualizado.' : 'Lançamento registrado.'); depois(false); }
    catch (err) { d.querySelector('#er').textContent = err.message; }
  };
}

carregarMarca().finally(() => { mostrarDemo(); rotear(); }); // cores e logotipo antes de desenhar a primeira tela
