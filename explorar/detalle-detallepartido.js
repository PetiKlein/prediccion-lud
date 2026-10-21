document.addEventListener('DOMContentLoaded', async function() {
    const params = new URLSearchParams(window.location.search);
    const idPartido = params.get('id');

    if (idPartido) {
        try {
            await cargarDetallesPartido(idPartido);
            await esperar(50); // Esperar 500ms
            await cargarJueces(idPartido);
            await esperar(30); // Esperar 500ms
            await cargarTitularesLocatario(idPartido);
            await esperar(30); // Esperar 500ms
            await cargarCambiosLocatario(idPartido);
            await esperar(30); // Esperar 500ms
            await cargarGolesLocatario(idPartido);
            await esperar(30);
            await cargarExpulsadosLocatario(idPartido);
            await esperar(30);
            await cargarAmonestadosLocatario(idPartido);
            await esperar(30); // Esperar 500ms
            await cargarTitularesVisitante(idPartido);
            await esperar(30); // Esperar 500ms
            await cargarCambiosVisitante(idPartido);
            await esperar(30); // Esperar 500ms
            await cargarGolesVisitante(idPartido);
            await esperar(30);
            await cargarExpulsadosVisitante(idPartido);
            await esperar(30);
            await cargarAmonestadosVisitante(idPartido);

        } catch (error) {
            console.error('Error al cargar los datos del partido:', error);
        }
    } else {
        document.getElementById('detallePartido').innerHTML = '<p>Error: No se proporcionó el ID del partido.</p>';
    }
});

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function cargarDetallesPartido(idPartido) {
    const response = await fetch(`api.php?action=cargarDetallesPartido&id=${idPartido}`);
    
    if (!response.ok) {
        throw new Error('Respuesta de red no fue ok.');
    }
    const partido = await response.json();

    if (!partido || partido.error) {
        document.getElementById('detallePartido').innerHTML = `<p>Error: ${partido.error || 'No se pueden cargar los detalles del partido'}</p>`;
    } else {
        const partidoData = partido[0];
        const detallesHTML = `
            <div class="partido-info">
                <div class="equipo local">
                    <div class="nombre-equipo">${partidoData.Locatario} (${partidoData.goles_locatario})</div>
                </div>
                <div class="resultado">
                    <div class="resultado-marcador">  </div>
                     </div>
                <div class="equipo visitante">
                    <div class="nombre-equipo">${partidoData.Visitante} (${partidoData.goles_visitante})</div>
                </div>
            </div> 
            <p class="centrado"><strong>Fecha:</strong> ${partidoData.Fecha_Inicio}, <strong>Cancha:</strong> ${partidoData.Cancha}</p>
            <p class="centrado"><strong>Torneo:</strong> ${partidoData.categoria}, <strong>Rueda:</strong> ${partidoData.rueda}, <strong>Divisional:</strong> ${partidoData.Divisional}</p>`
            ;

        document.getElementById('detallePartido').innerHTML = detallesHTML;
    }
}


async function cargarJueces(idPartido) {
    // Lógica para cargar los jueces
    fetch(`api.php?action=jueces&id=${idPartido}`)
    .then(response => response.json())
    .then(dataJueces => {
        let juecesHTML = '<h3>Jueces</h3>';
        if (dataJueces.error) {
            juecesHTML += `<p>${dataJueces.error}</p>`;
        } else {
            juecesHTML += '<ul>';
            dataJueces.forEach(juez => {
                juecesHTML += `<li>${juez.Cargo}: ${juez.Nombre}</li>`;
            });
            juecesHTML += '</ul>';
        }

        // Agregar los jueces al DOM
        document.getElementById('detallePartido').innerHTML += juecesHTML;
    })
    .catch(error => {
        console.error('Error al cargar los jueces:', error);
    })
}

async function cargarTitularesLocatario(idPartido) {
    // Lógica para cargar los titulares del equipo locatario
    fetch(`api.php?action=Titulares%20Locatario&id=${idPartido}`)
    .then(response => response.json())
    .then(dataTitulares => {
        let titularesHTML = '';
        if (dataTitulares.error) {
            titularesHTML += `<p>${dataTitulares.error}</p>`;
        } else {
            titularesHTML += '<table><tr><th>Titulares Locatario</th></tr>';
            dataTitulares.forEach(jugador => {
                // Añade la marca de capitán (C) si es necesario
                const marcaCapitan = jugador.Capitan ? ' ' + jugador.Capitan : '';
                titularesHTML += `<tr><td>${jugador.Nombre}${marcaCapitan} (${jugador.camiseta})</td></tr>`;
            });
            titularesHTML += '</table>';
        }

        document.getElementById('detallePartido').innerHTML += titularesHTML;
    })
    .catch(error => {
        console.error('Error al cargar los titulares locatario:', error);
    })
}

