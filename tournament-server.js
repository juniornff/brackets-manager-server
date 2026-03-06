const express = require('express');
const { BracketsManager } = require('brackets-manager');
const { JsonDatabase } = require('brackets-json-db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Configuración de la base de datos y manager
const storage = new JsonDatabase();
const verbose = false;
const manager = new BracketsManager(storage, verbose);
const USE_CUSTOM_PARTICIPANT_LOGIC = true;


// Middleware de logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, req.body || '');
    next();
});

// =============================================
// ENDPOINTS PRINCIPALES
// =============================================

// =============================================
// TORNEOS
// =============================================

// Crear un torneo / stage
app.post('/tournaments', async (req, res) => {
    try {
        console.log('📝 Creando nuevo torneo...');
        let stageData = req.body;

        // Validaciones básicas
        if (!stageData.name || !stageData.type) {
            return res.status(400).json({
                error: 'Nombre y tipo son requeridos'
            });
        }

        if (!['round_robin', 'single_elimination', 'double_elimination'].includes(stageData.type)) {
            return res.status(400).json({
                error: 'Tipo de torneo equivocado, debe ser: "round_robin", "single_elimination" o "double_elimination"'
            });
        }

        // Asignar tournamentId si no viene
        if (stageData.tournamentId == null) {
            stageData.tournamentId = 0;
            console.log('ℹ️  Asignando tournamentId por defecto: ', stageData.tournamentId);
        }
        const newTournamentId = stageData.tournamentId;

        // ------------------------------------------------------------
        // Lógica para manejar participantes (seeding / seedingIds)
        // ------------------------------------------------------------

        if (USE_CUSTOM_PARTICIPANT_LOGIC) {
            try {
                // Reemplazar en stageData: usar seedingIds y eliminar seeding
                stageData.seedingIds = await processSeeding(stageData, storage, newTournamentId);
                delete stageData.seeding;
                console.log('✅ Seeding preparado con IDs:', stageData.seedingIds);
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }
        } else {
            // Si no se usa la lógica, simplemente pasar los datos tal cual (se espera que stageData ya tenga seedingIds o seeding)
            console.log('ℹ️  Lógica de participantes desactivada, se usa stageData original');
        }
        // ------------------------------------------------------------

        // Crear Stage
        const newStage = await manager.create.stage(stageData);

        console.log('✅ Torneo creado exitosamente. ID:', newStage.id);
        res.status(201).json({
            message: 'Torneo creado exitosamente',
            tournamentId: stageData.tournamentId,
            stageId: newStage.id,
            stage: newStage
        });
    } catch (error) {
        console.error('❌ Error creando torneo:', error.message);
        res.status(500).json({
            error: 'Error creando torneo: ' + error.message
        });
    }
});

