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
    // Simulando una URL de API que acepta parámetros para cargar partidos
    // En un caso real, esta URL debería ser ajustada a tus necesidades específicas.
    const url = `api.php?action=cargarPartidos&temporada=${temporada}&deporte=${deporte}&torneo=${torneo}&categoria=${categoria}&serie=${serie}`;

    fetch(url)
        .then(response => response.json())
        .then(partidos => {
            const resultadosPartidos = document.getElementById('resultadosPartidos');
            resultadosPartidos.innerHTML = ''; // Limpiar resultados previos

            const table = document.createElement('table');
            table.className = 'results-table';

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Fecha', 'Cancha', 'Locatario', 'Visitante'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            partidos.forEach(partido => {
                const tr = document.createElement('tr');

                // Suponiendo que el objeto partido tiene propiedades que coinciden con estos nombres
                // Modifica según la estructura real de tus datos
                ['Fecha', 'Cancha', 'Locatario', 'Visitante'].forEach(prop => {
                    const td = document.createElement('td');
                    td.textContent = partido[prop];
                    tr.appendChild(td);
                });

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