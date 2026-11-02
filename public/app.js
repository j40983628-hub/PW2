/* global io */
'use strict';

// ============================================================================
// ESTADO Y SELECTORES
// ============================================================================

let salasCache = [];
let reservasCache = [];

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// Formato de fechas
const formatearFecha = (iso) => {
  if (!iso) return '-';
  const [f, h] = iso.split('T');
  if (!h) return iso;
  const [anio, mes, dia] = f.split('-');
  return `${dia}/${mes}/${anio} ${h.slice(0, 5)}`;
};

const isoAParaInput = (iso) => (iso ? iso.slice(0, 16) : '');

// Alertas en pantalla
const mostrarAlerta = (mensaje, tipo = 'success') => {
  const container = $('alertContainer');
  const alert = document.createElement('div');
  alert.className = `alert alert-${tipo}`;

  const span = document.createElement('span');
  span.innerHTML = mensaje;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-clear';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => alert.remove());

  alert.appendChild(span);
  alert.appendChild(closeBtn);
  container.replaceChildren(alert);
  setTimeout(() => alert.remove(), 6000);
};

const parsearErrorApi = (errData) => {
  if (!errData || !errData.error) return 'Error inesperado del servidor';
  const { code, message, details } = errData.error;
  if (code === 'RESERVA_SOLAPADA' && details?.conflictos) {
    const c = details.conflictos[0];
    return `⚠️ Conflicto de horario: La sala ya está reservada por <strong>${c.responsable}</strong> (${formatearFecha(c.inicio)} a ${formatearFecha(c.fin)})`;
  }
  if (code === 'CAPACIDAD_EXCEDIDA' && details) {
    return `⚠️ Capacidad excedida: La sala solo admite ${details.capacidad} personas (asistentes: ${details.asistentes})`;
  }
  if (code === 'CONFLICTO_VERSION') {
    return '⚠️ La reserva fue modificada recientemente por otro usuario. Recargue e intente nuevamente.';
  }
  if (code === 'RECURSO_REFERENCIADO') {
    return '⚠️ No se puede eliminar la sala porque tiene reservas asociadas.';
  }
  if (code === 'VALIDACION' && Array.isArray(details)) {
    const campos = details.map((d) => `• <strong>${d.campo}:</strong> ${d.mensaje}`).join('<br>');
    return `Errores de validación:<br>${campos}`;
  }
  return message || 'Error al procesar la solicitud';
};

// ============================================================================
// MODALES
// ============================================================================

const abrirModal = (id) => $(id)?.classList.remove('hidden');
const cerrarModal = (id) => {
  const modal = $(id);
  if (!modal) return;
  modal.classList.add('hidden');
  const err = modal.querySelector('.modal-alert');
  if (err) {
    err.classList.add('hidden');
    err.textContent = '';
  }
};

$$('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => cerrarModal(btn.dataset.close));
});

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $$('.modal-backdrop:not(.hidden)').forEach((m) => m.classList.add('hidden'));
  }
});

// ============================================================================
// PESTAÑAS
// ============================================================================

$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach((b) => b.classList.remove('active'));
    $$('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    $(btn.dataset.tab).classList.add('active');
  });
});

// ============================================================================
// SALAS (CRUD)
// ============================================================================

const cargarSalas = async () => {
  try {
    const res = await fetch('/api/salas');
    const { data } = await res.json();
    salasCache = data || [];
    renderizarSalas();
    actualizarSelectsSalas();
  } catch (error) {
    console.error('Error cargando salas:', error);
  }
};

const renderizarSalas = () => {
  const tbody = $('tablaSalas');
  if (salasCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay salas registradas. ¡Crea la primera!</td></tr>';
    return;
  }
  tbody.innerHTML = salasCache
    .map(
      (s) => `
    <tr>
      <td><strong>${s.id}</strong></td>
      <td><strong>${s.nombre}</strong></td>
      <td>${s.capacidad} personas</td>
      <td>${s.ubicacion || '<span style="color:#94a3b8">No especificada</span>'}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-action="editar-sala" data-id="${s.id}">✏️ Editar</button>
          <button type="button" class="btn btn-sm btn-danger" data-action="eliminar-sala" data-id="${s.id}" data-nombre="${s.nombre}">🗑️ Eliminar</button>
        </div>
      </td>
    </tr>
  `,
    )
    .join('');
};

const actualizarSelectsSalas = () => {
  const opciones = salasCache.map((s) => `<option value="${s.id}">${s.nombre} (Cap: ${s.capacidad})</option>`).join('');

  $('reservaSalaId').innerHTML = '<option value="">Seleccione una sala...</option>' + opciones;

  const valorFiltro = $('filtroSala').value;
  $('filtroSala').innerHTML = '<option value="">Todas las salas</option>' + opciones;
  $('filtroSala').value = valorFiltro;
};