// Función auxiliar para procesar seeding
async function processSeeding(stageData, storage, newTournamentId) {
    let seedingIds = [];

    // Si viene seedingIds directamente, procesamos igual que antes
    if (stageData.seedingIds && Array.isArray(stageData.seedingIds)) {
        console.log('🔍 Usando seedingIds proporcionados:', stageData.seedingIds);
        for (const item of stageData.seedingIds) {
            // seedingIds puede contener números o null (BYE)
            if (item === null) {
                seedingIds.push(null);
                continue;
            }
            if (typeof item !== 'number' || isNaN(item)) {
                throw new Error(`Elemento inválido en seedingIds: ${item}. Debe ser número o null.`);
            }
            const pid = item;
            const participant = await storage.select('participant', pid);
            if (!participant) {
                throw new Error(`El participante con ID ${pid} no existe`);
            }
            // Actualizar tournament_id
            participant.tournament_id = newTournamentId;
            await storage.update('participant', pid, participant);
            seedingIds.push(pid);
        }
        return seedingIds;
    }

    // Si viene seeding (array de elementos variados)
    if (stageData.seeding && Array.isArray(stageData.seeding)) {
        console.log('🔍 Procesando seeding con tipos variados:', stageData.seeding);
        const allParticipants = await storage.select('participant') || [];

        for (const element of stageData.seeding) {
            // Caso 1: null (BYE)
            if (element === null) {
                seedingIds.push(null);
                console.log(`   BYE (null) agregado`);
                continue;
            }

            // Caso 2: número (ID)
            if (typeof element === 'number' && !isNaN(element)) {
                const pid = element;
                const participant = await storage.select('participant', pid);
                if (!participant) {
                    throw new Error(`El participante con ID ${pid} no existe`);
                }
                participant.tournament_id = newTournamentId;
                await storage.update('participant', pid, participant);
                seedingIds.push(pid);
                console.log(`   Participante por ID: ${participant.name} (ID: ${pid})`);
                continue;
            }

            // Caso 3: string (nombre)
            if (typeof element === 'string') {
                const name = element;
                const existing = allParticipants.find(p => p.name === name);
                if (existing) {
                    existing.tournament_id = newTournamentId;
                    await storage.update('participant', existing.id, existing);
                    seedingIds.push(existing.id);
                    console.log(`   Participante por nombre existente: ${name} (ID: ${existing.id})`);
                } else {
                    const newId = await storage.insert('participant', {
                        name: name,
                        tournament_id: newTournamentId
                    });
                    seedingIds.push(newId);
                    console.log(`   Nuevo participante por nombre: ${name} (ID: ${newId})`);
                }
                continue;
            }

            // Caso 4: objeto (participante)
            if (typeof element === 'object' && element !== null) {
                // Buscar por ID si tiene
                let participant = null;
                if (element.id !== undefined) {
                    participant = await storage.select('participant', element.id);
                }
                // Si no, buscar por nombre
                if (!participant && element.name) {
                    participant = allParticipants.find(p => p.name === element.name);
                }

                if (participant) {
                    // Actualizar existente
                    participant.tournament_id = newTournamentId;
                    // Actualizar otros campos si vienen en el objeto (excepto id)
                    for (const key in element) {
                        if (key !== 'id' && key !== 'tournament_id') {
                            participant[key] = element[key];
                        }
                    }
                    await storage.update('participant', participant.id, participant);
                    seedingIds.push(participant.id);
                    console.log(`   Participante existente actualizado: ${participant.name} (ID: ${participant.id})`);
                } else {
                    // Crear nuevo participante a partir del objeto
                    // Eliminar id si existe para que se genere uno nuevo
                    const { id, ...newData } = element;
                    newData.tournament_id = newTournamentId; // Asegurar tournament_id
                    const newId = await storage.insert('participant', newData);
                    seedingIds.push(newId);
                    console.log(`   Nuevo participante creado desde objeto: ${newData.name || 'sin nombre'} (ID: ${newId})`);
                }
                continue;
            }

            // Si llegamos aquí, el elemento no es válido
            throw new Error(`Elemento inválido en seeding: ${JSON.stringify(element)}`);
        }
        return seedingIds;
    }

    // Si no hay seeding ni seedingIds, error
    throw new Error('Se requiere seeding o seedingIds');
}

// Obtener lista de todos los torneos
app.get('/tournaments', async (req, res) => {
    try {
        console.log('📋 Obteniendo lista de torneos...');
        const stages = await storage.select('stage');

        console.log(`✅ Encontrados ${stages.length} torneos`);
        res.json({
            count: stages.length,
            tournaments: stages
        });
    } catch (error) {
        console.error('❌ Error obteniendo torneos:', error.message);
        res.status(500).json({
            error: 'Error obteniendo torneos: ' + error.message
        });
    }
});

