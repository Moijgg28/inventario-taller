// ====== CONFIGURACIÓN SUPABASE ======
const SUPABASE_URL = 'https://bqvcizbwovbqttppqhoc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxdmNpemJ3b3ZicXR0cHBxaG9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTA3ODksImV4cCI6MjA5Nzc4Njc4OX0.Xb4tvWxS9KohLYx32HLdwrEKnK9xaxCRtKcCljRR39g';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// =====================================

// Qué tipos de material en patio sirven como candidato para cada búsqueda.
// Ej: si buscas "Barra con hueco", una "Barra maciza" también sirve (se taladra).
// null = acepta cualquier tipo (caso "Otros")
const TIPO_COMPATIBLES = {
  'Barra maciza': ['Barra maciza'],
  'Barra con hueco': ['Barra con hueco', 'Barra maciza'],
  'Plancha': ['Plancha'],
  'Otros': null
};

// Campos que aplican a cada tipo de material
const TIPO_CAMPOS = {
  'Barra maciza': ['od_mm','largo_cm'],
  'Barra con hueco': ['od_mm','id_mm','largo_cm'],
  'Plancha': ['ancho_cm','largo_cm','espesor_mm'],
  'Otros': ['od_mm','id_mm','espesor_mm','ancho_cm','largo_cm']
};

// Dirección de uso válida por dimensión:
// gte = el material debe ser >= a lo pedido (se puede cortar/rebajar)
// lte = el material debe ser <= a lo pedido (se puede taladrar/escariar más grande)
const DIM_DIR = { od_mm:'gte', id_mm:'lte', largo_cm:'gte', ancho_cm:'gte', espesor_mm:'gte' };
const DIM_LABEL = { od_mm:'OD', id_mm:'ID', largo_cm:'Largo', ancho_cm:'Ancho', espesor_mm:'Espesor' };
const DIM_UNIT = { od_mm:'mm', id_mm:'mm', largo_cm:'cm', ancho_cm:'cm', espesor_mm:'mm' };

let materiales = [];
let fotoFile = null;
let editingId = null;

document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const panel = document.getElementById('panel-'+t.dataset.tab);
    panel.style.animation = 'none';
    panel.offsetHeight;
    panel.style.animation = '';
    panel.classList.add('active');
    moverIndicador(t);
    if(t.dataset.tab==='inventario') renderInventario();
  });
});

document.getElementById('a-codigo').value = generarCodigo();
function generarCodigo(){
  return 'MAT-' + Date.now().toString().slice(-6);
}

function moverIndicador(tabEl){
  const indicador = document.getElementById('tab-indicator');
  const contenedor = document.getElementById('tabs-container');
  const contRect = contenedor.getBoundingClientRect();
  const tabRect = tabEl.getBoundingClientRect();
  indicador.style.left = (tabRect.left - contRect.left) + 'px';
  indicador.style.width = tabRect.width + 'px';
}

function abrirImagenAmpliada(m){
  if(!m.foto_url) return;
  document.getElementById('modal-imagen-img').src = m.foto_url;
  document.getElementById('modal-detalle-titulo').textContent = `${m.tipo||''}${m.material?' · '+m.material:''} · ${m.codigo||''}`;
  document.getElementById('modal-detalle-ubic').textContent = m.ubicacion ? '📍 ' + m.ubicacion : '';
  const obsEl = document.getElementById('modal-detalle-obs');
  if(m.observaciones){
    obsEl.textContent = '📝 ' + m.observaciones;
    obsEl.style.display = 'block';
  }else{
    obsEl.style.display = 'none';
  }
  document.getElementById('modal-imagen').style.display = 'flex';
}

function cerrarImagenAmpliada(){
  document.getElementById('modal-imagen').style.display = 'none';
}

function blindarCampoId(input){
  input.addEventListener('blur', ()=>{
    if(input.value.trim() === ''){
      input.value = '0';
    }
  });
}
blindarCampoId(document.getElementById('s-id'));
blindarCampoId(document.getElementById('a-id'));

function actualizarCamposFormulario(){
  const tipo = document.getElementById('a-tipo').value;
  const activos = TIPO_CAMPOS[tipo] || TIPO_CAMPOS['Otros'];
  document.querySelectorAll('#panel-agregar [data-campo]').forEach(el=>{
    el.style.display = activos.includes(el.dataset.campo) ? '' : 'none';
  });
}

document.getElementById('a-tipo').addEventListener('change', actualizarCamposFormulario);

function actualizarCamposBusqueda(){
  const tipo = document.getElementById('s-tipo').value;
  const activos = TIPO_CAMPOS[tipo] || TIPO_CAMPOS['Otros'];
  document.querySelectorAll('#panel-buscar [data-campo]').forEach(el=>{
    el.style.display = activos.includes(el.dataset.campo) ? '' : 'none';
  });
}
document.getElementById('s-tipo').addEventListener('change', actualizarCamposBusqueda);

