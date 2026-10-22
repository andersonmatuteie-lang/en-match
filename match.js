/* EN-MATCH · Fases 2 a 4 (cliente): descubrir con tarjetas, postulaciones, ofertas, candidatos, retos y verificación.
   Se carga antes del script principal; usa sus utilidades (esc, ic, bar, toast, ME, sb, LIVE...) solo al ejecutarse. */
const MX=(()=>{
const st={tipo:'practica',cola:null,feedErr:'',busy:false,post:null,postErr:'',
 ofertas:null,conteos:{},resumen:null,orgErr:'',sel:null,cand:null,candErr:'',
 reto:null,retoErr:'',ultima:null,rep:null,repErr:'',orgs:null,orgsErr:'',
 draft:{titulo:'',desc:''},quiz:null,vistoKey:'enmatch-visto',cargando:{}};
const TIPO_TXT={practica:'Práctica',curso:'Curso',voluntariado:'Voluntariado'};
const ORG={
 rrhh:{tipo:'practica',pub:'Mis ofertas',cand:'Candidatos',acepta:'Pasar a entrevista',nuevo:'Publicar una práctica',
  ph:'Ej.: Practicante de Costos y Presupuestos',hint:'Cuenta qué hará la persona, qué debe saber (habilidades y herramientas), nivel de inglés, ciclo mínimo, modalidad, ubicación y pago mensual.',reto:true},
 ong:{tipo:'voluntariado',pub:'Voluntariados',cand:'Voluntarios',acepta:'Aceptar voluntario',nuevo:'Publicar un voluntariado',
  ph:'Ej.: Diagnóstico de almacén comunitario',hint:'Cuenta la actividad, qué habilidades sirven, las horas totales, el lugar y a qué carreras va dirigido.',reto:true},
 cursos:{tipo:'curso',pub:'Mis cursos',cand:'Inscritos',acepta:'Confirmar inscripción',nuevo:'Publicar un curso',
  ph:'Ej.: Inglés para entrevistas',hint:'Cuenta qué enseña el curso (habilidades y herramientas), duración, modalidad, costo y a quién le sirve.',reto:false}
};
const REAL={rrhh:['inicio','ofertas','cand','retos','rep'],ong:['inicio','ofertas','cand'],cursos:['inicio','ofertas','cand'],admin:['ver']};
const MOTIVOS=['Falta inglés intermedio','Falta experiencia en las herramientas','No superó el reto','Horario no compatible','Se eligió otro perfil'];
const ESTADO_ORG={activa:['t-ok','Activa'],pendiente:['t-wa','En revisión'],cerrada:['t-no','Cerrada']};
const clase=n=>n>=75?'m-hi':n>=50?'m-mid':'m-lo';
const ini=t=>String(t||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const hue=t=>{let h=0;for(const c of String(t))h=(h*31+c.charCodeAt(0))%360;return h};
const av=t=>`<span class="logo"><span class="mk" style="--c:hsl(${hue(t)} 50% 38%)">${esc(ini(t))}</span></span>`;
const chips=(a,c='')=>(a||[]).map(x=>`<span class="chip ${c}">${esc(x)}</span>`).join('');
const vacio=(t,btn)=>`<section class="card" style="text-align:center;padding:30px 18px"><p class="muted" style="margin:0 0 ${btn?12:0}px">${t}</p>${btn||''}</section>`;
const cargandoHTML=t=>`<section class="card" style="text-align:center;padding:30px 18px"><div class="spin" style="width:34px;height:34px;border-width:4px;margin:0 auto 12px"></div><p class="muted" style="margin:0">${t}</p></section>`;
const errHTML=(m,acc)=>`<section class="card"><p class="err" style="margin:0 0 10px">${esc(m)}</p><button class="btn" data-mx="${acc}">Reintentar</button></section>`;

/* ======================= Servidor ======================= */
async function fx(nombre,body){
 await loadSB();
 const {data,error}=await sb.functions.invoke(nombre,{body});
 if(error){let m='No pudimos completar la acción.';try{m=(await error.context.json()).error||m}catch(_){}throw new Error(m)}
 return data;
}
async function uid(){await loadSB();const {data:{user}}=await sb.auth.getUser();if(!user)throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');return user.id}
const aviso=m=>{throw new Error(m)};

/* Datos de ejemplo para el modo demostración */
const DEMO=[
 {id:'d1',tipo:'practica',titulo:'Practicante de Costos y Presupuestos',org_nombre:'Andina Logística',descripcion:'Apoyarás el costeo de operaciones y el control del presupuesto mensual del área.',detalle:{resumen:'Apoyo en costeo y presupuesto de operaciones.',modalidad:'presencial',ubicacion:'Callao, Perú',subvencion:1300,idioma_min:'b1',ciclo_min:7},match:94,coincide:['costos','presupuestos','Excel'],falta:[],notas:[],tiene_reto:true},
 {id:'d2',tipo:'practica',titulo:'Practicante de Planeamiento de la Producción',org_nombre:'Alimentos Qori',descripcion:'Planificarás la producción semanal y darás seguimiento a los indicadores de planta.',detalle:{resumen:'Planificación semanal de producción.',modalidad:'hibrido',ubicacion:'Ate, Lima',subvencion:1250,ciclo_min:6},match:89,coincide:['planeamiento','Excel'],falta:['SAP'],notas:[],tiene_reto:false},
 {id:'d3',tipo:'practica',titulo:'Practicante de Evaluación de Proyectos',org_nombre:'Banco Emprende',descripcion:'Evaluarás la rentabilidad de proyectos con VPN, TIR y escenarios de riesgo.',detalle:{resumen:'Evaluación financiera de proyectos.',modalidad:'hibrido',ubicacion:'San Isidro, Lima',subvencion:1400,idioma_min:'b2',ciclo_min:8},match:81,coincide:['evaluación de proyectos','simulación'],falta:['Python'],notas:['Piden inglés B2; tu nivel es menor'],tiene_reto:false},
 {id:'d4',tipo:'curso',titulo:'Inglés para entrevistas',org_nombre:'Aprende+ Perú',descripcion:'Curso de 6 horas para practicar entrevistas en inglés y obtener la insignia B1.',detalle:{resumen:'6 h · Gratis · Insignia Inglés B1',modalidad:'remoto',horas:6},match:92,coincide:['inglés'],falta:[],notas:[],tiene_reto:false},
 {id:'d5',tipo:'curso',titulo:'Power BI desde cero',org_nombre:'Instituto Kallpa Digital',descripcion:'Aprende a construir tableros y reportes con Power BI.',detalle:{resumen:'Tableros y reportes con Power BI.',modalidad:'remoto',horas:12},match:78,coincide:['power bi'],falta:[],notas:[],tiene_reto:false},
 {id:'d6',tipo:'voluntariado',titulo:'Diagnóstico de almacén comunitario',org_nombre:'Red Sembrando Futuro',descripcion:'Diagnosticarás el almacén de un comedor popular y propondrás mejoras de orden y control.',detalle:{resumen:'Diagnóstico y mejoras de almacén.',modalidad:'presencial',ubicacion:'Villa El Salvador',horas:40},match:88,coincide:['procesos','inventario'],falta:[],notas:[],tiene_reto:false},
 {id:'d7',tipo:'voluntariado',titulo:'Taller de finanzas para emprendedoras',org_nombre:'Minka Solidaria',descripcion:'Dictarás un taller de finanzas básicas para mujeres emprendedoras.',detalle:{resumen:'Taller de finanzas básicas.',modalidad:'presencial',horas:24},match:70,coincide:['finanzas'],falta:[],notas:[],tiene_reto:false}
];
const DEMO_RETO=[
 {pregunta:'¿Cuál de estos NO es un elemento del costo de producción?',opciones:['Materiales directos','Mano de obra directa','Costos indirectos de fabricación','Gastos de publicidad'],correcta:3},
 {pregunta:'Un costo fijo es aquel que…',opciones:['Cambia con cada unidad producida','No cambia con el nivel de producción en el corto plazo','Siempre es un gasto de venta','Solo existe en servicios'],correcta:1},
 {pregunta:'Si el precio sube y los costos se mantienen, el margen…',opciones:['Baja','Se mantiene','Sube','No se puede saber'],correcta:2}
];
const demo={vistos:{},post:[]};
const demoApi={
 feed:async t=>DEMO.filter(o=>o.tipo===t&&!demo.vistos[o.id]).sort((a,b)=>b.match-a.match),
 interes:async(id,estado)=>{demo.vistos[id]=estado;if(estado==='interesado'){const o=DEMO.find(x=>x.id===id);demo.post.unshift({id:'dp'+id,oferta_id:id,estado:'interesado',motivo:null,titulo:o.titulo,tipo:o.tipo,org_nombre:o.org_nombre,tiene_reto:o.tiene_reto,actualizado_en:new Date().toISOString()})}},
 postulaciones:async()=>{
  const ejemplo=S.postul.map((p,i)=>({id:'ds'+i,oferta_id:'ds'+i,estado:p.st==='in'?'entrevista':p.st==='no'?'descartado':'interesado',motivo:p.st==='no'?p.fb:null,titulo:p.t,tipo:'practica',org_nombre:L[p.k].n,tiene_reto:false,actualizado_en:new Date(Date.now()-864e5*(i+1)).toISOString()}));
  return [...demo.post,...ejemplo]},
 retoObtener:async id=>({preguntas:DEMO_RETO.map(({pregunta,opciones})=>({pregunta,opciones})),umbral:60,resultado:(demo.post.find(p=>p.oferta_id===id)||{}).resultado||null}),
 retoResponder:async(id,resp)=>{const bien=DEMO_RETO.filter((q,i)=>resp[i]===q.correcta).length;const puntaje=Math.round(100*bien/DEMO_RETO.length);const r={puntaje,aprobado:puntaje>=60,umbral:60,correctas:bien,total:DEMO_RETO.length};
  const p=demo.post.find(x=>x.oferta_id===id);if(p){p.resultado={puntaje,aprobado:r.aprobado};p.estado=r.aprobado?'reto_aprobado':'reto_no_aprobado'}return r}
};
const api={
 feed:t=>LIVE?fx('match-feed',{tipo:t}).then(r=>r.ofertas):demoApi.feed(t),
 async interes(id,estado){
  if(!LIVE)return demoApi.interes(id,estado);
  const {error}=await sb.from('postulaciones').insert({oferta_id:id,estudiante_id:await uid(),estado});
  if(error)aviso(/duplicate|unique/i.test(error.message)?'Ya respondiste a esta oferta.':'No pudimos guardar tu respuesta. Intenta de nuevo.');
 },
 async postulaciones(){
  if(!LIVE)return demoApi.postulaciones();
  const {data,error}=await sb.from('postulaciones').select('id,estado,motivo,oferta_id,actualizado_en,ofertas(titulo,tipo,org_nombre,tiene_reto)')
   .eq('estudiante_id',await uid()).neq('estado','omitido').order('actualizado_en',{ascending:false});
  if(error)aviso('No pudimos cargar tus postulaciones.');
  return data.map(p=>({id:p.id,oferta_id:p.oferta_id,estado:p.estado,motivo:p.motivo,actualizado_en:p.actualizado_en,titulo:p.ofertas?.titulo||'Oferta',tipo:p.ofertas?.tipo||'practica',org_nombre:p.ofertas?.org_nombre||'',tiene_reto:!!p.ofertas?.tiene_reto}));
 },
 retoObtener:id=>LIVE?fx('reto-obtener',{oferta_id:id}):demoApi.retoObtener(id),
 retoResponder:(id,r)=>LIVE?fx('reto-responder',{oferta_id:id,respuestas:r}):demoApi.retoResponder(id,r),
 async orgDatos(){
  const id=await uid();
  const [o,p,r]=await Promise.all([
   sb.from('ofertas').select('id,tipo,titulo,estado,requisitos,tiene_reto,creado_en').eq('org_id',id).order('creado_en',{ascending:false}),
   sb.from('postulaciones').select('id,estado,oferta_id'),
   sb.from('reto_resultados').select('aprobado')]);
  if(o.error||p.error||r.error)aviso('No pudimos cargar tus datos.');
  return {ofertas:o.data,posts:p.data,retos:r.data};
 },
 publicar:(titulo,descripcion)=>fx('publicar-oferta',{titulo,descripcion}).then(r=>r.oferta),
 async estadoOferta(id,estado){const {data,error}=await sb.from('ofertas').update({estado}).eq('id',id).select('id');if(error)aviso(/verificad/i.test(error.message)?'Tu organización aún no está verificada.':'No pudimos actualizar la oferta.');if(!data.length)aviso('No pudimos actualizar la oferta.')},
 candidatos:id=>fx('match-candidatos',{oferta_id:id}),
 async decidir(pid,estado,motivo){const {data,error}=await sb.from('postulaciones').update({estado,motivo}).eq('id',pid).select('id');if(error||!data.length)aviso('No pudimos guardar tu decisión.')},
 async retoDe(id){const {data,error}=await sb.from('retos').select('preguntas,umbral,cupos').eq('oferta_id',id).maybeSingle();if(error)aviso('No pudimos cargar el reto.');return data},
 async retoGuardar(id,preguntas,umbral,cupos){const {error}=await sb.from('retos').upsert({oferta_id:id,preguntas,umbral,cupos,actualizado_en:new Date().toISOString()});if(error)aviso('No pudimos guardar el reto.')},
 async retoBorrar(id){const {error}=await sb.from('retos').delete().eq('oferta_id',id);if(error)aviso('No pudimos borrar el reto.')},
 retoGenerar:id=>fx('reto-generar',{oferta_id:id}).then(r=>r.preguntas),
 async orgs(){const {data,error}=await sb.from('perfiles').select('id,nombre,rol,ruc,verificada').in('rol',['rrhh','ong','cursos']).order('verificada').order('nombre');if(error)aviso('No pudimos cargar las organizaciones.');return data},
 async verificar(id,ok){const {error}=await sb.rpc('verificar_org',{p_id:id,p_ok:ok});if(error)aviso('No pudimos actualizar la verificación.')}
};

/* Carga con control de duplicados; al terminar vuelve a pintar la pantalla actual. */
function cargar(clave,fn,aplicar){
 if(st.cargando[clave])return;st.cargando[clave]=true;
 Promise.resolve().then(fn).then(aplicar,e=>aplicar(null,e.message||'Ocurrió un error.'))
  .finally(()=>{st.cargando[clave]=false;rerender();badge();alMostrar()});
}
function cargarFeed(){cargar('feed:'+st.tipo,()=>api.feed(st.tipo),(d,e)=>{if(e){st.feedErr=e;st.cola=[]}else{st.feedErr='';st.cola=d}})}
function cargarPost(){cargar('post',()=>api.postulaciones(),(d,e)=>{if(e){st.postErr=e;st.post=[]}else{st.postErr='';st.post=d}})}
function cargarOrg(){cargar('org',()=>api.orgDatos(),(d,e)=>{
 if(e){st.orgErr=e;st.ofertas=[];st.resumen={act:0,int:0,reto:0,ok:0};return}
 st.orgErr='';st.ofertas=d.ofertas;st.conteos={};
 for(const p of d.posts)st.conteos[p.oferta_id]=(st.conteos[p.oferta_id]||0)+1;
 st.resumen={act:d.ofertas.filter(o=>o.estado==='activa').length,int:d.posts.length,reto:d.retos.filter(r=>r.aprobado).length,ok:d.posts.filter(p=>p.estado==='entrevista').length};
 if(!st.sel||!d.ofertas.some(o=>o.id===st.sel)){const a=d.ofertas.find(o=>o.estado!=='cerrada')||d.ofertas[0];st.sel=a?a.id:null}
})}
function cargarCand(){if(!st.sel){st.cand={candidatos:[],reto:null};return}const id=st.sel;cargar('cand:'+id,()=>api.candidatos(id),(d,e)=>{if(e){st.candErr=e;st.cand={candidatos:[],reto:null}}else{st.candErr='';st.cand=d}})}
function cargarReto(){
 if(!st.sel){st.reto={vacio:true};return}const id=st.sel;
 cargar('reto:'+id,()=>api.retoDe(id),(d,e)=>{if(e){st.retoErr=e;st.reto={oferta_id:id,preguntas:[],umbral:60,cupos:5,existe:false}}else{st.retoErr='';st.reto=d?{oferta_id:id,existe:true,umbral:d.umbral,cupos:d.cupos,preguntas:d.preguntas.map(p=>({pregunta:p.pregunta,opciones:[...p.opciones],correcta:p.correcta}))}:{oferta_id:id,existe:false,umbral:60,cupos:5,preguntas:[]}}});
}
function cargarRep(){
 cargar('rep',async()=>{
  const d=await api.orgDatos();const abiertas=d.ofertas.filter(o=>o.estado!=='cerrada').slice(0,10);const falta={};let total=0;
  for(const o of abiertas){const r=await api.candidatos(o.id);for(const c of r.candidatos){total++;for(const f of new Set(c.falta))falta[f]=(falta[f]||0)+1}}
  return {total,falta,ofertas:abiertas.length};
 },(d,e)=>{if(e){st.repErr=e;st.rep={total:0,falta:{},ofertas:0}}else{st.repErr='';st.rep=d}});
}
function cargarOrgs(){cargar('orgs',()=>api.orgs(),(d,e)=>{if(e){st.orgsErr=e;st.orgs=[]}else{st.orgsErr='';st.orgs=d}})}

/* Se llama cada vez que se muestra una pantalla: pide los datos que falten. */
function alMostrar(){
 if(cur==='estudiante'){
  if(pg==='descubrir'&&st.cola===null&&(!LIVE||ME.analisis))cargarFeed();
  if((pg==='postulaciones'||(pg==='inicio'&&real()))&&st.post===null)cargarPost();
  if(pg==='postulaciones')marcarVisto();
 }else if(LIVE&&REAL[cur]&&REAL[cur].includes(pg)){
  if(cur==='admin'){if(st.orgs===null)cargarOrgs();return}
  if(st.ofertas===null){cargarOrg();return}
  if(pg==='cand'&&st.cand===null)cargarCand();
  if(pg==='retos'&&st.reto===null)cargarReto();
  if(pg==='rep'&&st.rep===null)cargarRep();
 }
}
function invalidar(){st.cola=null}
function reiniciar(){Object.assign(st,{cola:null,post:null,ofertas:null,conteos:{},resumen:null,sel:null,cand:null,reto:null,ultima:null,rep:null,orgs:null,quiz:null,feedErr:'',postErr:'',orgErr:'',candErr:'',retoErr:'',repErr:'',orgsErr:'',draft:{titulo:'',desc:''},tipo:'practica'});demo.vistos={};demo.post=[]}

/* Aviso en el menú: decisiones nuevas de las organizaciones desde la última visita. */
const visto=()=>{try{return +localStorage.getItem(st.vistoKey+':'+ME.n)||0}catch(e){return 0}};
function marcarVisto(){try{localStorage.setItem(st.vistoKey+':'+ME.n,String(Date.now()))}catch(e){}$$('#nav .nb').forEach(x=>x.remove())}
function badge(){
 if(cur!=='estudiante'||!st.post||pg==='postulaciones')return;
 const n=st.post.filter(p=>['entrevista','descartado','reto_aprobado'].includes(p.estado)&&Date.parse(p.actualizado_en)>visto()).length;
 const a=$('#nav a[data-page="postulaciones"]');if(!a)return;
 a.querySelectorAll('.nb').forEach(x=>x.remove());
 if(n)a.insertAdjacentHTML('beforeend',`<em class="nb" aria-label="${n} novedades">${n}</em>`);
}

/* ======================= Estudiante ======================= */
function tarjeta(o){
 const d=o.detalle||{};
 const meta=[d.modalidad&&{hibrido:'Híbrido',presencial:'Presencial',remoto:'Remoto'}[d.modalidad],d.ubicacion,d.subvencion!=null&&soles(d.subvencion)+' / mes',d.horas&&d.horas+' h'].filter(Boolean);
 return `<article class="scard" data-id="${esc(o.id)}" tabindex="0" aria-label="${esc(o.titulo)}, ${o.match}% de match">
  <span class="stamp like" aria-hidden="true">ME INTERESA</span><span class="stamp pass" aria-hidden="true">OMITIR</span>
  <div class="sc-top">${av(o.org_nombre)}<div class="grow"><b>${esc(o.org_nombre)}</b><span class="small muted">${TIPO_TXT[o.tipo]||''}</span></div><div class="sc-m ${clase(o.match)}"><b class="num">${o.match}%</b><small>match</small></div></div>
  <h3>${esc(o.titulo)}</h3>
  ${d.resumen?`<p class="small muted" style="margin:0">${esc(d.resumen)}</p>`:''}
  ${meta.length?`<div class="chips">${meta.map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div>`:''}
  ${o.coincide&&o.coincide.length?`<div class="sc-why"><b>${o.tipo==='curso'?'Cubre lo que te falta':'Coincides en'}</b><div class="chips">${chips(o.coincide,'ok')}</div></div>`:''}
  ${o.falta&&o.falta.length?`<div class="sc-why"><b>Te falta</b><div class="chips">${chips(o.falta,'no')}</div></div>`:''}
  ${(o.notas||[]).map(n=>`<p class="small" style="margin:0;color:#A56A00">${esc(n)}</p>`).join('')}
  ${o.tiene_reto?`<span class="tag t-in" style="align-self:flex-start">${ic('target')} Incluye un reto de selección</span>`:''}
  <details><summary>Ver descripción completa</summary><p class="small" style="margin:8px 0 0;white-space:pre-line">${esc(o.descripcion)}</p></details>
 </article>`;
}
function vDescubrir(){
 if(LIVE&&!ME.analisis)return `<div class="stack">${vacio('Para calcular tu match necesitamos leer tu CV primero.',`<button class="btn p" data-go="cv">${ic('doc')} Subir mi CV</button>`)}</div>`;
 const tabs=[['practica','Prácticas'],['curso','Cursos'],['voluntariado','Voluntariados']].map(([k,t])=>`<button role="tab" aria-selected="${k===st.tipo}" class="${k===st.tipo?'on':''}" data-mx="tipo" data-v="${k}">${t}</button>`).join('');
 let cuerpo;
 if(st.feedErr)cuerpo=errHTML(st.feedErr,'recargar');
 else if(st.cola===null)cuerpo=cargandoHTML('Buscando tu mejor match…');
 else if(!st.cola.length)cuerpo=vacio('Ya viste todo por ahora. Vuelve pronto: cada vez que se publique algo nuevo, calcularemos tu match.',`<button class="btn" data-go="postulaciones">Ver mis postulaciones</button>`);
 else cuerpo=`<div class="swipe">${st.cola[1]?'<div class="scard ghost" aria-hidden="true"></div>':''}${tarjeta(st.cola[0])}</div>
  <div class="sw-actions"><button class="sw-btn pass" data-mx="pass" aria-label="Omitir esta oferta">${ic('plus',2.6).replace('<svg','<svg style="transform:rotate(45deg)"')}</button><button class="sw-btn like" data-mx="like" aria-label="Me interesa">${icf('heart')}</button></div>
  <p class="small muted" style="text-align:center;margin:0">Arrastra la tarjeta, usa los botones o las flechas ← →<br>Si te interesa, la organización verá tu perfil analizado (no tu CV ni tu correo).</p>`;
 return `<div class="stack mxw">
  ${LIVE?'':demoNote('Modo demostración: ofertas de ejemplo con porcentajes de ejemplo.')}
  <div class="tabs" role="tablist" aria-label="Qué buscas">${tabs}</div>
  ${cuerpo}</div>`;
}
const EST={
 interesado:t=>['t-in',t?'Reto pendiente':'Interés enviado'],
 reto_aprobado:()=>['t-ok','Reto aprobado'],reto_no_aprobado:()=>['t-no','Reto no superado'],
 entrevista:tipo=>['t-ok',tipo==='voluntariado'?'Aceptado':tipo==='curso'?'Inscripción confirmada':'Pasaste a entrevista'],
 descartado:()=>['t-no','No seleccionado']
};
function itemPost(p){
 const [c,t]=(EST[p.estado]||EST.interesado)(p.estado==='interesado'&&p.tiene_reto,p.tipo);
 const pendiente=p.estado==='interesado'&&p.tiene_reto;
 const nota=p.estado==='descartado'?`<div class="fb n"><b>Motivo:</b> ${esc(p.motivo||'Sin motivo indicado')}</div>`
  :p.estado==='entrevista'?`<div class="fb">¡Buenas noticias! La organización quiere avanzar contigo. Revisa tu correo y tus mensajes.</div>`
  :p.estado==='reto_aprobado'?`<div class="fb">Superaste el reto. La organización revisará tu perfil y te responderá con el motivo.</div>`
  :p.estado==='reto_no_aprobado'?`<div class="fb n">No alcanzaste el puntaje del reto. La organización aún puede revisar tu perfil.</div>`
  :pendiente?`<div class="fb">Esta organización pide un reto. Resuélvelo para destacar entre los candidatos (un solo intento).</div>`
  :`<div class="fb">La organización está revisando tu perfil. Siempre recibirás una respuesta.</div>`;
 return `<div class="item"><div class="grow" style="display:flex;gap:10px;align-items:center">${av(p.org_nombre)}<div style="min-width:0"><div class="t">${esc(p.titulo)}</div><div class="m">${esc(p.org_nombre)} · ${TIPO_TXT[p.tipo]||''}</div></div></div>
  <div class="act"><span class="tag ${c}">${t}</span>${pendiente?`<button class="btn sm p" data-mx="reto" data-id="${esc(p.oferta_id)}">Resolver reto</button>`:''}</div>${nota}</div>`;
}
function vPostulaciones(){
 if(st.postErr)return `<div class="stack">${errHTML(st.postErr,'recargarPost')}</div>`;
 if(st.post===null)return `<div class="stack">${cargandoHTML('Cargando tus postulaciones…')}</div>`;
 if(!st.post.length)return `<div class="stack">${vacio('Aún no te has postulado. Desliza ofertas en Descubrir y las verás aquí.',`<button class="btn p" data-go="descubrir">Ir a Descubrir</button>`)}</div>`;
 return `<div class="stack"><section class="card"><div class="sec-h"><h2>Mis postulaciones</h2><span class="tag t-ok">Siempre con respuesta</span></div><div class="list">${st.post.map(itemPost).join('')}</div></section></div>`;
}
function resumenPost(){
 if(st.postErr)return '<p class="small muted" style="margin:0">No pudimos cargar tus postulaciones.</p>';
 if(st.post===null)return '<p class="small muted" style="margin:0">Cargando…</p>';
 if(!st.post.length)return '<p class="small muted" style="margin:0">Aún no te has postulado. Desliza ofertas en <button class="link" data-go="descubrir">Descubrir</button>; la organización te responderá aquí con el motivo.</p>';
 return `<div class="list">${st.post.slice(0,3).map(itemPost).join('')}</div>${st.post.length>3?`<button class="link" data-go="postulaciones" style="margin-top:8px">Ver todas (${st.post.length}) →</button>`:''}`;
}

/* Decidir con la tarjeta: arrastre, botones o teclado */
async function decidir(accion){
 const o=st.cola&&st.cola[0];if(!o||st.busy)return;st.busy=true;
 const c=$('.scard:not(.ghost)',app);
 if(c){c.classList.add(accion==='like'?'out-like':'out-pass');if(!RM)await delay(260)}
 try{
  await api.interes(o.id,accion==='like'?'interesado':'omitido');
  st.cola.shift();st.post=null;
  if(accion==='like')toast(o.tiene_reto?'Interés enviado. Resuelve el reto en Mis postulaciones.':'Interés enviado. La organización te responderá con el motivo.');
 }catch(e){toast(e.message);if(c)c.classList.remove('out-like','out-pass')}
 finally{st.busy=false;rerender()}
}
let drag=null;
function dragIni(e){
 const c=e.target.closest('.scard:not(.ghost)');if(!c||e.target.closest('summary,details,button,a')||st.busy)return;
 drag={c,x:e.clientX,dx:0,id:e.pointerId};c.setPointerCapture(e.pointerId);c.style.transition='none';
}
function dragMov(e){
 if(!drag||e.pointerId!==drag.id)return;
 drag.dx=e.clientX-drag.x;const r=drag.dx/18;
 drag.c.style.transform=`translateX(${drag.dx}px) rotate(${r}deg)`;
 drag.c.style.setProperty('--like',Math.max(0,Math.min(1,drag.dx/110)));drag.c.style.setProperty('--pass',Math.max(0,Math.min(1,-drag.dx/110)));
}
function dragFin(e){
 if(!drag||e.pointerId!==drag.id)return;const {c,dx}=drag;drag=null;c.style.transition='';
 if(Math.abs(dx)>110){c.style.transform='';decidir(dx>0?'like':'pass')}
 else{c.style.transform='';c.style.setProperty('--like',0);c.style.setProperty('--pass',0)}
}

/* Reto (estudiante) */
function abrirModal(html){const m=$('#modal');m.innerHTML=html;m.hidden=false;const f=$('input,button',m);f&&f.focus()}
async function abrirReto(ofertaId){
 const p=(st.post||[]).find(x=>x.oferta_id===ofertaId);const titulo=p?p.titulo:'Reto de selección';
 abrirModal(`<div class="dialog"><div style="text-align:center;padding:24px 0"><div class="spin" style="width:34px;height:34px;border-width:4px;margin:0 auto 12px"></div><p class="muted" style="margin:0">Cargando el reto…</p></div></div>`);
 try{
  const r=await api.retoObtener(ofertaId);
  st.quiz={ofertaId,titulo,preguntas:r.preguntas,umbral:r.umbral};
  if(r.resultado)return resultadoReto({...r.resultado,umbral:r.umbral},titulo);
  abrirModal(`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rq-t" style="max-width:580px;max-height:90vh;overflow:auto">
   <span class="tag t-in">${ic('target')} Reto de selección</span><h3 id="rq-t">${esc(titulo)}</h3>
   <p class="small muted" style="margin:0 0 12px">Tienes un solo intento. Necesitas ${r.umbral}% para avanzar. Se califica automáticamente.</p>
   <form id="retoform" novalidate>${r.preguntas.map((q,i)=>`<fieldset class="rq"><legend>${i+1}. ${esc(q.pregunta)}</legend>${q.opciones.map((o,j)=>`<label class="ro"><input type="radio" name="q${i}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}
   <p class="err" id="rq-err" role="alert" hidden></p>
   <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" data-close>Cerrar</button><button class="btn p" type="submit" id="rq-go">Enviar respuestas</button></div></form></div>`);
 }catch(e){abrirModal(`<div class="dialog"><p class="err">${esc(e.message)}</p><div style="display:flex;justify-content:flex-end"><button class="btn" data-close>Cerrar</button></div></div>`)}
}
function resultadoReto(r,titulo){
 abrirModal(`<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rq-t" style="text-align:center">
  <span class="tag ${r.aprobado?'t-ok':'t-no'}">${r.aprobado?'Reto aprobado':'Reto no superado'}</span><h3 id="rq-t">${esc(titulo)}</h3>
  <div class="score" style="justify-content:center;margin:8px 0"><b class="num" style="font-size:44px;color:${r.aprobado?'var(--good)':'var(--coral)'}">${r.puntaje}%</b></div>
  <p class="small muted">${r.aprobado?'Superaste el mínimo ('+r.umbral+'%). La organización verá tu resultado junto con tu perfil.':'El mínimo era '+r.umbral+'%. Cada reto se puede responder una sola vez.'}</p>
  <div style="display:flex;justify-content:center"><button class="btn p" data-close>Entendido</button></div></div>`);
}
async function enviarReto(form){
 const er=$('#rq-err'),go=$('#rq-go');er.hidden=true;
 const q=st.quiz,resp=q.preguntas.map((_,i)=>{const c=form.querySelector(`input[name="q${i}"]:checked`);return c?+c.value:-1});
 if(resp.some(x=>x<0)){er.textContent='Responde todas las preguntas antes de enviar.';er.hidden=false;return}
 go.disabled=true;go.textContent='Calificando…';
 try{const r=await api.retoResponder(q.ofertaId,resp);resultadoReto(r,q.titulo);st.post=null;rerender();if(st.post===null)cargarPost()}
 catch(e){go.disabled=false;go.textContent='Enviar respuestas';er.textContent=e.message;er.hidden=false}
}

/* ======================= Organizaciones ======================= */
const noVerif=()=>LIVE&&!ME.verificada?demoNote('Tu organización está en revisión: el equipo EN-MATCH verificará tu RUC. Mientras tanto puedes preparar tus publicaciones; se activarán al aprobarte.'):'';
const sel=(ofs,sinCerradas)=>`<div class="field" style="max-width:520px"><label for="mx-of">${sinCerradas?'Oferta':'Publicación'}</label><select id="mx-of" data-mx="sel">${ofs.map(o=>`<option value="${esc(o.id)}" ${o.id===st.sel?'selected':''}>${esc(o.titulo)} · ${(ESTADO_ORG[o.estado]||[])[1]||''}</option>`).join('')}</select></div>`;
function vOrg(rol,p){
 const R=ORG[rol];
 if(st.orgErr&&st.ofertas&&!st.ofertas.length)return `<div class="stack">${errHTML(st.orgErr,'recargarOrg')}</div>`;
 if(st.ofertas===null)return `<div class="stack">${cargandoHTML('Cargando…')}</div>`;
 const of=st.ofertas;
 if(p==='inicio'){const r=st.resumen;return `<div class="stack">${noVerif()}
  <section class="pagehead"><div><span class="tag t-br">${ic('shield')} ${esc(ME.verificada?'Organización verificada':'En revisión')}</span><h1>${esc(ME.n)}</h1><p>Publica en lenguaje natural: la IA lee tu texto y calcula el match con cada estudiante. ${R.reto?'Usa un reto como filtro y recibe solo candidatos que lo superen.':''}</p></div><button class="btn p" data-go="ofertas">${ic('plus')} ${R.nuevo}</button></section>
  <div class="kpis">
   <div class="kpi"><span class="ic">${ic('brief')}</span><span>Publicaciones activas</span><strong data-count="${r.act}">0</strong><em>${of.length} en total</em></div>
   <div class="kpi"><span class="ic">${ic('users')}</span><span>Personas interesadas</span><strong data-count="${r.int}">0</strong><em>${R.cand.toLowerCase()}</em></div>
   <div class="kpi"><span class="ic">${ic('target')}</span><span>Con reto aprobado</span><strong data-count="${r.reto}">0</strong><em>${R.reto?'candidatos filtrados':'no aplica a cursos'}</em></div>
   <div class="kpi hl"><span class="ic">${ic('check')}</span><span>${rol==='rrhh'?'En entrevista':rol==='ong'?'Voluntarios aceptados':'Inscripciones confirmadas'}</span><strong data-count="${r.ok}">0</strong><em>aceptados por ti</em></div>
  </div>
  ${of.length?'':vacio('Aún no publicaste nada. Escribe tu primera oferta y la IA calculará el match con los estudiantes.',`<button class="btn p" data-go="ofertas">${ic('plus')} ${R.nuevo}</button>`)}
 </div>`}
 if(p==='ofertas'){
  const u=st.ultima;
  return `<div class="stack">${noVerif()}
  <section class="card"><div class="sec-h"><h2>${R.nuevo}</h2><span class="tag t-br">${ic('spark')} La IA lee tu texto</span></div>
   <form id="ofform" novalidate>
    <div class="field"><label for="of-titulo">Título</label><input id="of-titulo" data-draft="titulo" maxlength="120" placeholder="${esc(R.ph)}" value="${esc(st.draft.titulo)}"></div>
    <div class="field"><label for="of-desc">Descripción</label><textarea id="of-desc" data-draft="desc" rows="7" maxlength="4000" placeholder="${esc(R.hint)}">${esc(st.draft.desc)}</textarea><span class="small muted">Mientras más detalle des, mejor será el match. No uses criterios de género, edad ni universidad: se ignoran.</span></div>
    <p class="err" id="of-err" role="alert" hidden></p>
    <button class="btn p" type="submit" id="of-go">${ic('spark')} Analizar con IA y publicar</button>
   </form></section>
  ${u?`<section class="card"><div class="sec-h"><h2>Así leyó la IA “${esc(u.titulo)}”</h2><span class="tag ${(ESTADO_ORG[u.estado]||[])[0]}">${(ESTADO_ORG[u.estado]||[])[1]}</span></div>${req(u.requisitos)}<p class="small muted" style="margin:10px 0 0">Si algo no es correcto, ciérrala y vuelve a publicar con un texto más claro.</p></section>`:''}
  <section class="card"><div class="sec-h"><h2>${R.pub}</h2><span class="small muted">${of.length} publicadas</span></div>
   ${of.length?`<div class="list">${of.map(o=>`<div class="item"><div class="grow"><div class="t">${esc(o.titulo)}</div><div class="m">${(st.conteos[o.id]||0)} interesad${(st.conteos[o.id]||0)===1?'o':'os'}</div>${req(o.requisitos,true)}</div>
     <div class="act"><span class="tag ${(ESTADO_ORG[o.estado]||[])[0]}">${(ESTADO_ORG[o.estado]||[])[1]}</span>${o.tiene_reto?`<span class="tag t-in">Con reto</span>`:''}
     <button class="btn sm p" data-mx="ver" data-id="${esc(o.id)}">${R.cand}</button>${R.reto?`<button class="btn sm" data-mx="irreto" data-id="${esc(o.id)}">Reto</button>`:''}
     <button class="btn sm" data-mx="estado" data-id="${esc(o.id)}" data-v="${o.estado==='cerrada'?'activa':'cerrada'}">${o.estado==='cerrada'?'Reabrir':'Cerrar'}</button></div></div>`).join('')}</div>`
    :'<p class="small muted" style="margin:0">Todavía no publicaste nada.</p>'}</section></div>`;
 }
 if(p==='cand'){
  if(!of.length)return `<div class="stack">${noVerif()}${vacio('Primero publica algo para recibir interesados.',`<button class="btn p" data-go="ofertas">${R.nuevo}</button>`)}</div>`;
  let cuerpo;
  if(st.candErr)cuerpo=errHTML(st.candErr,'recargarCand');
  else if(st.cand===null)cuerpo=cargandoHTML('Calculando el match de cada candidato…');
  else cuerpo=tablaCand(st.cand,R,rol);
  return `<div class="stack">${noVerif()}<section class="card"><div class="sec-h"><h2>${R.cand}</h2></div>${sel(of,true)}</section>${cuerpo}</div>`;
 }
 if(p==='retos'){
  if(!of.length)return `<div class="stack">${vacio('Primero publica una oferta para crear su reto.',`<button class="btn p" data-go="ofertas">${R.nuevo}</button>`)}</div>`;
  let cuerpo;
  if(st.retoErr)cuerpo=errHTML(st.retoErr,'recargarReto');
  else if(st.reto===null)cuerpo=cargandoHTML('Cargando el reto…');
  else cuerpo=editorReto(st.reto);
  return `<div class="stack"><section class="card"><div class="sec-h"><h2>Retos de selección</h2><span class="tag t-br">${ic('target')} Filtro de calidad</span></div>
   <p class="small muted" style="margin:0 0 12px">El estudiante resuelve preguntas de opción múltiple. Solo quienes superen el puntaje mínimo entran a la lista corta. Se califica en el servidor y cada persona tiene un solo intento.</p>${sel(of,true)}</section>${cuerpo}</div>`;
 }
 if(p==='rep'){
  if(st.repErr)return `<div class="stack">${errHTML(st.repErr,'recargarRep')}</div>`;
  if(st.rep===null)return `<div class="stack">${cargandoHTML('Analizando a tus candidatos…')}</div>`;
  const r=st.rep,top=Object.entries(r.falta).sort((a,b)=>b[1]-a[1]).slice(0,6);
  return `<div class="stack"><section class="card"><div class="sec-h"><h2>Lo que más les falta a tus postulantes</h2><span class="small muted">${r.total} candidatos · ${r.ofertas} publicaciones abiertas</span></div>
   ${top.length?`<div class="bars">${top.map(([k,n])=>bar(esc(k),Math.round(100*n/r.total),'lo')).join('')}</div>`:'<p class="small muted" style="margin:0">Aún no hay candidatos suficientes para mostrar brechas.</p>'}</section></div>`;
 }
 return '';
}
function req(r,corto){
 r=r||{};const f=[];
 if((r.habilidades_obligatorias||[]).length)f.push(`<div class="sc-why"><b>Indispensable</b><div class="chips">${chips(r.habilidades_obligatorias)}</div></div>`);
 if(!corto&&(r.habilidades_deseables||[]).length)f.push(`<div class="sc-why"><b>Suma</b><div class="chips">${chips(r.habilidades_deseables)}</div></div>`);
 if((r.herramientas||[]).length)f.push(`<div class="sc-why"><b>Herramientas</b><div class="chips">${chips(r.herramientas)}</div></div>`);
 if((r.ensena||[]).length)f.push(`<div class="sc-why"><b>Enseña</b><div class="chips">${chips(r.ensena)}</div></div>`);
 const meta=[r.rubro&&(RUBROS[r.rubro]||r.rubro),r.idioma_min&&'Inglés '+r.idioma_min.toUpperCase(),r.ciclo_min&&'Ciclo '+r.ciclo_min+'+',r.modalidad,r.ubicacion,r.subvencion!=null&&soles(r.subvencion),r.horas&&r.horas+' h'].filter(Boolean);
 if(meta.length)f.push(`<div class="chips">${meta.map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</div>`);
 return f.join('')||'<p class="small muted" style="margin:0">La IA no detectó requisitos concretos: agrega más detalle.</p>';
}
function tablaCand(d,R,rol){
 const cs=d.candidatos;
 if(!cs.length)return vacio('Todavía nadie mostró interés en esta publicación. Cuando alguien deslice “me interesa”, lo verás aquí con su match.');
 const hayReto=!!d.reto;
 return `<section class="card"><div class="sec-h"><h2>${esc(d.oferta.titulo)}</h2><span class="tag t-br">${cs.length} interesad${cs.length===1?'o':'os'}</span></div>
  <p class="small muted" style="margin:0 0 12px">${hayReto?`Lista corta: ${d.reto.cupos===1?'el mejor candidato que superó':'los '+d.reto.cupos+' mejores que superaron'} el reto (mínimo ${d.reto.umbral}%), ordenados por match y reto.`:'Lista corta: los 5 mejores por match. Agrega un reto para filtrar con más calidad.'}</p>
  <div class="tw"><table><thead><tr><th>Candidato</th><th>Match</th>${hayReto?'<th>Reto</th>':''}<th>Estado</th><th>Acción</th></tr></thead><tbody>
  ${cs.map(c=>{const dec=c.estado==='entrevista'||c.estado==='descartado';
   const tag=c.estado==='entrevista'?`<span class="tag t-ok">${ic('check',3)} ${rol==='rrhh'?'En entrevista':'Aceptado'}</span>`:c.estado==='descartado'?`<span class="tag t-no">Respondido con motivo</span>`:c.lista_corta?'<span class="tag t-wa">★ Lista corta</span>':'<span class="tag t-in">Interesado</span>';
   return `<tr><td><div class="person"><span class="av">${esc(ini(c.nombre))}</span><div><b>${esc(c.nombre)}</b><div class="small muted">${esc([c.carrera,c.ciclo].filter(Boolean).join(' · ')||'Sin datos')}</div></div></div></td>
   <td><span class="sc-m ${clase(c.match)} sm"><b class="num">${c.match}%</b></span><div class="chips" style="margin-top:6px">${chips(c.coincide.slice(0,3),'ok')}${chips(c.falta.slice(0,2),'no')}</div>${c.notas.length?`<div class="small muted">${esc(c.notas[0])}</div>`:''}</td>
   ${hayReto?`<td class="sc">${c.reto===null?'<span class="muted">Pendiente</span>':`<span style="color:${c.aprobado?'var(--good)':'var(--coral)'}">${c.reto}%</span>`}</td>`:''}
   <td>${tag}${c.estado==='descartado'&&c.motivo?`<div class="small muted">${esc(c.motivo)}</div>`:''}</td>
   <td>${dec?'<span class="muted">—</span>':`<div class="act"><button class="btn sm p" data-mx="acepta" data-id="${esc(c.id)}">${R.acepta}</button><select data-mx="descarta" data-id="${esc(c.id)}" aria-label="Descartar con motivo"><option value="">Descartar por…</option>${MOTIVOS.map(m=>`<option>${esc(m)}</option>`).join('')}</select></div>`}</td></tr>`}).join('')}
  </tbody></table></div></section>`;
}
function editorReto(r){
 const ps=r.preguntas;
 return `<section class="card"><div class="sec-h"><h2>${r.existe?'Reto actual':'Nuevo reto'}</h2><div class="act"><button class="btn sm" data-mx="generar">${ic('spark')} Generar borrador con IA</button><button class="btn sm" data-mx="addq" ${ps.length>=8?'disabled':''}>${ic('plus')} Pregunta</button></div></div>
  <div class="opts2" style="margin-bottom:14px"><label style="cursor:default">Puntaje mínimo (%) <input type="number" min="1" max="100" value="${r.umbral}" data-rt="umbral" style="width:64px;border:1px solid var(--line);border-radius:8px;padding:4px 6px;font:inherit"></label>
   <label style="cursor:default">Cupos de entrevista <input type="number" min="1" max="50" value="${r.cupos}" data-rt="cupos" style="width:64px;border:1px solid var(--line);border-radius:8px;padding:4px 6px;font:inherit"></label></div>
  ${ps.length?ps.map((q,i)=>`<fieldset class="rq edit"><legend>Pregunta ${i+1} <button type="button" class="link" data-mx="delq" data-v="${i}" aria-label="Quitar pregunta ${i+1}">Quitar</button></legend>
   <textarea rows="2" data-q="${i}" data-f="pregunta" placeholder="Escribe la pregunta" maxlength="300">${esc(q.pregunta)}</textarea>
   ${q.opciones.map((o,j)=>`<label class="ro"><input type="radio" name="ok-${i}" ${q.correcta===j?'checked':''} data-q="${i}" data-f="ok" value="${j}" aria-label="Marcar como correcta la opción ${j+1}"><input type="text" value="${esc(o)}" data-q="${i}" data-f="op${j}" placeholder="Opción ${j+1}" maxlength="160"></label>`).join('')}
   <span class="small muted">Marca con el círculo la opción correcta.</span></fieldset>`).join(''):'<p class="small muted">Aún no hay preguntas. Genera un borrador con IA o agrega una pregunta.</p>'}
  <p class="err" id="rt-err" role="alert" hidden></p>
  <div class="act" style="margin-top:12px"><button class="btn p" data-mx="guardarReto" ${ps.length?'':'disabled'}>Guardar reto</button>${r.existe?`<button class="btn" data-mx="borrarReto">Eliminar reto</button>`:''}</div></section>`;
}
function validarReto(r){
 if(!r.preguntas.length)return 'Agrega al menos una pregunta.';
 for(let i=0;i<r.preguntas.length;i++){const q=r.preguntas[i];
  if(!q.pregunta.trim())return `Pregunta ${i+1}: escribe el enunciado.`;
  if(q.opciones.some(o=>!o.trim()))return `Pregunta ${i+1}: completa las 4 opciones.`;
  if(new Set(q.opciones.map(o=>o.trim().toLowerCase())).size!==4)return `Pregunta ${i+1}: las opciones no pueden repetirse.`;
  if(!(q.correcta>=0&&q.correcta<=3))return `Pregunta ${i+1}: marca cuál es la correcta.`}
 if(!(r.umbral>=1&&r.umbral<=100))return 'El puntaje mínimo debe estar entre 1 y 100.';
 if(!(r.cupos>=1&&r.cupos<=50))return 'Los cupos deben estar entre 1 y 50.';
 return '';
}

/* Administración: verificar organizaciones por RUC */
function vAdminVer(){
 if(st.orgsErr)return `<div class="stack">${errHTML(st.orgsErr,'recargarOrgs')}</div>`;
 if(st.orgs===null)return `<div class="stack">${cargandoHTML('Cargando organizaciones…')}</div>`;
 const rol={rrhh:'Empresa',ong:'ONG',cursos:'Empresa de cursos'};
 return `<div class="stack"><section class="card" id="s-ver"><div class="sec-h"><h2>Verificación por RUC</h2><span class="small muted">${st.orgs.filter(o=>!o.verificada).length} por revisar</span></div>
  <p class="small muted" style="margin:0 0 12px">Comprueba el RUC en la consulta pública de SUNAT antes de aprobar. Al aprobar, sus publicaciones se activan.</p>
  ${st.orgs.length?`<div class="list">${st.orgs.map(o=>`<div class="item"><div class="grow" style="display:flex;gap:10px;align-items:center">${av(o.nombre)}<div style="min-width:0"><div class="t">${esc(o.nombre)}</div><div class="m">${rol[o.rol]||''} · ${o.ruc?`RUC <span class="num">${esc(o.ruc)}</span>`:'<b style="color:var(--coral)">Sin RUC válido</b>'}</div></div></div>
   ${o.verificada?`<div class="act"><span class="tag t-ok">${ic('check',3)} Verificada</span><button class="btn sm" data-mx="verif" data-id="${esc(o.id)}" data-v="0">Revocar</button></div>`:`<div class="act"><button class="btn sm p" data-mx="verif" data-id="${esc(o.id)}" data-v="1" ${o.ruc?'':'disabled'}>Aprobar</button></div>`}</div>`).join('')}</div>`:'<p class="small muted" style="margin:0">Aún no hay organizaciones registradas.</p>'}</section></div>`;
}

/* ======================= Eventos ======================= */
const refrescar=(k,fn)=>{st[k]=null;rerender();fn()};
async function accion(b){
 const a=b.dataset.mx,id=b.dataset.id,v=b.dataset.v;
 try{
 switch(a){
  case 'tipo':st.tipo=v;st.cola=null;st.feedErr='';rerender();cargarFeed();break;
  case 'recargar':st.cola=null;st.feedErr='';rerender();cargarFeed();break;
  case 'like':case 'pass':decidir(a);break;
  case 'recargarPost':st.post=null;st.postErr='';rerender();cargarPost();break;
  case 'reto':abrirReto(id);break;
  case 'recargarOrg':st.ofertas=null;st.orgErr='';rerender();cargarOrg();break;
  case 'ver':st.sel=id;st.cand=null;goPage('cand');break;
  case 'irreto':st.sel=id;st.reto=null;goPage('retos');break;
  case 'estado':await api.estadoOferta(id,v);toast(v==='cerrada'?'Publicación cerrada':'Publicación reabierta');st.ofertas=null;st.rep=null;rerender();cargarOrg();break;
  case 'acepta':await api.decidir(id,'entrevista',null);toast('Candidato aceptado. Verá tu respuesta en su panel.');refrescar('cand',cargarCand);st.ofertas=null;cargarOrg();break;
  case 'recargarCand':st.cand=null;st.candErr='';rerender();cargarCand();break;
  case 'recargarReto':st.reto=null;st.retoErr='';rerender();cargarReto();break;
  case 'recargarRep':st.rep=null;st.repErr='';rerender();cargarRep();break;
  case 'recargarOrgs':st.orgs=null;st.orgsErr='';rerender();cargarOrgs();break;
  case 'addq':if(st.reto.preguntas.length<8){st.reto.preguntas.push({pregunta:'',opciones:['','','',''],correcta:-1});rerender()}break;
  case 'delq':st.reto.preguntas.splice(+v,1);rerender();break;
  case 'generar':{
   b.disabled=true;b.textContent='La IA está redactando…';
   const ps=await api.retoGenerar(st.reto.oferta_id);
   st.reto.preguntas=ps;toast('Borrador listo: revísalo y edítalo antes de guardar.');rerender();break}
  case 'guardarReto':{
   const er=$('#rt-err'),msg=validarReto(st.reto);if(msg){er.textContent=msg;er.hidden=false;return}
   await api.retoGuardar(st.reto.oferta_id,st.reto.preguntas.map(q=>({pregunta:q.pregunta.trim(),opciones:q.opciones.map(o=>o.trim()),correcta:q.correcta})),st.reto.umbral,st.reto.cupos);
   toast('Reto guardado. Los estudiantes interesados podrán resolverlo.');st.reto=null;st.ofertas=null;rerender();cargarReto();cargarOrg();break}
  case 'borrarReto':await api.retoBorrar(st.reto.oferta_id);toast('Reto eliminado');st.reto=null;st.ofertas=null;rerender();cargarReto();cargarOrg();break;
  case 'verif':await api.verificar(id,v==='1');toast(v==='1'?'Organización verificada':'Verificación revocada');st.orgs=null;rerender();cargarOrgs();break;
 }
 }catch(e){toast(e.message||'Ocurrió un error');if(b.isConnected){b.disabled=false}rerender()}
}
function montar(){
 app.addEventListener('click',e=>{const b=e.target.closest('button[data-mx]');if(b)accion(b)});
 app.addEventListener('change',e=>{
  const s=e.target;
  if(s.dataset.mx==='sel'){st.sel=s.value;st.cand=null;st.reto=null;rerender();if(pg==='cand')cargarCand();else cargarReto()}
  else if(s.dataset.f==='ok')st.reto.preguntas[+s.dataset.q].correcta=+s.value;
 });
 app.addEventListener('input',e=>{
  const t=e.target,d=t.dataset;
  if(d.draft)st.draft[d.draft]=t.value;
  else if(d.q!==undefined&&d.f&&d.f!=='ok'){const q=st.reto.preguntas[+d.q];if(d.f==='pregunta')q.pregunta=t.value;else q.opciones[+d.f.slice(2)]=t.value}
  else if(d.rt)st.reto[d.rt]=+t.value;
 });
 app.addEventListener('submit',async e=>{
  if(e.target.id!=='ofform')return;e.preventDefault();
  const er=$('#of-err'),go=$('#of-go'),titulo=st.draft.titulo.trim(),desc=st.draft.desc.trim();er.hidden=true;
  const fail=m=>{er.textContent=m;er.hidden=false};
  if(titulo.length<5)return fail('Escribe un título (mínimo 5 caracteres).');
  if(desc.length<40)return fail('Describe mejor la publicación (mínimo 40 caracteres) para que la IA pueda leerla.');
  go.disabled=true;go.textContent='La IA está leyendo tu texto…';
  try{const o=await api.publicar(titulo,desc);st.ultima=o;st.draft={titulo:'',desc:''};st.ofertas=null;st.cand=null;st.rep=null;toast(o.estado==='activa'?'Publicada. Ya aparece a los estudiantes.':'Guardada. Se activará cuando verifiquemos tu RUC.');rerender();cargarOrg()}
  catch(err){go.disabled=false;go.innerHTML=ic('spark')+' Analizar con IA y publicar';fail(err.message)}
 });
 // descartar con motivo (select): se maneja aparte porque usa el valor elegido
 app.addEventListener('change',async e=>{
  const s=e.target;if(s.dataset.mx!=='descarta'||!s.value)return;
  try{await api.decidir(s.dataset.id,'descartado',s.value);toast('Respuesta enviada con el motivo');st.cand=null;st.ofertas=null;rerender();cargarCand();cargarOrg()}
  catch(err){toast(err.message);s.value=''}
 });
 // arrastre de tarjetas
 app.addEventListener('pointerdown',dragIni);app.addEventListener('pointermove',dragMov);app.addEventListener('pointerup',dragFin);app.addEventListener('pointercancel',dragFin);
 document.addEventListener('keydown',e=>{
  if(cur!=='estudiante'||pg!=='descubrir'||!$('#modal').hidden)return;
  if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
  if(e.key==='ArrowRight'){e.preventDefault();decidir('like')}else if(e.key==='ArrowLeft'){e.preventDefault();decidir('pass')}
 });
 // reto del estudiante (modal)
 $('#modal').addEventListener('submit',e=>{if(e.target.id==='retoform'){e.preventDefault();enviarReto(e.target)}});
}
return {st,real:(rol,p)=>!!(LIVE&&REAL[rol]&&REAL[rol].includes(p)),vDescubrir,vPostulaciones,resumenPost,vOrg,vAdminVer,alMostrar,reiniciar,invalidar,montar,badge,precargar:()=>{if(real()&&st.post===null)cargarPost()}};
})();