// Obtener datos completos de un torneo
app.get('/tournaments/:id', async (req, res) => {
    try {
        const tournamentId = parseInt(req.params.id);
        console.log(`🎯 Obteniendo datos del torneo ID: ${tournamentId}`);

        // Obtener datos completos de un torneo
        const tournamentData = await manager.get.tournamentData(tournamentId);

        if (!tournamentData) {
            console.log('❌ Torneo no encontrado');
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        console.log('✅ Datos del torneo obtenidos exitosamente');
        res.json(tournamentData);
    } catch (error) {
        console.error('❌ Error obteniendo datos del torneo:', error.message);
        res.status(500).json({
            error: 'Error obteniendo datos del torneo: ' + error.message
        });
    }
});

// Eliminar un torneo
app.delete('/tournaments/:id', async (req, res) => {
    try {
        const tournamentId = parseInt(req.params.id);
        console.log(`🗑️  Eliminando torneo ID: ${tournamentId}`);

        // Verificar si existe
        const tournament = await storage.select('stage', {tournament_id: tournamentId});
        if (!tournament) {
            console.log('❌ Torneo no encontrado');
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        await manager.delete.tournament(tournamentId);

        console.log('✅ Torneo eliminado exitosamente');
        res.json({
            message: 'Torneo eliminado exitosamente',
            deletedTournamentId: tournamentId
        });
    } catch (error) {
        console.error('❌ Error eliminando torneo:', error.message);
        res.status(500).json({
            error: 'Error eliminando torneo: ' + error.message
        });
    }
});

// =============================================
// STAGES
// =============================================

// Obtener datos completos de un stage
app.get('/stages/:id', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`🎯 Obteniendo datos del torneo ID: ${stageId}`);

        // Obtener datos completos de un torneo
        const stageData = await manager.get.stageData(stageId);

        if (!stageData) {
            console.log('❌ Stage no encontrado');
            return res.status(404).json({ error: 'Stage no encontrado' });
        }

        console.log('✅ Datos del stage obtenidos exitosamente');
        res.json(stageData);
    } catch (error) {
        console.error('❌ Error obteniendo datos del torneo:', error.message);
        res.status(500).json({
            error: 'Error obteniendo datos del torneo: ' + error.message
        });
    }
});

// Eliminar un stage
app.delete('/stages/:id', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`🗑️  Eliminando torneo ID: ${stageId}`);

        // Verificar si existe
        const stage = await storage.select('stage', stageId);
        if (!stage) {
            console.log('❌ Stage no encontrado');
            return res.status(404).json({ error: 'Stage no encontrado' });
        }

        await manager.delete.stage(stageId);

        console.log('✅ Stage eliminado exitosamente');
        res.json({
            message: 'Stage eliminado exitosamente',
            deletedStageId: stageId
        });
    } catch (error) {
        console.error('❌ Error eliminando stage:', error.message);
        res.status(500).json({
            error: 'Error eliminando stage: ' + error.message
        });
    }
});

// =============================================
// PARTIDOS / MATCHES
// =============================================

// Obtener todos los partidos de un stage
app.get('/stages/:id/matches', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`📊 Obteniendo partidos del torneo ID: ${stageId}`);

        const stageData = await manager.get.stageData(stageId);

        if (!stageData) {
            return res.status(404).json({ error: 'Stage no encontrado' });
        }

        console.log(`✅ Obtenidos ${stageData.match.length} partidos`);
        res.json({
            stageId: stageId,
            matches: stageData.match,
            count: stageData.match.length
        });
    } catch (error) {
        console.error('❌ Error obteniendo partidos:', error.message);
        res.status(500).json({
            error: 'Error obteniendo partidos: ' + error.message
        });
    }
});

// Actualizar un partido
app.patch('/matches/:id', async (req, res) => {
    try {
        const matchId = parseInt(req.params.id);
        const matchData = req.body;

        console.log(`⚡ Actualizando partido ID: ${matchId}`, matchData);

        // Verificar si existe
        const match = await storage.select('match', matchId);
        if (!match) {
            console.log('❌ Partido no encontrado');
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        await manager.update.match({
            id: matchId,
            ...matchData
        });

        const updatedMatch = await storage.select('match', matchId);

        console.log('✅ Partido actualizado exitosamente');
        res.json({
            message: 'Partido actualizado exitosamente',
            match: updatedMatch
        });
    } catch (error) {
        console.error('❌ Error actualizando partido:', error.message);
        res.status(500).json({
            error: 'Error actualizando partido: ' + error.message
        });
    }
});

// Actualizar un juego hijo (match game) - Best-of-X
app.patch('/match-games/:id', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id);
        const gameData = req.body;

        console.log(`🎮 Actualizando juego hijo ID: ${gameId}`, gameData);

        // Verificar si existe
        const game = await storage.select('match_game', gameId);
        if (!game) {
            console.log('❌ Juego hijo no encontrado');
            return res.status(404).json({ error: 'Juego hijo no encontrado' });
        }

        await manager.update.matchGame({
            id: gameId,
            ...gameData
        });

        const updatedGame = await storage.select('match_game', gameId);

        console.log('✅ Juego hijo actualizado exitosamente');
        res.json({
            message: 'Juego hijo actualizado exitosamente',
            game: updatedGame
        });
    } catch (error) {
        console.error('❌ Error actualizando juego hijo:', error.message);
        res.status(500).json({
            error: 'Error actualizando juego hijo: ' + error.message
        });
    }
});