async function cargarCambiosLocatario(idPartido) {
    try {
    const response = await fetch(`api.php?action=CambiosLocatario&id=${idPartido}`);
    if (!response.ok) {
        throw new Error('Respuesta de red no fue ok.');
    }
    const dataCambios = await response.json();
    let cambiosHTML = '<div class="cambios-locatario"><h3>Cambios Locatario</h3><ul>';

    if (!dataCambios || dataCambios.error) {
        cambiosHTML += '<li>No se registraron cambios del locatario.</li>';
    } else {
        dataCambios.forEach(cambio => {
            cambiosHTML += `
                <li class="cambio">
                    <img src="sale.png" alt="Sale" class="icono-sale">
                    <span class="nombre-jugador">${cambio.Jug_Sale}</span>
                    <span class="minutos">${cambio.minutos}'</span>
                    <img src="entra.png" alt="Entra" class="icono-entra">
                    <span class="nombre-jugador">${cambio.Jug_Entra}</span>
                </li>`;
        });
    }
    cambiosHTML += '</ul></div>';
    document.getElementById('detallePartido').innerHTML += cambiosHTML;
    } catch (error) {
        console.error('Error al cargar los goles locatario:', error);
        // Considera mostrar un mensaje de error específico en el DOM o simplemente continuar.
    }
}

async function cargarGolesLocatario(idPartido) {
    try {
        const response = await fetch(`api.php?action=GolesLocatario&id=${idPartido}`);
        if (!response.ok) {
            throw new Error('Respuesta de red no fue ok.');
        }
        const dataGoles = await response.json();
        
        let golesHTML = '<div class="goles-locatario"><h3>Goles Locatario</h3><ul>';
        if (dataGoles.length === 0) {
            golesHTML += '<li>No se registraron goles para el equipo locatario.</li>';
        } else {
            dataGoles.forEach(gol => {
                golesHTML += `
                    <li class="gol">
                        <img src="gol.png" alt="Gol" class="icono-gol">
                        <span class="nombre-jugador">${gol.Nombre}</span>
                        <span class="minutos">${gol.minutos}'</span>
                    </li>`;
            });
        }
        golesHTML += '</ul></div>';
        document.getElementById('detallePartido').innerHTML += golesHTML;
    } catch (error) {
        console.error('Error al cargar los goles locatario:', error);
        // Considera mostrar un mensaje de error específico en el DOM o simplemente continuar.
    }
}

async function cargarTitularesVisitante(idPartido) {
    // Lógica para cargar los titulares del equipo locatario
    fetch(`api.php?action=Titulares%20Visitante&id=${idPartido}`)
    .then(response => response.json())
    .then(dataTitulares => {
        let titularesHTML = '';
        if (dataTitulares.error) {
            titularesHTML += `<p>${dataTitulares.error}</p>`;
        } else {
            titularesHTML += '<table><tr><th>Titulares Visitante</th></tr>';
            dataTitulares.forEach(jugador => {
                // Añade la marca de capitán (C) si es necesario
                const marcaCapitan = jugador.Capitan ? ' ' + jugador.Capitan : '';
                titularesHTML += `<tr><td>${jugador.Nombre}${marcaCapitan} (${jugador.camiseta})</td></tr>`;
            });
            titularesHTML += '</table>';
        }

        document.getElementById('detallePartido').innerHTML += titularesHTML;
    })
    .catch(error => {
        console.error('Error al cargar los titulares visitantes:', error);
    })
}

async function cargarCambiosVisitante(idPartido) {
    const response = await fetch(`api.php?action=CambiosVisitante&id=${idPartido}`);
    if (!response.ok) {
        throw new Error('Respuesta de red no fue ok.');
    }
    const dataCambios = await response.json();
    let cambiosHTML = '<div class="cambios-visitante"><h3>Cambios Visitante</h3><ul>';

    if (!dataCambios || dataCambios.error) {
        cambiosHTML += '<li>No se registraron cambios del visitante.</li>';
    } else {
        dataCambios.forEach(cambio => {
            cambiosHTML += `
                <li class="cambio">
                    <img src="sale.png" alt="Sale" class="icono-sale">
                    <span class="nombre-jugador">${cambio.Jug_Sale}</span>
                    <span class="minutos">${cambio.minutos}'</span>
                    <img src="entra.png" alt="Entra" class="icono-entra">
                    <span class="nombre-jugador">${cambio.Jug_Entra}</span>
                </li>`;
        });
    }
    cambiosHTML += '</ul></div>';
    document.getElementById('detallePartido').innerHTML += cambiosHTML;
}

