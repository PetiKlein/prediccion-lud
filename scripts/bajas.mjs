// Calcula los minutos de cada jugador en cada partido de Mayores A y marca posibles bajas
// para la próxima fecha. Lee data/partidos/*.json (los baja detalle.mjs) y escribe:
//   data/minutos.json  -> por jugador: equipo, partidos, titularidades, minutos, goles
//   data/bajas.json    -> por equipo: alertas mirando su último partido
// Ojo: en la LUD hay reingresos (un jugador puede salir y volver), así que un cambio
// temprano no siempre es lesión. Por eso las alertas son "posibles", con un nivel.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { corto } from './lud.mjs';

const DIR = new URL('../data/', import.meta.url);
const partidos = readdirSync(new URL('partidos/', DIR))
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(new URL(`partidos/${f}`, DIR))))
  .filter(p => p.titularesL.length && p.titularesV.length) // sin planilla cargada no sirve
  .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));

const norm = s => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const nombreLindo = s => norm(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());

let erroresPlanilla = 0;

// Minutos de un equipo en un partido. Devuelve { carne: {titular, minutos, entradas, salidas, sale, goles, expulsado} }
function minutosDeEquipo(titulares, cambios, goles, expulsados) {
  const fin = Math.max(90, ...cambios.map(c => Number(c.minutos) || 0));
  const j = {};
  const get = (carne, nombre) => (j[carne] ??= { nombre: norm(nombre), titular: false, minutos: 0, desde: null, salidas: [], entradas: [], goles: 0, expulsado: false });
  for (const t of titulares) { const x = get(t.carne, t.Nombre); x.titular = true; x.desde = 0; }
  for (const c of [...cambios].sort((a, b) => Number(a.minutos) - Number(b.minutos))) {
    const m = Number(c.minutos) || 0;
    const sale = get(c.CarneSale, c.Jug_Sale);
    // Una salida de alguien que no estaba en cancha es un error de planilla: no se cuenta.
    if (sale.desde != null) { sale.minutos += m - sale.desde; sale.desde = null; sale.salidas.push(m); }
    else erroresPlanilla++;
    const entra = get(c.CarneEntra, c.Jug_Entra);
    if (entra.desde == null) entra.desde = m;
    entra.entradas.push(m);
  }
  for (const x of Object.values(j)) if (x.desde != null) { x.minutos += fin - x.desde; x.desde = null; }
  for (const g of goles) if (g.EnContra !== '1' && j[g.carne]) j[g.carne].goles++;
  // Los expulsados vienen solo con nombre y sin minuto: se marcan, los minutos quedan como estaban.
  for (const e of expulsados) {
    const x = Object.values(j).find(v => v.nombre === norm(e.Nombre));
    if (x) x.expulsado = true;
  }
  // Se fue y no volvió: minuto de su última salida, si después no reingresó.
  for (const x of Object.values(j)) {
    const ultSal = x.salidas.at(-1), ultEnt = x.entradas.at(-1);
    x.sale = ultSal != null && (ultEnt == null || ultEnt <= ultSal) ? ultSal : null;
    delete x.desde;
  }
  return j;
}

// Historial por equipo: lista ordenada de { partido, rival, gf, gc, jugadores }
const equipos = {};
for (const p of partidos) {
  for (const lado of ['L', 'V']) {
    const yo = corto(lado === 'L' ? p.local : p.visitante);
    const rival = corto(lado === 'L' ? p.visitante : p.local);
    const jugadores = minutosDeEquipo(p[`titulares${lado}`], p[`cambios${lado}`], p[`goles${lado}`], p[`expulsados${lado}`]);
    (equipos[yo] ??= []).push({
      id: p.id, serie: p.serie, fecha: p.fecha, dia: p.fechaHora.slice(0, 10), rival,
      gf: lado === 'L' ? p.gl : p.gv, gc: lado === 'L' ? p.gv : p.gl, local: lado === 'L', jugadores,
    });
  }
}

// Totales por jugador (minutos.json)
const minutos = {};
for (const [equipo, lista] of Object.entries(equipos)) {
  for (const pt of lista) for (const [carne, x] of Object.entries(pt.jugadores)) {
    const t = (minutos[carne] ??= { nombre: nombreLindo(x.nombre), equipo, pj: 0, titular: 0, minutos: 0, goles: 0, expulsiones: 0 });
    t.equipo = equipo; t.nombre = nombreLindo(x.nombre);
    t.pj++; t.titular += x.titular ? 1 : 0; t.minutos += x.minutos; t.goles += x.goles; t.expulsiones += x.expulsado ? 1 : 0;
  }
}