// Ajustar el número de juegos hijos (Best-of-X)
app.patch('/match-child-count', async (req, res) => {
    try {
        const { type, id, count } = req.body;

        console.log(`🔧 Ajustando número de juegos hijos para ${type} ID: ${id} a ${count}`);

        if (!type || !id || count === undefined) {
            return res.status(400).json({
                error: 'Tipo, ID y count son requeridos'
            });
        }

        if (!['stage', 'group', 'round', 'match'].includes(type)) {
            return res.status(400).json({
                error: 'Tipo debe ser: "stage", "group", "round" o "match"'
            });
        }

        await manager.update.matchChildCount(type, id, count);

        console.log('✅ Número de juegos hijos ajustado exitosamente');
        res.json({
            message: 'Número de juegos hijos ajustado exitosamente',
            type,
            id,
            count
        });
    } catch (error) {
        console.error('❌ Error ajustando número de juegos hijos:', error.message);
        res.status(500).json({
            error: 'Error ajustando número de juegos hijos: ' + error.message
        });
    }
});

// Obtener juegos hijos de un partido
app.get('/matches/:id/games', async (req, res) => {
    try {
        const matchId = parseInt(req.params.id);
        console.log(`🎮 Obteniendo juegos hijos del partido ID: ${matchId}`);

        // Primero obtener el match
        const match = await storage.select('match', matchId);
        if (!match) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        // Llamar a la función con un array que contiene el match
        const matchGames = await manager.get.matchGames([match]);

        console.log(`✅ ${matchGames.length} juegos hijos encontrados`);
        res.json({
            matchId: matchId,
            games: matchGames,
            count: matchGames.length
        });
    } catch (error) {
        console.error('❌ Error obteniendo juegos hijos:', error.message);
        res.status(500).json({
            error: 'Error obteniendo juegos hijos: ' + error.message
        });
    }
});

