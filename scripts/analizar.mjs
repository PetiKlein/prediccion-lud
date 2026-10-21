// Lee las planillas de data/partidos/<categoria>/ (las baja detalle.mjs), las revisa,
// calcula los minutos de cada jugador y marca posibles bajas para la próxima fecha.
// Escribe datos/data/<categoria>.json, que es lo que usa la web (datos/index.html).
//
// Reglas de la LUD que importan acá:
//  - Hay reingresos: un jugador puede salir y volver a entrar.
//  - No hay acumulación de amarillas (y la Liga tampoco carga las amonestaciones).
//  - Los expulsados vienen con nombre pero sin minuto: sus minutos pueden quedar de más.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { corto } from './lud.mjs';
import { CATEGORIAS } from './categorias.mjs';

const RAIZ = new URL('../', import.meta.url);
const OUT = new URL('datos/data/', RAIZ);
mkdirSync(OUT, { recursive: true });

const norm = s => (s || '').normalize('NFC').trim().toUpperCase().replace(/\s+/g, ' ');
const lindo = s => norm(s).toLowerCase().replace(/(^|[\s'-])(\S)/g, (m, a, b) => a + b.toUpperCase());
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

// ---------- minutos de un equipo en un partido, con revisión de la planilla ----------
function analizarEquipo(p, lado, fin) {
  const titulares = p[`titulares${lado}`] || [];
  const cambios = p[`cambios${lado}`] || [];
  const problemas = [];
  const j = {};
  const get = (carne, nombre, camiseta) => {
    const x = (j[carne] ??= { carne, nombre: norm(nombre), camiseta: camiseta || '', titular: false, capitan: false, minutos: 0, desde: null, entradas: [], salidas: [], goles: [], expulsado: false });
    if (camiseta && !x.camiseta) x.camiseta = camiseta;
    return x;
  };

  if (titulares.length !== 11) problemas.push(`${titulares.length} titulares en la planilla (deberían ser 11).`);
  for (const t of titulares) {
    if (j[t.carne]) { problemas.push(`${lindo(t.Nombre)} figura dos veces entre los titulares.`); continue; }
    const x = get(t.carne, t.Nombre, t.camiseta);
    x.titular = true; x.capitan = !!t.Capitan?.trim(); x.desde = 0;
  }
  const ordenados = cambios.map((c, i) => ({ ...c, m: num(c.minutos), i }))
    .sort((a, b) => (a.m ?? 999) - (b.m ?? 999) || a.i - b.i);
  const eventos = [];
  const reemplazo = {}; // carné que salió -> carné que entró por él
  for (const c of ordenados) {
    if (c.m == null) { problemas.push(`Cambio sin minuto: sale ${lindo(c.Jug_Sale)}, entra ${lindo(c.Jug_Entra)}. No se tuvo en cuenta.`); continue; }
    if (c.CarneSale === c.CarneEntra) { problemas.push(`Cambio de ${lindo(c.Jug_Sale)} por sí mismo (${c.m}'). No se tuvo en cuenta.`); continue; }
    let sale = get(c.CarneSale, c.Jug_Sale);
    const entra = get(c.CarneEntra, c.Jug_Entra, c.camiseta);
    const entraOk = entra.desde == null;
    if (sale.desde == null) {
      // La planilla hace salir a alguien que ya había salido. Casi siempre el que sale de verdad es
      // quien había entrado por él (o el que entró por ese, si hubo una cadena de cambios).
      let cand = reemplazo[sale.carne], vistos = new Set();
      while (cand && j[cand].desde == null && !vistos.has(cand)) { vistos.add(cand); cand = reemplazo[cand]; }
      if (cand && j[cand].desde != null && cand !== entra.carne) {
        problemas.push(`A los ${c.m}' la planilla hace salir a ${lindo(c.Jug_Sale)}, que ya había salido. Se tomó como salida de ${lindo(j[cand].nombre)}, que había entrado por él.`);
        sale = j[cand];
      } else problemas.push(`A los ${c.m}' sale ${lindo(c.Jug_Sale)}, que no estaba en cancha. Esa salida no se contó.`);
    }
    const saleOk = sale.desde != null;
    if (saleOk) { sale.minutos += c.m - sale.desde; sale.desde = null; sale.salidas.push(c.m); }
    if (entraOk) { entra.desde = c.m; entra.entradas.push(c.m); if (saleOk) reemplazo[sale.carne] = entra.carne; }
    else problemas.push(`A los ${c.m}' entra ${lindo(c.Jug_Entra)}, que ya estaba en cancha. Esa entrada no se contó.`);
    eventos.push({ m: c.m, tipo: 'cambio', sale: saleOk ? sale.carne : null, entra: entraOk ? c.CarneEntra : null, saleN: saleOk ? lindo(sale.nombre) : lindo(c.Jug_Sale), entraN: lindo(c.Jug_Entra) });
    const enCancha = Object.values(j).filter(v => v.desde != null).length;
    if (enCancha > 11) problemas.push(`A los ${c.m}' quedan ${enCancha} jugadores en cancha según la planilla.`);
  }
  for (const x of Object.values(j)) if (x.desde != null) { x.minutos += fin - x.desde; x.desde = null; }

  // Expulsados: vienen sin carné ni minuto; se buscan por nombre. Si no jugó, lo echaron desde el banco.
  const expBanco = [];
  for (const e of p[`expulsados${lado}`] || []) {
    const x = Object.values(j).find(v => v.nombre === norm(e.Nombre));
    if (x) x.expulsado = true;
    else expBanco.push(norm(e.Nombre));
  }
  for (const x of Object.values(j)) {
    const ultSal = x.salidas.at(-1), ultEnt = x.entradas.at(-1);
    // Minuto en que se fue y no volvió (null si terminó en cancha).
    x.sale = ultSal != null && (ultEnt == null || ultEnt <= ultSal) ? ultSal : null;
    x.reingreso = x.salidas.length > 0 && x.entradas.some(e => e >= x.salidas[0]);
    delete x.desde;
  }
  return { jugadores: j, problemas, fin, eventos, expBanco };
}

// Goles: GolesLocatario lista cada gol del local (en las 152+151 planillas revisadas, la cantidad
// coincide siempre con el resultado). El campo EnContra de la Liga NO indica gol en contra: viene en 1
// en la mitad de los goles normales. Un gol en contra aparece con el carné de un jugador rival.
function asignarGoles(p, eq, problemas) {
  for (const lado of ['L', 'V']) {
    const otro = lado === 'L' ? 'V' : 'L';
    for (const g of p[`goles${lado}`] || []) {
      const m = num(g.minutos);
      const contra = !eq[lado].jugadores[g.carne] && !!eq[otro].jugadores[g.carne];
      const autor = eq[lado].jugadores[g.carne] || eq[otro].jugadores[g.carne];
      const ev = { m, tipo: contra ? 'gol-contra' : 'gol', lado, carne: g.carne, nombre: lindo(g.Nombre) };
      eq[lado].eventos.push(ev);
      if (!autor) { problemas.push(`Gol de ${lindo(g.Nombre)} (${m ?? '?'}'), que no figura en la planilla de ${lado === 'L' ? 'el local' : 'el visitante'}.`); continue; }
      if (!contra) autor.goles.push(m);
      // ¿Estaba en cancha a ese minuto?
      if (m != null && !contra) {
        const entro = autor.titular ? 0 : autor.entradas[0];
        let enCancha = entro != null && m >= entro;
        // Recorre salidas y reingresos.
        const tramos = [];
        let desde = autor.titular ? 0 : null;
        const ev2 = [...autor.salidas.map(x => [x, 's']), ...autor.entradas.map(x => [x, 'e'])].sort((a, b) => a[0] - b[0]);
        for (const [mm, t] of ev2) { if (t === 's' && desde != null) { tramos.push([desde, mm]); desde = null; } if (t === 'e' && desde == null) desde = mm; }
        if (desde != null) tramos.push([desde, 999]);
        enCancha = tramos.some(([a, b]) => m >= a && m <= b);
        if (!enCancha) problemas.push(`Gol de ${lindo(g.Nombre)} a los ${m}', cuando según los cambios no estaba en cancha.`);
      }
    }
  }
  const cuenta = lado => (p[`goles${lado}`] || []).length;
  const golesL = cuenta('L'), golesV = cuenta('V');
  if (golesL !== p.gl || golesV !== p.gv)
    problemas.push(`La planilla tiene ${golesL} gol${golesL === 1 ? '' : 'es'} del local y ${golesV} del visitante, pero el resultado es ${p.gl}-${p.gv}.`);
}

// ---------- alertas de bajas ----------
function alertasDeEquipo(equipo, lista, jugadores) {
  const n = lista.length, ult = lista[n - 1];
  const previos = lista.slice(0, -1);
  const alertas = [], ya = new Set();
  const add = (carne, a) => { if (ya.has(carne)) return; ya.add(carne); alertas.push({ carne, nombre: jugadores[carne]?.nombre ?? carne, ...a }); };

  // Habituales: titulares en al menos 60% de los partidos previos, con 3 titularidades o más.
  const tit = {};
  for (const pt of previos) for (const [c, x] of Object.entries(pt.jugadores)) if (x.titular) tit[c] = (tit[c] || 0) + 1;
  const habituales = Object.entries(tit).filter(([c, k]) => k >= 3 && k / previos.length >= 0.6).map(([c]) => c);

  for (const [c, x] of Object.entries(ult.jugadores)) if (x.expulsado)
    add(c, { tipo: 'expulsado', nivel: 'alta', texto: `Expulsado contra ${ult.rival}. Probable suspensión: revisá Fallos y Penas el jueves.` });
  for (const nombre of ult.expBanco || []) {
    const c = Object.keys(jugadores).find(k => jugadores[k].equipo === equipo && norm(jugadores[k].nombre) === nombre);
    if (c) add(c, { tipo: 'expulsado', nivel: 'alta', texto: `Expulsado desde el banco contra ${ult.rival}. Probable suspensión: revisá Fallos y Penas el jueves.` });
    else { ya.add(nombre); alertas.push({ carne: null, nombre: lindo(nombre), tipo: 'expulsado', nivel: 'alta', texto: `Expulsado desde el banco contra ${ult.rival} (no jugó ningún partido registrado). Probable suspensión.` }); }
  }

  for (const c of habituales) {
    if (ult.jugadores[c]) continue;
    let seguidos = 0;
    for (let i = n - 1; i >= 0 && !lista[i].jugadores[c]; i--) seguidos++;
    if (seguidos > 3) continue; // ausencia larga: ya no es noticia de esta fecha
    const ultJugado = [...lista].reverse().find(pt => pt.jugadores[c]);
    const x = ultJugado?.jugadores[c];
    if (x?.expulsado) {
      add(c, { tipo: 'suspendido', nivel: 'alta', sinJugar: seguidos,
        texto: `Expulsado contra ${ultJugado.rival}; ${seguidos === 1 ? 'no jugó el partido siguiente' : `lleva ${seguidos} partidos sin jugar`}. Probable suspensión.` });
      continue;
    }
    const salioTemprano = x && x.sale != null && x.sale < 60;
    let texto = seguidos === 1 ? `Titular habitual, no jugó contra ${ult.rival}.` : `Titular habitual, lleva ${seguidos} partidos sin jugar.`;
    if (salioTemprano) texto += ` En su último partido (vs ${ultJugado.rival}) salió a los ${x.sale}'.`;
    add(c, { tipo: salioTemprano ? 'lesion-probable' : 'no-jugo', nivel: salioTemprano || seguidos >= 2 ? 'alta' : 'media', sinJugar: seguidos, texto });
  }

  for (const [c, x] of Object.entries(ult.jugadores)) {
    if (x.sale == null) continue;
    if (x.titular && x.sale < 45)
      add(c, { tipo: 'salio-temprano', nivel: x.sale < 30 ? 'alta' : 'media', minuto: x.sale, texto: `Titular, salió a los ${x.sale}' contra ${ult.rival} y no volvió a entrar.` });
    else if (!x.titular && x.entradas.length && x.sale - x.entradas.at(-1) <= 20 && x.sale < ult.fin - 5)
      add(c, { tipo: 'entro-y-salio', nivel: 'baja', minuto: x.sale, texto: `Entró a los ${x.entradas.at(-1)}' y salió a los ${x.sale}' contra ${ult.rival}, sin volver.` });
  }
  const orden = { alta: 0, media: 1, baja: 2 };
  return alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel] || a.nombre.localeCompare(b.nombre));
}

// ---------- una categoría ----------
function procesar(cat) {
  const dir = new URL(`data/partidos/${cat.id}/`, RAIZ);
  if (!existsSync(dir)) { console.log(`${cat.nombre}: sin datos todavía.`); return; }
  const archivos = readdirSync(dir).filter(f => /^\d+\.json$/.test(f));
  const crudos = archivos.map(f => JSON.parse(readFileSync(new URL(f, dir))))
    .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora) || a.id.localeCompare(b.id));
  const proximosArch = new URL('_proximos.json', dir);
  const proximos = existsSync(proximosArch) ? JSON.parse(readFileSync(proximosArch)) : [];

  const calidad = [];
  const partidos = [];
  const porEquipo = {};
  const jugadores = {};
  const sinPlanilla = {}; // equipo -> partidos jugados sin planilla

  for (const p of crudos) {
    const local = corto(p.local), visitante = corto(p.visitante);
    const wo = p.detalle?.walk_over === '1';
    const base = { id: p.id, serie: p.serie, etapa: cat.series[p.serie], fecha: p.fecha, dia: p.fechaHora.slice(0, 10), hora: p.fechaHora.slice(11, 16),
      cancha: lindo(p.cancha || p.detalle?.Cancha || ''), local, visitante, gl: p.gl, gv: p.gv, wo, obs: p.detalle?.observaciones || '' };
    const conPlanilla = (p.titularesL?.length || 0) > 0 && (p.titularesV?.length || 0) > 0;
    if (!conPlanilla) {
      for (const [yo, rival] of [[local, visitante], [visitante, local]]) (sinPlanilla[yo] ??= []).push({ id: p.id, fecha: p.fecha, etapa: base.etapa, dia: base.dia, rival, wo });
      calidad.push({ id: p.id, partido: `${local} ${p.gl}-${p.gv} ${visitante}`, fecha: p.fecha, etapa: base.etapa,
        problemas: [wo ? 'Ganado por walkover: no hay planilla.' : 'La Liga no cargó la planilla de este partido.'] });
      partidos.push({ ...base, planilla: false });
      continue;
    }
    // El partido dura 90 o hasta el último cambio, lo mismo para los dos equipos.
    const fin = Math.max(cat.duracion ?? 90, ...[...p.cambiosL, ...p.cambiosV].map(c => num(c.minutos) ?? 0));
    const eq = { L: analizarEquipo(p, 'L', fin), V: analizarEquipo(p, 'V', fin) };
    const problemas = [...eq.L.problemas.map(t => `${local}: ${t}`), ...eq.V.problemas.map(t => `${visitante}: ${t}`)];
    const pg = [];
    asignarGoles(p, eq, pg);
    problemas.push(...pg);
    if (problemas.length) calidad.push({ id: p.id, partido: `${local} ${p.gl}-${p.gv} ${visitante}`, fecha: p.fecha, etapa: base.etapa, problemas });

    const lados = {};
    for (const lado of ['L', 'V']) {
      const yo = lado === 'L' ? local : visitante, rival = lado === 'L' ? visitante : local;
      const js = eq[lado].jugadores;
      for (const x of Object.values(js)) {
        const r = (jugadores[x.carne] ??= { nombre: lindo(x.nombre), equipo: yo, camiseta: x.camiseta });
        r.nombre = lindo(x.nombre); r.equipo = yo; if (x.camiseta) r.camiseta = x.camiseta;
      }
      lados[lado] = Object.values(js)
        .sort((a, b) => b.titular - a.titular || (a.entradas[0] ?? 0) - (b.entradas[0] ?? 0))
        .map(x => ({ c: x.carne, min: x.minutos, t: x.titular ? 1 : 0, cap: x.capitan ? 1 : 0, cam: x.camiseta, e: x.entradas, s: x.salidas, g: x.goles, x: x.expulsado ? 1 : 0 }));
      (porEquipo[yo] ??= []).push({ id: p.id, serie: p.serie, fecha: p.fecha, dia: base.dia, rival, gf: lado === 'L' ? p.gl : p.gv, gc: lado === 'L' ? p.gv : p.gl,
        local: lado === 'L', fin: eq[lado].fin, jugadores: js, expBanco: eq[lado].expBanco });
    }
    const eventos = [...eq.L.eventos.map(e => ({ ...e, lado: e.lado || 'L' })), ...eq.V.eventos.map(e => ({ ...e, lado: e.lado || 'V' }))]
      .sort((a, b) => (a.m ?? 999) - (b.m ?? 999));
    partidos.push({ ...base, planilla: true, fin: Math.max(eq.L.fin, eq.V.fin), L: lados.L, V: lados.V, eventos, problemas: problemas.length });
  }

  // Próximo partido de cada equipo.
  const ahora = new Date();
  const proximo = {};
  for (const f of proximos) {
    const k = new Date(f.fechaHora.replace(' ', 'T') + '-03:00');
    if (k < new Date(ahora.getTime() - 3 * 3600e3)) continue;
    for (const [yo, rival, esLocal] of [[corto(f.local), corto(f.visitante), true], [corto(f.visitante), corto(f.local), false]])
      if (!proximo[yo]) proximo[yo] = { rival, dia: f.fechaHora.slice(0, 10), hora: f.fechaHora.slice(11, 16), local: esLocal, cancha: lindo(f.cancha || ''), etapa: cat.series[f.serie] };
  }

  const bajas = {};
  for (const [equipo, lista] of Object.entries(porEquipo)) {
    const ult = lista.at(-1);
    bajas[equipo] = {
      ultimo: { id: ult.id, fecha: ult.fecha, etapa: cat.series[ult.serie], dia: ult.dia, rival: ult.rival, gf: ult.gf, gc: ult.gc, local: ult.local },
      proximo: proximo[equipo] || null,
      // Partidos jugados después del último con planilla: las alertas no los pueden ver.
      pendientes: (sinPlanilla[equipo] || []).filter(x => x.dia >= ult.dia && x.id !== ult.id && !x.wo),
      alertas: alertasDeEquipo(equipo, lista, jugadores),
    };
  }

  const salida = {
    id: cat.id, nombre: cat.nombre, actualizado: new Date().toISOString(),
    equipos: Object.keys(porEquipo).sort((a, b) => a.localeCompare(b)),
    jugadores, partidos, bajas, calidad,
    resumen: {
      partidos: partidos.length,
      conPlanilla: partidos.filter(p => p.planilla).length,
      conProblemas: calidad.length,
    },
  };
  // Si nada cambió desde la última vez, se conserva la fecha de actualización (y no hay commit).
  const archivo = new URL(`${cat.id}.json`, OUT);
  if (existsSync(archivo)) {
    const viejo = JSON.parse(readFileSync(archivo));
    const sinFecha = o => JSON.stringify({ ...o, actualizado: null });
    if (sinFecha(viejo) === sinFecha(salida)) salida.actualizado = viejo.actualizado;
  }
  writeFileSync(archivo, JSON.stringify(salida));
  return salida;
}

const indice = [];
for (const cat of CATEGORIAS) {
  const s = procesar(cat);
  if (!s) continue;
  indice.push({ id: s.id, nombre: s.nombre, actualizado: s.actualizado, ...s.resumen });
  console.log(`\n=== ${s.nombre}: ${s.resumen.partidos} partidos, ${s.resumen.conPlanilla} con planilla, ${s.resumen.conProblemas} con observaciones.`);
  for (const e of s.equipos) {
    const b = s.bajas[e];
    console.log(`${e} (último: F${b.ultimo.fecha} ${b.ultimo.etapa} vs ${b.ultimo.rival} ${b.ultimo.gf}-${b.ultimo.gc}${b.proximo ? `; próximo: vs ${b.proximo.rival} ${b.proximo.dia}` : ''})`);
    for (const a of b.alertas) console.log(`  [${a.nivel}] ${a.nombre}: ${a.texto}`);
  }
}
writeFileSync(new URL('indice.json', OUT), JSON.stringify(indice, null, 1) + '\n');