// Delegación de eventos para la tabla de salas
$('tablaSalas').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);

  if (action === 'editar-sala') {
    editarSala(id);
  } else if (action === 'eliminar-sala') {
    const nombre = btn.dataset.nombre || `Sala #${id}`;
    eliminarSala(id, nombre);
  }
});

$('btnNuevaSala').addEventListener('click', () => {
  $('formSala').reset();
  $('salaId').value = '';
  $('modalSalaTitulo').textContent = 'Nueva Sala';
  abrirModal('modalSala');
});

const editarSala = (id) => {
  const sala = salasCache.find((s) => s.id === id);
  if (!sala) return;
  $('salaId').value = sala.id;
  $('salaNombre').value = sala.nombre;
  $('salaCapacidad').value = sala.capacidad;
  $('salaUbicacion').value = sala.ubicacion || '';
  $('modalSalaTitulo').textContent = `Editar Sala #${sala.id}`;
  abrirModal('modalSala');
};

$('formSala').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('salaId').value;
  const errBox = $('modalSalaError');
  errBox.classList.add('hidden');

  const payload = {
    nombre: $('salaNombre').value.trim(),
    capacidad: Number($('salaCapacidad').value),
    ubicacion: $('salaUbicacion').value.trim() || null,
  };

  try {
    const url = id ? `/api/salas/${id}` : '/api/salas';
    const metodo = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      errBox.innerHTML = parsearErrorApi(data);
      errBox.classList.remove('hidden');
      return;
    }
    cerrarModal('modalSala');
    mostrarAlerta(`Sala "${payload.nombre}" ${id ? 'actualizada' : 'creada'} con éxito.`);
    cargarSalas();
  } catch (error) {
    errBox.textContent = 'Error de conexión con el servidor.';
    errBox.classList.remove('hidden');
  }
});

const eliminarSala = async (id, nombre) => {
  if (!confirm(`¿Estás seguro de eliminar la sala "${nombre}"?`)) return;
  try {
    const res = await fetch(`/api/salas/${id}`, { method: 'DELETE' });
    if (res.status === 204) {
      mostrarAlerta(`Sala "${nombre}" eliminada correctamente.`);
      cargarSalas();
      cargarReservas();
      return;
    }
    const data = await res.json();
    mostrarAlerta(parsearErrorApi(data), 'danger');
  } catch (error) {
    mostrarAlerta('Error de red al intentar eliminar la sala.', 'danger');
  }
};

// ============================================================================
// RESERVAS (CRUD)
// ============================================================================

const cargarReservas = async () => {
  try {
    const salaId = $('filtroSala').value;
    const estado = $('filtroEstado').value;
    const params = new URLSearchParams({ limite: '100' });
    if (salaId) params.set('salaId', salaId);
    if (estado) params.set('estado', estado);

    $('btnExportarCsv').href = `/api/reservas/exportar?${params.toString()}`;

    const res = await fetch(`/api/reservas?${params.toString()}`);
    const { data } = await res.json();
    reservasCache = data || [];
    renderizarReservas();
  } catch (error) {
    console.error('Error cargando reservas:', error);
  }
};

const renderizarReservas = () => {
  const tbody = $('tablaReservas');
  if (reservasCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No hay reservas que coincidan con los filtros.</td></tr>';
    return;
  }

  tbody.innerHTML = reservasCache
    .map((r) => {
      const estaConfirmada = r.estado === 'confirmada';
      return `
      <tr>
        <td><strong>${r.id}</strong></td>
        <td><strong>${r.salaNombre || `Sala #${r.salaId}`}</strong></td>
        <td>${r.responsable}</td>
        <td><small>${r.motivo || '<span style="color:#94a3b8">Sin motivo</span>'}</small></td>
        <td>
          <div><small style="color:#059669">▶ ${formatearFecha(r.inicio)}</small></div>
          <div><small style="color:#dc2626">■ ${formatearFecha(r.fin)}</small></div>
        </td>
        <td>${r.asistentes}</td>
        <td>
          <span class="badge badge-${r.estado}">${r.estado}</span>
        </td>
        <td><small style="color:#64748b">v${r.version}</small></td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn btn-sm btn-secondary" data-action="editar-reserva" data-id="${r.id}">✏️ Editar</button>
            ${
              estaConfirmada
                ? `<button type="button" class="btn btn-sm btn-outline" data-action="cancelar-reserva" data-id="${r.id}" data-version="${r.version}" title="Libera el horario de la sala">❌ Cancelar</button>`
                : ''
            }
            <button type="button" class="btn btn-sm btn-danger" data-action="eliminar-reserva" data-id="${r.id}">🗑️</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
};

// Delegación de eventos para la tabla de reservas
$('tablaReservas').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);

  if (action === 'editar-reserva') {
    editarReserva(id);
  } else if (action === 'cancelar-reserva') {
    const version = Number(btn.dataset.version);
    cancelarReserva(id, version);
  } else if (action === 'eliminar-reserva') {
    eliminarReserva(id);
  }
});