// Resetear resultados de un partido
app.post('/matches/:id/reset', async (req, res) => {
    try {
        const matchId = parseInt(req.params.id);
        console.log(`🔄 Reseteando resultados del partido ID: ${matchId}`);

        // Verificar si existe
        const match = await storage.select('match', matchId);
        if (!match) {
            console.log('❌ Partido no encontrado');
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        await manager.reset.matchResults(matchId);

        const resetMatch = await storage.select('match', matchId);

        console.log('✅ Resultados del partido reseteados exitosamente');
        res.json({
            message: 'Resultados del partido reseteados exitosamente',
            match: resetMatch
        });
    } catch (error) {
        console.error('❌ Error reseteando partido:', error.message);
        res.status(500).json({
            error: 'Error reseteando partido: ' + error.message
        });
    }
});

// Resetear resultados de un partido hijo (match game)
app.post('/match-games/:id/reset', async (req, res) => {
    try {
        const matchGameId = parseInt(req.params.id);
        console.log(`🔄 Reseteando resultados del partido ID: ${matchGameId}`);

        // Verificar si existe
        const matchGame = await storage.select('match_game', matchGameId);
        if (!matchGame) {
            console.log('❌ Partido hijo no encontrado');
            return res.status(404).json({ error: 'Partido hijo no encontrado' });
        }

        await manager.reset.matchGameResults(matchGameId);

        const resetMatch = await storage.select('match_game', matchGameId);

        console.log('✅ Resultados del partido reseteados exitosamente');
        res.json({
            message: 'Resultados del partido reseteados exitosamente',
            match: resetMatch
        });
    } catch (error) {
        console.error('❌ Error reseteando partido:', error.message);
        res.status(500).json({
            error: 'Error reseteando partido: ' + error.message
        });
    }
});

// Obtener partidos actuales (en progreso)
app.get('/stage/:id/current-matches', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`🎮 Obteniendo partidos actuales del stage ID: ${stageId}`);

        // Obtener el stage para verificar el tipo
        const stage = await storage.select('stage', stageId);
        if (!stage) {
            return res.status(404).json({ error: 'Stage no encontrado' });
        }

        let currentMatches = [];

        // Solo se permite para single elimination según la documentación https://drarig29.github.io/brackets-docs/user-guide/helpers/#:~:text=manager.get.currentMatches()%3A%20for%20single%20elimination%2C%20returns%20the%20matches%20that%20can%20currently%20be%20played%20in%20parallel%20(ready%20or%20running).%20For%20other%20stage%20types%2C%20this%20is%20not%20implemented%20yet.
        if (stage.type === 'single_elimination') {
            // Usar método de la librería
            currentMatches = await manager.get.currentMatches(stage.id);
        } else {
            // Para otros tipos, filtrar manualmente por estado Ready (2) y Running (3)
            const stageData = await manager.get.stageData(stageId);
            if (!stageData) {
                return res.status(404).json({ error: 'Datos del stage no encontrados' });
            }
            currentMatches = stageData.match.filter(match =>
                match.status === 2 || match.status === 3
            );
        }

        console.log(`✅ ${currentMatches.length} partidos actuales encontrados`);
        res.json({
            stageId: stage.id,
            stageType: stage.type,
            currentMatches: currentMatches,
            count: currentMatches.length
        });
    } catch (error) {
        console.error('❌ Error obteniendo partidos actuales:', error.message);
        res.status(500).json({
            error: 'Error obteniendo partidos actuales: ' + error.message
        });
    }
});

// =============================================
// SEEDING
// =============================================

// Obtener el seeding de un stage
app.get('/stages/:id/seeding', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`🌱 Obteniendo seeding del stage ID: ${stageId}`);

        // Verificar que el stage existe
        const stage = await storage.select('stage', stageId);
        if (!stage) {
            return res.status(404).json({ error: 'Stage no encontrado' });
        }

        const seeding = await manager.get.seeding(stageId);
        res.json({
            stageId: stageId,
            seeding: seeding
        });
    } catch (error) {
        console.error('❌ Error obteniendo seeding:', error.message);
        res.status(500).json({ error: 'Error obteniendo seeding: ' + error.message });
    }
});

// Actualizar seeding de un torneo
app.put('/tournaments/:id/update-seeding', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        const { seeding, keepSameSize } = req.body;

        console.log(`🔧 Actualizando seeding del torneo ID: ${stageId}`, { seeding, keepSameSize });

        if (!seeding || !Array.isArray(seeding)) {
            return res.status(400).json({
                error: 'Seeding debe ser un array'
            });
        }

        await manager.update.seeding(stageId, seeding, keepSameSize);

        console.log('✅ Seeding actualizado exitosamente');
        res.json({
            message: 'Seeding actualizado exitosamente',
            stageId: stageId
        });
    } catch (error) {
        console.error('❌ Error actualizando seeding:', error.message);
        res.status(500).json({
            error: 'Error actualizando seeding: ' + error.message
        });
    }
});

// Confirmar seeding de un torneo (convertir TBDs a BYEs)
app.post('/tournaments/:id/confirm-seeding', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`✅ Confirmando seeding del torneo ID: ${stageId}`);

        await manager.update.confirmSeeding(stageId);

        console.log('✅ Seeding confirmado exitosamente');
        res.json({
            message: 'Seeding confirmado exitosamente (TBDs convertidos a BYEs)',
            stageId: stageId
        });
    } catch (error) {
        console.error('❌ Error confirmando seeding:', error.message);
        res.status(500).json({
            error: 'Error confirmando seeding: ' + error.message
        });
    }
});

