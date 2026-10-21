document.addEventListener('DOMContentLoaded', function() {
    const configId = document.querySelector('meta[name="config-id"]').content;
    cargarConfiguracion(configId);
});

function cargarConfiguracion(configId) {
    fetch('../config/config.json')
        .then(response => response.json())
        .then(data => {
            const config = data.find(c => c.ID === configId);
            if (config) {   

                // Ahora llamamos a cargarPartidos directamente con los datos obtenidos
                cargarPartidos(config.Temporada, config.Deporte, config.Torneo, config.Categoria, config.Serie);
            }
        })
        .catch(error => console.error('Error:', error));
}

function convertDateFormat(datetimeStr) {
    // Se asume que datetimeStr tiene el formato "YYYY-MM-DD HH:MM:SS"
    const [datePart, timePart] = datetimeStr.split(' ');
    const [year, month, day] = datePart.split('-');
    // Recorta el tiempo a solo HH:MM y reformatea la fecha a DD-MM-YY
    return `${day}-${month} ${timePart.substring(0, 5)}`;
}


function cargarPartidos(temporada, deporte, torneo, categoria, serie) {
    const url = `api.php?action=cargarPartidos&temporada=${temporada}&deporte=${deporte}&torneo=${torneo}&categoria=${categoria}&serie=${serie}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            const resultadosPartidos = document.getElementById('resultadosPartidos');
            resultadosPartidos.innerHTML = ''; // Limpiar resultados previos

            const table = document.createElement('table');
            table.className = 'results-table';

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Día', 'Cancha', 'Local', 'G', 'Visitante', 'G'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            let currentFecha = '';

            data.forEach(partido => {
                if (partido.Fecha !== currentFecha) {
                    const fechaRow = document.createElement('tr');
                    const fechaCell = document.createElement('td');
                    fechaCell.setAttribute('colspan', 6);
                    fechaCell.textContent = `Fecha: ${partido.Fecha}`;
                    fechaRow.appendChild(fechaCell);
                    tbody.appendChild(fechaRow);
                    currentFecha = partido.Fecha;
                }

                const tr = document.createElement('tr');

                const horaCell = document.createElement('td');
                horaCell.textContent = convertDateFormat(partido.Fecha_Hora);
                tr.appendChild(horaCell);

                const canchaCell = document.createElement('td');
                canchaCell.textContent = partido.Cancha;
                tr.appendChild(canchaCell);

                const localCell = document.createElement('td');
                const localLink = document.createElement('a');
                localLink.href = `detallePartido.html?id=${partido.ID}`;
                localLink.textContent = partido.Locatario;
                localCell.appendChild(localLink);
                tr.appendChild(localCell);

                const golesLocalCell = document.createElement('td');
                golesLocalCell.textContent = partido.GL;
                tr.appendChild(golesLocalCell);

                const visitanteCell = document.createElement('td');
                const visitanteLink = document.createElement('a');
                visitanteLink.href = `detallePartido.html?id=${partido.ID}`;
                visitanteLink.textContent = partido.Visitante;
                visitanteCell.appendChild(visitanteLink);
                tr.appendChild(visitanteCell);

                const golesVisitanteCell = document.createElement('td');
                golesVisitanteCell.textContent = partido.GV;
                tr.appendChild(golesVisitanteCell);

                tbody.appendChild(tr);
            });

            table.appendChild(tbody);
            resultadosPartidos.appendChild(table);
        })
        .catch(error => {
            console.error('Error al cargar partidos:', error);
            alert("Hubo un error al cargar los partidos. Por favor, intenta de nuevo.");
        });
}