async function cargarTodo(){
  const statusEl = document.getElementById('conn-status');
  try{
    const { data, error } = await sb.from('materiales').select('*').order('created_at', {ascending:false});
    if(error) throw error;
    materiales = data || [];
    statusEl.textContent = `Conectado · ${materiales.length} materiales cargados`;
  }catch(e){
    statusEl.textContent = 'No se pudo conectar a la base de datos. Revisa tu conexión.';
    statusEl.style.color = 'var(--red)';
    console.error(e);
  }
}

function onFotoChange(ev){
  const file = ev.target.files[0];
  if(!file) return;
  fotoFile = file;
  const reader = new FileReader();
  reader.onload = e=>{
    const img = document.getElementById('photo-preview');
    img.src = e.target.result;
    img.style.display = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function subirFoto(codigo, file){
  const resized = await new Promise(resolve=>{
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e=>{
      img.onload = ()=>{
        const maxW = 600;
        const scale = Math.min(1, maxW/img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width*scale;
        canvas.height = img.height*scale;
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>resolve(blob), 'image/jpeg', 0.6);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  const path = `${codigo}-${Date.now()}.jpg`;
  const { error } = await sb.storage.from('fotos-materiales').upload(path, resized, { contentType:'image/jpeg' });
  if(error) throw error;
  const { data } = sb.storage.from('fotos-materiales').getPublicUrl(path);
  return data.publicUrl;
}

async function agregarMaterial(){
  const btn = document.getElementById('btn-guardar');
  const errEl = document.getElementById('err-msg');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = editingId ? 'Actualizando...' : 'Guardando...';

  try{
    const codigo = document.getElementById('a-codigo').value.trim() || generarCodigo();
    let fotoUrl = document.getElementById('a-foto-url-actual').value || '';
    if(fotoFile){
      fotoUrl = await subirFoto(codigo, fotoFile);
    }

    const item = {
      codigo,
      tipo: document.getElementById('a-tipo').value,
      material: document.getElementById('a-material').value.trim(),
      id_mm: parseFloat(document.getElementById('a-id').value) || 0,
      od_mm: parseFloat(document.getElementById('a-od').value) || 0,
      espesor_mm: parseFloat(document.getElementById('a-esp').value) || null,
      ancho_cm: parseFloat(document.getElementById('a-ancho').value) || null,
      largo_cm: parseFloat(document.getElementById('a-largo').value) || 0,
      ubicacion: document.getElementById('a-ubic').value.trim(),
      cantidad: parseInt(document.getElementById('a-cant').value) || null,
      observaciones: document.getElementById('a-notas').value.trim(),
      foto_url: fotoUrl,
      update_at: new Date().toISOString()
    };

    let error;
    if(editingId){
     ({ error } = await sb.from('materiales').update(item).eq('id', editingId));
    }else{
      ({ error } = await sb.from('materiales').insert([item]));
    }
    if(error) throw error;

    document.getElementById('save-msg').textContent = editingId ? 'Actualizado correctamente.' : 'Guardado correctamente.';
    document.getElementById('save-msg').style.display='block';
    setTimeout(()=>document.getElementById('save-msg').style.display='none', 2500);
    cancelarEdicion();
    await cargarTodo();
    renderInventario();
  }catch(e){
    errEl.textContent = 'Error al guardar: ' + (e.message || 'intenta de nuevo.');
    errEl.style.display = 'block';
    console.error(e);
  }finally{
    btn.disabled = false;
    btn.textContent = editingId ? 'Actualizar material' : 'Guardar material';
  }
}

function cancelarEdicion(){
  editingId = null;
  ['a-material','a-id','a-od','a-esp','a-ancho','a-largo','a-ubic','a-cant','a-notas'].forEach(i=>document.getElementById(i).value='');
  document.getElementById('a-codigo').value = generarCodigo();
  document.getElementById('a-foto-url-actual').value = '';
  document.getElementById('a-tipo').value = 'Barra maciza';
  fotoFile = null;
  document.getElementById('photo-preview').src='';
  document.getElementById('photo-preview').style.display='none';
  document.getElementById('photo-placeholder').style.display='';  
  document.getElementById('foto-input').value='';
  document.getElementById('foto-camara').value='';
  document.getElementById('btn-guardar').textContent = 'Guardar material';
  document.getElementById('btn-cancelar-edicion').style.display = 'none';
  actualizarCamposFormulario();
}

function editarMaterial(id){
  const m = materiales.find(x=>x.id===id);
  if(!m) return;
  editingId = id;
  document.getElementById('a-codigo').value = m.codigo || '';
  document.getElementById('a-tipo').value = m.tipo || 'Otros';
  document.getElementById('a-material').value = m.material || '';
  document.getElementById('a-id').value = m.id_mm || '';
  document.getElementById('a-od').value = m.od_mm || '';
  document.getElementById('a-esp').value = m.espesor_mm || '';
  document.getElementById('a-ancho').value = m.ancho_cm || '';
  document.getElementById('a-largo').value = m.largo_cm || '';
  document.getElementById('a-ubic').value = m.ubicacion || '';
  document.getElementById('a-cant').value = m.cantidad || '';
  document.getElementById('a-notas').value = m.observaciones || '';
  document.getElementById('a-foto-url-actual').value = m.foto_url || '';
  const previewImg = document.getElementById('photo-preview');
  const placeholder = document.getElementById('photo-placeholder');
  if(m.foto_url){
    previewImg.src = m.foto_url;
    previewImg.style.display = 'block';
    placeholder.style.display = 'none';
  }else{
    previewImg.src = '';
    previewImg.style.display = 'none';
    placeholder.style.display = '';
  }
  document.getElementById('btn-guardar').textContent = 'Actualizar material';
  document.getElementById('btn-cancelar-edicion').style.display = 'inline-block';
  actualizarCamposFormulario();

  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  document.querySelector('.tab[data-tab="agregar"]').classList.add('active');
  document.getElementById('panel-agregar').classList.add('active');
  window.scrollTo({top:0, behavior:'smooth'});
}

let idPendienteEliminar = null;

function eliminarMaterial(id){
  idPendienteEliminar = id;
  document.getElementById('modal-confirm').style.display = 'flex';
}

function cerrarModalConfirm(confirmado){
  document.getElementById('modal-confirm').style.display = 'none';
  if(confirmado && idPendienteEliminar){
    ejecutarEliminacion(idPendienteEliminar);
  }
  idPendienteEliminar = null;
}

async function ejecutarEliminacion(id){
  try{
    const { error } = await sb.from('materiales').delete().eq('id', id);
    if(error) throw error;
    await cargarTodo();
    renderInventario();
  }catch(e){
    alert('No se pudo eliminar: ' + e.message);
  }
}

function renderInventario(){
  const cont = document.getElementById('lista-inventario');
  const filtro = document.getElementById('filtro-inv').value.toLowerCase();
  const lista = materiales.filter(m=>{
    if(!filtro) return true;
    return ((m.tipo||'')+(m.material||'')+(m.ubicacion||'')+(m.codigo||'')).toLowerCase().includes(filtro);
  });
  if(lista.length===0){
    cont.innerHTML = '<div class="empty">No hay materiales registrados todavía. Ve a la pestaña Agregar.</div>';
    return;
  }
  cont.innerHTML = lista.map(m=>`
    <div class="item-row">
     ${m.foto_url ? `<img src="${m.foto_url}" onclick="abrirImagenAmpliada(materiales.find(x=>x.id===${m.id}))" style="cursor:zoom-in;">` : `<div style="width:46px;height:46px;background:var(--surface2);border-radius:4px;flex-shrink:0;"></div>`}
      <div class="info">
        <p class="name">${m.tipo||''}${m.material?' · '+m.material:''} <span class="codigo-tag">${m.codigo||''}</span></p>
        <p class="meta">${formatDims(m)} ${m.ubicacion?'· '+m.ubicacion:''}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        <button class="del" style="border-color:var(--cyan);color:var(--cyan);" onclick="editarMaterial(${m.id})">Editar</button>
        <button class="del" onclick="eliminarMaterial(${m.id})">Quitar</button>
      </div>
    </div>
  `).join('');
}

function formatDims(m){
  const campos = TIPO_CAMPOS[m.tipo] || TIPO_CAMPOS['Otros'];
  return campos.map(c=>`${DIM_LABEL[c]} ${m[c]||0}${DIM_UNIT[c]}`).join(' · ');
}

function buscar(){
  const tipoBuscado = document.getElementById('s-tipo').value;
  const campos = TIPO_CAMPOS[tipoBuscado] || TIPO_CAMPOS['Otros'];

  const inputs = {
    od_mm: document.getElementById('s-od').value,
    id_mm: document.getElementById('s-id').value,
    espesor_mm: document.getElementById('s-esp').value,
    ancho_cm: document.getElementById('s-ancho').value,
    largo_cm: document.getElementById('s-largo').value,
  };
  const targets = {};
  campos.forEach(c=>{ if(inputs[c]!=='' && inputs[c]!=null) targets[c] = parseFloat(inputs[c]); });

  const cont = document.getElementById('resultados');
  if(Object.keys(targets).length===0){
    cont.innerHTML = '<div class="empty">Ingresa al menos una medida para buscar.</div>';
    return;
  }

  const tiposValidos = TIPO_COMPATIBLES[tipoBuscado];
  const candidatos = materiales.filter(m => tiposValidos===null ? true : tiposValidos.includes(m.tipo));

  if(candidatos.length===0){
    cont.innerHTML = '<div class="empty">No hay materiales registrados de este tipo todavía.</div>';
    return;
  }

  const usables = [];
  const descartados = [];

  candidatos.forEach(m=>{
    let falla = null;
    let totalRel = 0, count = 0;
    const detalle = {};
    const esSustitutoTaladrable = m.tipo === 'Barra maciza' && tipoBuscado === 'Barra con hueco' && targets.hasOwnProperty('id_mm') && targets.id_mm > 0;
    for(const campo in targets){
      if(esSustitutoTaladrable && campo === 'id_mm'){
    continue; // no se compara ID en una barra maciza, se va a taladrar
  }
      const target = targets[campo];
      const val = m[campo] || 0;
      const dir = DIM_DIR[campo];
      let ok, diff;

      if(dir==='gte'){
        ok = val >= target;
        diff = val - target;
      }else{
        ok = val <= target;
        diff = target - val;
      }
      const rel = Math.abs(diff) / Math.max(target, 1);
      detalle[campo] = {val, ok, diff};

      if(!ok && !falla){
        falla = `${DIM_LABEL[campo]} insuficiente: tiene ${val}${DIM_UNIT[campo]}, necesitas ${dir==='gte'?'al menos':'máximo'} ${target}${DIM_UNIT[campo]}`;
      }
      totalRel += rel;
      count++;
    }

        let score = totalRel/count;
    if(esSustitutoTaladrable){
      score += 0.12;
    }

    if(falla){
      descartados.push({m, motivo: falla});
    }else{
      usables.push({m, score, detalle, esSustitutoTaladrable});
    }
  });

  usables.sort((a,b)=>a.score-b.score);
  const top = usables.slice(0,8);

  let html = '';
  if(top.length===0){
    html += '<div class="empty">Ningún material en patio cumple esas medidas. Revisa la lista de descartados abajo.</div>';
  }else{
    html += top.map(({m,score,detalle,esSustitutoTaladrable})=>{
      const matchPct = Math.max(0, Math.min(100, Math.round((1-score)*100)));
      const color = matchPct>=80 ? 'var(--green)' : matchPct>=60 ? 'var(--orange)' : 'var(--red)';
      const dimHtml = Object.keys(detalle).map(c=>`<div class="dim"><span class="k">${DIM_LABEL[c]}</span>${detalle[c].val}${DIM_UNIT[c]}</div>`).join('');
      const avisoHtml = esSustitutoTaladrable ? `<p style="color:var(--orange);font-size:11px;margin:2px 0 4px;">⚠ Es ${m.tipo}, hay que perforarle el hueco</p>` : '';
      return `
        <div class="result">
         ${m.foto_url ? `<img src="${m.foto_url}" onclick="abrirImagenAmpliada(materiales.find(x=>x.id===${m.id}))" style="cursor:zoom-in;">` : `<div style="width:72px;height:72px;background:var(--surface2);border-radius:4px;flex-shrink:0;"></div>`}
          <div class="info">
            <p class="name">${m.tipo||''}${m.material?' · '+m.material:''} <span class="codigo-tag">${m.codigo||''}</span></p>
            <p class="loc">${m.ubicacion || 'Sin ubicación registrada'}</p>
            ${avisoHtml}
            <div class="dims">${dimHtml}</div>
            <div class="match-bar"><div class="match-fill" style="width:${matchPct}%;background:${color};"></div></div>
          </div>
          <div class="score-badge">${matchPct}% util</div>
        </div>
      `;
    }).join('');
  }

  if(descartados.length>0){
    html += `<div class="hint" style="margin-top:1rem;">No sirven para esta medida (${descartados.length}):</div>`;
    html += descartados.slice(0,6).map(({m,motivo})=>`
      <div class="result" style="opacity:.55;">
       ${m.foto_url ? `<img src="${m.foto_url}" onclick="abrirImagenAmpliada(materiales.find(x=>x.id===${m.id}))" style="cursor:zoom-in;">` : `<div style="width:72px;height:72px;background:var(--surface2);border-radius:4px;flex-shrink:0;"></div>`}
        <div class="info">
          <p class="name">${m.tipo||''}${m.material?' · '+m.material:''} <span class="codigo-tag">${m.codigo||''}</span></p>
          <p class="loc" style="color:var(--red);">${motivo}</p>
        </div>
      </div>
    `).join('');
  }

  cont.innerHTML = html;
}

actualizarCamposFormulario();
actualizarCamposBusqueda();
cargarTodo();
window.addEventListener('load', ()=>{
  moverIndicador(document.querySelector('.tab.active'));
});