// Resetear seeding de un torneo (convertir seeding a TBDs)
app.post('/tournaments/:id/reset-seeding', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`🔄 Reseteando seeding del torneo ID: ${stageId}`);

        await manager.reset.seeding(stageId);

        console.log('✅ Seeding reseteado exitosamente');
        res.json({
            message: 'Seeding reseteado exitosamente (todos los oponentes establecidos como TBDs)',
            stageId: stageId
        });
    } catch (error) {
        console.error('❌ Error reseteando seeding:', error.message);
        res.status(500).json({
            error: 'Error reseteando seeding: ' + error.message
        });
    }
});

// =============================================
// ORDERING
// =============================================

// Actualizar el ordenamiento de un stage por completo
app.put('/tournaments/:id/ordering', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        const { ordering } = req.body;

        console.log(`🔧 Actualizando ordenamiento del torneo ID: ${stageId}`, ordering);

        if (!ordering) {
            return res.status(400).json({
                error: 'Ordering es requerido'
            });
        }

        await manager.update.ordering(stageId, ordering);

        console.log('✅ Ordering actualizado exitosamente');
        res.json({
            message: 'Ordering de la etapa actualizado exitosamente',
            stageId: stageId
        });
    } catch (error) {
        console.error('❌ Error actualizando ordering:', error.message);
        res.status(500).json({
            error: 'Error actualizando ordering: ' + error.message
        });
    }
});

// Actualizar el ordenamiento de una ronda específica
app.put('/rounds/:id/ordering', async (req, res) => {
    try {
        const roundId = parseInt(req.params.id);
        const { ordering } = req.body;

        console.log(`🔧 Actualizando ordenamiento de la ronda ID: ${roundId}`, ordering);

        if (!ordering) {
            return res.status(400).json({
                error: 'Ordering es requerido'
            });
        }

        await manager.update.roundOrdering(roundId, ordering);

        console.log('✅ Ordering de ronda actualizado exitosamente');
        res.json({
            message: 'Ordering de la ronda actualizado exitosamente',
            roundId: roundId
        });
    } catch (error) {
        console.error('❌ Error actualizando ordering de ronda:', error.message);
        res.status(500).json({
            error: 'Error actualizando ordering de ronda: ' + error.message
        });
    }
});

// =============================================
// PARTICIPANTES
// =============================================

// Crear un nuevo participante
app.post('/participants', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        // Insertar participante sin tournament_id (quedará como no asignado)
        const newId = await storage.insert('participant', { name });
        const newParticipant = await storage.select('participant', newId);
        if (!newParticipant) {
            // Esto no debería ocurrir, pero por si acaso
            return res.status(500).json({ error: 'No se pudo recuperar el participante creado' });
        }

        console.log(`✅ Participante creado: ${name} (ID: ${newId})`);
        res.status(201).json(newParticipant);
    } catch (error) {
        console.error('❌ Error creando participante:', error.message);
        res.status(500).json({ error: 'Error creando participante: ' + error.message });
    }
});

// Obtener un participante por ID
app.get('/participants/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const participant = await storage.select('participant', id);
        if (!participant) {
            return res.status(404).json({ error: 'Participante no encontrado' });
        }
        res.json(participant);
    } catch (error) {
        console.error('❌ Error obteniendo participante:', error.message);
        res.status(500).json({ error: 'Error obteniendo participante: ' + error.message });
    }
});

// Editar un participante (se espera objeto con al menos "name")
app.put('/participants/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updates = req.body;

        // Verificar que existe
        const existing = await storage.select('participant', id);
        if (!existing) {
            return res.status(404).json({ error: 'Participante no encontrado' });
        }

        // Actualizar solo los campos proporcionados (se puede enviar el objeto completo)
        const updated = { ...existing, ...updates };
        const success = await storage.update('participant', id, updated);
        if (!success) {
            return res.status(500).json({ error: 'No se pudo actualizar el participante' });
        }

        console.log(`✅ Participante actualizado: ID ${id}`);
        res.json(updated);
    } catch (error) {
        console.error('❌ Error actualizando participante:', error.message);
        res.status(500).json({ error: 'Error actualizando participante: ' + error.message });
    }
});