// Alertas por equipo, mirando su último partido jugado.
const bajas = {};
for (const [equipo, lista] of Object.entries(equipos)) {
  const n = lista.length, ult = lista[n - 1], ant = lista[n - 2];
  const previos = lista.slice(0, -1);
  const alertas = [];
  const ya = new Set();
  const add = (carne, a) => { if (ya.has(carne)) return; ya.add(carne); alertas.push({ carne, nombre: minutos[carne].nombre, ...a }); };

  // Habituales: titulares en al menos 60% de los partidos previos (mínimo 3 titularidades)
  // y que jugaron alguno de los 3 partidos anteriores al último (si no, ya es una baja vieja).
  const titularidades = {};
  for (const pt of previos) for (const [c, x] of Object.entries(pt.jugadores)) if (x.titular) titularidades[c] = (titularidades[c] || 0) + 1;
  const habituales = Object.entries(titularidades)
    .filter(([c, k]) => k >= 3 && k / previos.length >= 0.6)
    .map(([c]) => c);

  // 1) Expulsado en el último partido.
  for (const [c, x] of Object.entries(ult.jugadores)) if (x.expulsado)
    add(c, { tipo: 'expulsado', nivel: 'alta', texto: `Expulsado contra ${ult.rival}. Probable suspensión (ver Fallos y Penas el jueves).` });

  // 2) Habitual que no jugó el último partido.
  for (const c of habituales) {
    if (ult.jugadores[c]) continue;
    let seguidos = 0;
    for (let i = n - 1; i >= 0 && !lista[i].jugadores[c]; i--) seguidos++;
    const ultJugado = [...lista].reverse().find(pt => pt.jugadores[c]);
    const x = ultJugado?.jugadores[c];
    const salioTemprano = x && x.sale != null && x.sale < 60;
    if (seguidos > 3) continue; // ausencia muy larga: ya no es noticia de esta fecha
    if (x?.expulsado) {
      add(c, { tipo: 'suspendido', nivel: 'alta', partidosSinJugar: seguidos,
        texto: `Expulsado contra ${ultJugado.rival}; ${seguidos === 1 ? 'no jugó el partido siguiente' : `lleva ${seguidos} partidos sin jugar`}. Probable suspensión.` });
      continue;
    }
    let texto = seguidos === 1 ? `Titular habitual, no jugó contra ${ult.rival}.` : `Titular habitual, lleva ${seguidos} partidos sin jugar.`;
    if (salioTemprano) texto += ` En su último partido (vs ${ultJugado.rival}) salió a los ${x.sale}'.`;
    add(c, { tipo: 'no-jugo', nivel: salioTemprano || seguidos >= 2 ? 'alta' : 'media', partidosSinJugar: seguidos, texto });
  }

  // 3) Salió temprano en el último partido y no volvió a entrar.
  for (const [c, x] of Object.entries(ult.jugadores)) {
    if (x.sale == null) continue;
    if (x.titular && x.sale < 45)
      add(c, { tipo: 'salio-temprano', nivel: x.sale < 30 ? 'alta' : 'media', minuto: x.sale, texto: `Titular, salió a los ${x.sale}' contra ${ult.rival} y no volvió a entrar.` });
    else if (!x.titular && x.entradas.length && x.sale - x.entradas.at(-1) <= 20 && x.sale < 85)
      add(c, { tipo: 'entro-y-salio', nivel: 'baja', minuto: x.sale, texto: `Entró a los ${x.entradas.at(-1)}' y lo sacaron a los ${x.sale}' contra ${ult.rival}.` });
  }

  const orden = { alta: 0, media: 1, baja: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel] || a.nombre.localeCompare(b.nombre));
  bajas[equipo] = {
    ultimo: { fecha: ult.fecha, serie: ult.serie, dia: ult.dia, rival: ult.rival, gf: ult.gf, gc: ult.gc, local: ult.local },
    alertas,
  };
}

const ahora = new Date().toISOString();
writeFileSync(new URL('minutos.json', DIR), JSON.stringify({ actualizado: ahora, jugadores: minutos }, null, 1) + '\n');
writeFileSync(new URL('bajas.json', DIR), JSON.stringify({ actualizado: ahora, equipos: bajas }, null, 1) + '\n');

console.log(`Partidos con planilla: ${partidos.length}. Cambios descartados por errores de planilla: ${erroresPlanilla}.`);
for (const [e, b] of Object.entries(bajas).sort()) {
  console.log(`\n${e} (último: F${b.ultimo.fecha} ${b.ultimo.serie} vs ${b.ultimo.rival} ${b.ultimo.gf}-${b.ultimo.gc})`);
  for (const a of b.alertas) console.log(`  [${a.nivel}] ${a.nombre}: ${a.texto}`);
  if (!b.alertas.length) console.log('  sin alertas');
}