async function cargarGolesVisitante(idPartido) {
    try {
        const response = await fetch(`api.php?action=GolesVisitante&id=${idPartido}`);
        if (!response.ok) {
            throw new Error('Respuesta de red no fue ok.');
        }
        const dataGoles = await response.json();
        
        let golesHTML = '<div class="goles-visitante"><h3>Goles Visitante</h3><ul>';
        if (dataGoles.length === 0) {
            golesHTML += '<li>No se registraron goles para el equipo visitante.</li>';
        } else {
            dataGoles.forEach(gol => {
                golesHTML += `
                    <li class="gol">
                        <img src="gol.png" alt="Gol" class="icono-gol">
                        <span class="nombre-jugador">${gol.Nombre}</span>
                        <span class="minutos">${gol.minutos}'</span>
                    </li>`;
            });
        }
        golesHTML += '</ul></div>';
        document.getElementById('detallePartido').innerHTML += golesHTML;
    } catch (error) {
        console.error('Error al cargar los goles visitante:', error);
        // Considera mostrar un mensaje de error específico en el DOM o simplemente continuar.
    }
}

async function cargarExpulsadosLocatario(idPartido) {
    const response = await fetch(`api.php?action=Expulsados%20Locatario&id=${idPartido}`);
    if (!response.ok) {
        throw new Error('Respuesta de red no fue ok.');
    }
    const dataExpulsados = await response.json();
    let expulsadosHTML = '<div class="expulsados-locatario"><h3>Expulsados Locatario</h3><ul>';
    
    if (!dataExpulsados || dataExpulsados.error) {
        expulsadosHTML += '<li>No se encontrados expulsados del locatario.</li>';
    } else {
        dataExpulsados.forEach(expulsado => {
            expulsadosHTML += `
                <li>
                    <img src="roja.png" alt="Gol" class="icono-roja">
                    <span class="nombre-jugador">${expulsado.Nombre}</span>
                    <span class="observaciones">${expulsado.observaciones}</span>
                </li>`;
        });
    }
    expulsadosHTML += '</ul></div>';
    document.getElementById('detallePartido').innerHTML += expulsadosHTML;
}

async function cargarExpulsadosVisitante(idPartido) {
    const response = await fetch(`api.php?action=Expulsados%20Visitante&id=${idPartido}`);
    if (!response.ok) {
        throw new Error('Respuesta de red no fue ok.');
    }
    const dataExpulsados = await response.json();
    let expulsadosHTML = '<div class="expulsados-visitante"><h3>Expulsados Visitante</h3><ul>';
    
    if (!dataExpulsados || dataExpulsados.error) {
        expulsadosHTML += '<li>No se encontrados expulsados del visitante.</li>';
    } else {
        dataExpulsados.forEach(expulsado => {
            expulsadosHTML += `
                <li>
                    <img src="roja.png" alt="Gol" class="icono-roja">
                    <span class="nombre-jugador">${expulsado.Nombre}</span>
                    <span class="observaciones">${expulsado.observaciones}</span>
                </li>`;
        });
    }
    expulsadosHTML += '</ul></div>';
    document.getElementById('detallePartido').innerHTML += expulsadosHTML;
}

async function cargarAmonestadosLocatario(idPartido) {
    const response = await fetch(`api.php?action=Amonestados%20Locatario&id=${idPartido}`);
    if (!response.ok) {
        throw new Error('Respuesta de red no fue ok.');
    }
    const dataAmonestados = await response.json();
    let amonestadosHTML = '<div class="expulsados-locatario"><h3>Amonestados Locatario</h3><ul>';
    
    if (!dataAmonestados || dataAmonestados.error) {
        amonestadosHTML += '<li>No se encontraron amonestados del locatario.</li>';
    } else {
        dataAmonestados.forEach(amonestado => {
            amonestadosHTML += `
                <li>
                    <img src="amarilla.png" alt="Amarilla" class="icono-amarilla">
                    <span class="nombre-jugador">${amonestado.Nombre}</span>
                </li>`;
        });
    }
    amonestadosHTML += '</ul></div>';
    document.getElementById('detallePartido').innerHTML += amonestadosHTML;
}

async function cargarAmonestadosVisitante(idPartido) {
    const response = await fetch(`api.php?action=Amonestados%20Visitante&id=${idPartido}`);
    if (!response.ok) {
        throw new Error('Respuesta de red no fue ok.');
    }
    const dataAmonestados = await response.json();
    let amonestadosHTML = '<div class="expulsados-visitante"><h3>Amonestados Visitante</h3><ul>';
    
    if (!dataAmonestados || dataAmonestados.error) {
        amonestadosHTML += '<li>No se encontraron amonestados del visitante.</li>';
    } else {
        dataAmonestados.forEach(amonestado => {
            amonestadosHTML += `
                <li>
                    <img src="amarilla.png" alt="Amarilla" class="icono-amarilla">
                    <span class="nombre-jugador">${amonestado.Nombre}</span>
                </li>`;
        });
    }
    amonestadosHTML += '</ul></div>';
    document.getElementById('detallePartido').innerHTML += amonestadosHTML;
}