// Eliminar un participante
app.delete('/participants/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await storage.select('participant', id);
        if (!existing) {
            return res.status(404).json({ error: 'Participante no encontrado' });
        }

        const success = await manager.storage.delete('participant', { id: id });
        if (!success) {
            return res.status(500).json({ error: 'No se pudo eliminar el participante' });
        }

        console.log(`✅ Participante eliminado: ID ${id}`);
        res.json({ message: 'Participante eliminado correctamente', deletedId: id });
    } catch (error) {
        console.error('❌ Error eliminando participante:', error.message);
        res.status(500).json({ error: 'Error eliminando participante: ' + error.message });
    }
});

// Listar todos los participantes
app.get('/participants', async (req, res) => {
    try {
        const participants = await storage.select('participant') || [];
        res.json({
            count: participants.length,
            participants: participants
        });
    } catch (error) {
        console.error('❌ Error listando participantes:', error.message);
        res.status(500).json({ error: 'Error listando participantes: ' + error.message });
    }
});

// Eliminar todos los participantes (¡cuidado!)
app.delete('/participants', async (req, res) => {
    try {
        const participants = await storage.select('participant') || [];
        const count = participants.length;

        const success = await storage.delete('participant');
        if (!success) {
            return res.status(500).json({ error: 'No se pudieron eliminar todos los participantes' });
        }

        console.log(`✅ Todos los participantes eliminados (${count})`);
        res.json({ message: 'Todos los participantes han sido eliminados', deletedCount: count });
    } catch (error) {
        console.error('❌ Error eliminando todos los participantes:', error.message);
        res.status(500).json({ error: 'Error eliminando todos los participantes: ' + error.message });
    }
});

// =============================================
// ENDPOINTS ADICIONALES
// =============================================