// Filtros
$('filtroSala').addEventListener('change', cargarReservas);
$('filtroEstado').addEventListener('change', cargarReservas);
$('btnLimpiarFiltros').addEventListener('click', () => {
  $('filtroSala').value = '';
  $('filtroEstado').value = '';
  cargarReservas();
});

// Modal Crear/Editar Reserva
$('btnNuevaReserva').addEventListener('click', () => {
  $('formReserva').reset();
  $('reservaId').value = '';
  $('reservaVersion').value = '';
  $('grupoEstadoEdicion').style.display = 'none';
  $('modalReservaTitulo').textContent = 'Nueva Reserva';

  // Fechas por defecto: hoy siguiente hora redonda
  const ahora = new Date();
  ahora.setMinutes(0, 0, 0);
  ahora.setHours(ahora.getHours() + 1);
  const fin = new Date(ahora);
  fin.setHours(fin.getHours() + 1);

  const localIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $('reservaInicio').value = localIso(ahora);
  $('reservaFin').value = localIso(fin);

  abrirModal('modalReserva');
});

const editarReserva = (id) => {
  const r = reservasCache.find((item) => item.id === id);
  if (!r) return;
  $('reservaId').value = r.id;
  $('reservaVersion').value = r.version;
  $('reservaSalaId').value = r.salaId;
  $('reservaResponsable').value = r.responsable;
  $('reservaMotivo').value = r.motivo || '';
  $('reservaInicio').value = isoAParaInput(r.inicio);
  $('reservaFin').value = isoAParaInput(r.fin);
  $('reservaAsistentes').value = r.asistentes;
  $('reservaEstado').value = r.estado;
  $('grupoEstadoEdicion').style.display = 'block';
  $('modalReservaTitulo').textContent = `Editar Reserva #${r.id} (v${r.version})`;
  abrirModal('modalReserva');
};

$('formReserva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('reservaId').value;
  const version = Number($('reservaVersion').value);
  const errBox = $('modalReservaError');
  errBox.classList.add('hidden');

  const inicio = $('reservaInicio').value;
  const fin = $('reservaFin').value;

  if (fin <= inicio) {
    errBox.textContent = 'La fecha y hora de fin debe ser posterior al inicio.';
    errBox.classList.remove('hidden');
    return;
  }

  const payload = {
    salaId: Number($('reservaSalaId').value),
    responsable: $('reservaResponsable').value.trim(),
    motivo: $('reservaMotivo').value.trim() || null,
    inicio,
    fin,
    asistentes: Number($('reservaAsistentes').value),
  };

  if (id) {
    payload.estado = $('reservaEstado').value;
    payload.version = version;
  }

  try {
    const url = id ? `/api/reservas/${id}` : '/api/reservas';
    const metodo = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      errBox.innerHTML = parsearErrorApi(data);
      errBox.classList.remove('hidden');
      return;
    }
    cerrarModal('modalReserva');
    mostrarAlerta(`Reserva ${id ? 'actualizada' : 'creada'} exitosamente.`);
    cargarReservas();
  } catch (error) {
    errBox.textContent = 'Error de conexión con el servidor.';
    errBox.classList.remove('hidden');
  }
});