// Obtener standings finales de un torneo
app.get('/tournaments/:id/standings', async (req, res) => {
    try {
        const stageId = parseInt(req.params.id);
        console.log(`🏆 Obteniendo standings finales del torneo ID: ${stageId}`);

        // Primero obtener información del stage para conocer su tipo
        const stage = await storage.select('stage', stageId);
        if (!stage) {
            console.log('❌ Torneo no encontrado');
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        console.log(`ℹ️  Tipo de torneo: ${stage.type}`);

        let finalStandings;
        if (stage.type === 'round_robin') {
            finalStandings = await manager.get.finalStandings(stageId, {rankingFormula: (item) => 3 * item.wins + 1 * item.draws + 0 * item.losses - 1 * item.forfeits});
        } else {
            finalStandings = await manager.get.finalStandings(stageId);
        }

        console.log(`✅ Standings obtenidos para ${finalStandings.length} participantes`);
        res.json({
            stageId: stageId,
            stageType: stage.type,
            standings: finalStandings
        });
    } catch (error) {
        console.error('❌ Error obteniendo standings:', error.message);
        res.status(500).json({
            error: 'Error obteniendo standings: ' + error.message
        });
    }
});

// Eliminar todos los datos (para testing/reset)
app.delete('/reset-all', async (req, res) => {
    try {
        console.log('💥 Eliminando todos los datos...');
        storage.reset();

        console.log('✅ Todos los datos eliminados exitosamente');
        res.json({ message: 'Todos los datos eliminados exitosamente' });
    } catch (error) {
        console.error('❌ Error eliminando datos:', error.message);
        res.status(500).json({
            error: 'Error eliminando datos: ' + error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Tournament Manager API'
    });
});

// =============================================
// Definición centralizada de endpoints
// =============================================
const endpointGroups = {
    tournaments: {
        title: 'GESTIÓN DE TORNEOS/STAGES',
        endpoints: [
            { method: 'POST', path: '/tournaments', description: 'Crear un nuevo torneo' },
            { method: 'GET', path: '/tournaments', description: 'Obtener lista de torneos' },
            { method: 'GET', path: '/tournaments/:id', description: 'Obtener datos de un torneo' },
            { method: 'DELETE', path: '/tournaments/:id', description: 'Eliminar un torneo' },
            { method: 'GET', path: '/stages/:id', description: 'Obtener datos de un stage' },
            { method: 'DELETE', path: '/stages/:id', description: 'Eliminar un stage' }
        ]
    },
    matches: {
        title: 'GESTIÓN DE PARTIDOS',
        endpoints: [
            { method: 'PATCH', path: '/matches/:id', description: 'Actualizar un partido' },
            { method: 'PATCH', path: '/match-games/:id', description: 'Actualizar un juego hijo (Best-of-X)' },
            { method: 'PATCH', path: '/match-child-count', description: 'Ajustar número de juegos hijos' },
            { method: 'GET', path: '/stages/:id/matches', description: 'Partidos de un stage' },
            { method: 'GET', path: '/matches/:id/games', description: 'Obtener juegos hijos de un partido' },
            { method: 'GET', path: '/stage/:id/current-matches', description: 'Partidos actuales' },
            { method: 'POST', path: '/matches/:id/reset', description: 'Resetear partido' },
            { method: 'POST', path: '/match-games/:id/reset', description: 'Resetear partido hijo' }
        ]
    },
    seeding: {
        title: 'GESTIÓN DE SEEDING',
        endpoints: [
            { method: 'GET', path: '/stages/:id/seeding', description: 'Obtener el seeding de un stage' },
            { method: 'PUT', path: '/tournaments/:id/update-seeding', description: 'Actualizar seeding' },
            { method: 'POST', path: '/tournaments/:id/confirm-seeding', description: 'Confirmar seeding (TBDs → BYEs)' },
            { method: 'POST', path: '/tournaments/:id/reset-seeding', description: 'Resetear seeding' }
        ]
    },
    ordering: {
        title: 'GESTIÓN DE ORDERING',
        endpoints: [
            { method: 'PUT', path: '/tournaments/:id/ordering', description: 'Actualizar ordering de un stage' },
            { method: 'PUT', path: '/rounds/:id/ordering', description: 'Actualizar ordering de una ronda' }
        ]
    },
    participants: {
        title: 'PARTICIPANTES',
        endpoints: [
            { method: 'POST', path: '/participants', description: 'Crear un nuevo participante' },
            { method: 'GET', path: '/participants', description: 'Listar todos los participantes' },
            { method: 'GET', path: '/participants/:id', description: 'Obtener un participante por ID' },
            { method: 'PUT', path: '/participants/:id', description: 'Actualizar un participante' },
            { method: 'DELETE', path: '/participants/:id', description: 'Eliminar un participante' },
            { method: 'DELETE', path: '/participants', description: 'Eliminar todos los participantes' }
        ]
    },
    results: {
        title: 'RESULTADOS Y ESTADÍSTICAS',
        endpoints: [
            { method: 'GET', path: '/tournaments/:id/standings', description: 'Standings finales' }
        ]
    },
    utils: {
        title: 'UTILIDADES',
        endpoints: [
            { method: 'DELETE', path: '/reset-all', description: 'Resetear toda la base de datos' },
            { method: 'GET', path: '/health', description: 'Health check' }
        ]
    }
};

// Generar lista plana para el middleware 404
const availableEndpoints = [];
for (const group of Object.values(endpointGroups)) {
    group.endpoints.forEach(ep => {
        availableEndpoints.push(`${ep.method.padEnd(6)} ${ep.path.padEnd(35)} - ${ep.description}`);
    });
}

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint no encontrado',
        availableEndpoints: availableEndpoints
    });
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`🎯 Servidor de torneos ejecutándose en http://localhost:${port}`);
    console.log(`📚 Endpoints disponibles:`);
    console.log(``);
    for (const group of Object.values(endpointGroups)) {
        console.log(`   ${group.title}:`);
        group.endpoints.forEach(ep => {
            console.log(`   ${ep.method.padEnd(6)} ${ep.path.padEnd(35)} - ${ep.description}`);
        });
        console.log(``);
    }
});