const cancelarReserva = async (id, version) => {
  if (!confirm('¿Desea cancelar esta reserva? El horario quedará liberado para otros usuarios.')) return;
  try {
    const res = await fetch(`/api/reservas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'cancelada', version }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarAlerta(parsearErrorApi(data), 'danger');
      return;
    }
    mostrarAlerta(`Reserva #${id} cancelada. Horario liberado.`);
    cargarReservas();
  } catch (error) {
    mostrarAlerta('Error de conexión al cancelar la reserva.', 'danger');
  }
};

const eliminarReserva = async (id) => {
  if (!confirm(`¿Eliminar definitivamente la reserva #${id}?`)) return;
  try {
    const res = await fetch(`/api/reservas/${id}`, { method: 'DELETE' });
    if (res.status === 204) {
      mostrarAlerta(`Reserva #${id} eliminada.`);
      cargarReservas();
      return;
    }
    const data = await res.json();
    mostrarAlerta(parsearErrorApi(data), 'danger');
  } catch (error) {
    mostrarAlerta('Error de red al eliminar la reserva.', 'danger');
  }
};

// ============================================================================
// IMPORTACIÓN CSV
// ============================================================================

$('btnImportarCsv').addEventListener('click', () => {
  $('formImportar').reset();
  $('resultadoImportacion').classList.add('hidden');
  $('modalImportarError').classList.add('hidden');
  abrirModal('modalImportar');
});

$('formImportar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = $('archivoCsv');
  const errBox = $('modalImportarError');
  const resBox = $('resultadoImportacion');
  errBox.classList.add('hidden');
  resBox.classList.add('hidden');

  if (!fileInput.files || fileInput.files.length === 0) {
    errBox.textContent = 'Seleccione un archivo .csv';
    errBox.classList.remove('hidden');
    return;
  }

  const formData = new FormData();
  formData.append('archivo', fileInput.files[0]);

  try {
    const res = await fetch('/api/reservas/importar', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      errBox.innerHTML = parsearErrorApi(data);
      errBox.classList.remove('hidden');
      return;
    }

    const { total, creadas, fallidas, errores } = data.data;
    let html = `<strong>Resultado:</strong> ${creadas} creadas, ${fallidas} con error (Total procesadas: ${total}).`;
    if (errores && errores.length > 0) {
      html += '<ul style="margin-top:0.4rem; padding-left:1.2rem;">';
      errores.forEach((err) => {
        html += `<li>Fila ${err.fila}: <strong>${err.code}</strong> - ${err.message}</li>`;
      });
      html += '</ul>';
    }
    resBox.innerHTML = html;
    resBox.classList.remove('hidden');

    if (creadas > 0) {
      cargarReservas();
      mostrarAlerta(`Se importaron ${creadas} reservas correctamente.`);
    }
  } catch (error) {
    errBox.textContent = 'Error al subir el archivo.';
    errBox.classList.remove('hidden');
  }
});

// ============================================================================
// TIEMPO REAL (SOCKET.IO)
// ============================================================================

const socket = io();

socket.on('connect', () => {
  $('estadoConexion').className = 'status-indicator conectado';
  $('textoConexion').textContent = 'Conectado';
});

socket.on('disconnect', () => {
  $('estadoConexion').className = 'status-indicator desconectado';
  $('textoConexion').textContent = 'Desconectado';
});

const EVENTOS = [
  'sala:creada',
  'sala:actualizada',
  'sala:eliminada',
  'reserva:creada',
  'reserva:actualizada',
  'reserva:cancelada',
  'reserva:eliminada',
  'reservas:importadas',
];

const claseEvento = (ev) => {
  if (ev.includes('creada') || ev.includes('importadas')) return 'event-created';
  if (ev.includes('cancelada')) return 'event-cancelled';
  if (ev.includes('eliminada')) return 'event-deleted';
  return 'event-updated';
};

const registrarEventoUi = (mensaje) => {
  const { evento, datos, timestamp } = mensaje;
  const lista = $('listaEventos');
  const li = document.createElement('li');
  li.className = `event-card ${claseEvento(evento)}`;

  const hora = timestamp ? timestamp.slice(11, 19) : new Date().toLocaleTimeString();

  let descripcion = '';
  if (evento.startsWith('reserva:')) {
    descripcion = datos?.responsable ? `Reserva #${datos.id} (${datos.responsable})` : `Reserva #${datos.id}`;
  } else if (evento.startsWith('sala:')) {
    descripcion = datos?.nombre ? `Sala: ${datos.nombre}` : `Sala #${datos.id}`;
  } else if (evento === 'reservas:importadas') {
    descripcion = `${datos.creadas} reservas importadas`;
  }

  li.innerHTML = `
    <div class="event-top">
      <span class="event-name">${evento}</span>
      <span class="event-time">${hora}</span>
    </div>
    <div class="event-body">${descripcion}</div>
  `;

  lista.prepend(li);

  while (lista.children.length > 20) {
    lista.removeChild(lista.lastChild);
  }
};

EVENTOS.forEach((nombre) => {
  socket.on(nombre, (mensaje) => {
    registrarEventoUi(mensaje);
    if (nombre.startsWith('sala:')) {
      cargarSalas();
    } else {
      cargarReservas();
    }
  });
});

$('btnLimpiarEventos').addEventListener('click', () => {
  $('listaEventos').replaceChildren();
});

// Inicializar datos al cargar la página
cargarSalas();
cargarReservas();
