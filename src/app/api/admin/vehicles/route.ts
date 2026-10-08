import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

function checkAuthorization(request: Request): boolean {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    return (
        !cronSecret ||
        (key === cronSecret) ||
        (authHeader === `Bearer ${cronSecret}`) ||
        (request.headers.get('x-vercel-signature') !== null)
    );
}

function isHtmlRequest(request: Request): boolean {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('format') === 'json') return false;
    const accept = request.headers.get('accept') || '';
    return accept.includes('text/html');
}

// GET: Inspection interactive de TOUS les véhicules avec sélection manuelle
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key') || '';

    if (!checkAuthorization(request)) {
        if (isHtmlRequest(request)) {
            return new NextResponse(`
                <!DOCTYPE html>
                <html lang="fr">
                <head>
                    <meta charset="UTF-8">
                    <title>Accès Refusé - CarCare</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #f8fafc; padding: 40px; text-align: center; }
                        .card { max-width: 500px; margin: 40px auto; background: #131b2e; padding: 30px; border-radius: 12px; border: 1px solid #1e293b; }
                        h1 { color: #ef4444; font-size: 20px; }
                        p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
                        code { background: #090d16; padding: 4px 8px; border-radius: 4px; color: #38bdf8; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>🔒 Accès Non Autorisé</h1>
                        <p>Veuillez fournir votre clé secrète dans l'URL :</p>
                        <p><code>?key=VOTRE_CRON_SECRET</code></p>
                    </div>
                </body>
                </html>
            `, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 401 });
        }
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const [vehiclesSnap, maintenanceSnap, repairsSnap, fuelLogsSnap] = await Promise.all([
            adminDb.collection('vehicles').get(),
            adminDb.collection('maintenance').get(),
            adminDb.collection('repairs').get(),
            adminDb.collection('fuelLogs').get(),
        ]);

        const maintenanceCountByVehicle = new Map<string, number>();
        maintenanceSnap.docs.forEach(doc => {
            const vId = doc.data().vehicleId;
            if (vId) maintenanceCountByVehicle.set(vId, (maintenanceCountByVehicle.get(vId) || 0) + 1);
        });

        const repairsCountByVehicle = new Map<string, number>();
        repairsSnap.docs.forEach(doc => {
            const vId = doc.data().vehicleId;
            if (vId) repairsCountByVehicle.set(vId, (repairsCountByVehicle.get(vId) || 0) + 1);
        });

        const fuelLogsCountByVehicle = new Map<string, number>();
        fuelLogsSnap.docs.forEach(doc => {
            const vId = doc.data().vehicleId;
            if (vId) fuelLogsCountByVehicle.set(vId, (fuelLogsCountByVehicle.get(vId) || 0) + 1);
        });

        const allVehicles: any[] = [];
        vehiclesSnap.docs.forEach(doc => {
            const data = doc.data();
            const brand = data.brand || '';
            const model = data.model || '';
            const full = `${brand} ${model}`.toLowerCase().trim();
            const is308orPicanto = (full.includes('peugeot') && full.includes('308')) || (full.includes('kia') && full.includes('picanto'));

            allVehicles.push({
                id: doc.id,
                brand,
                model,
                licensePlate: data.licensePlate || 'Sans Matricule',
                userId: data.userId || '',
                year: data.year || '',
                maintenanceCount: maintenanceCountByVehicle.get(doc.id) || 0,
                repairsCount: repairsCountByVehicle.get(doc.id) || 0,
                fuelLogsCount: fuelLogsCountByVehicle.get(doc.id) || 0,
                is308orPicanto,
            });
        });

        // Trier par Marque puis Immatriculation
        allVehicles.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));

        if (!isHtmlRequest(request)) {
            return NextResponse.json({
                success: true,
                totalVehicles: allVehicles.length,
                vehicles: allVehicles,
            });
        }

        // Vue HTML avec cases à cocher personnalisées par véhicule et matricule
        const html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CarCare - Gestion et Purge Sélective des Véhicules</title>
                <style>
                    :root { color-scheme: dark; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #f1f5f9; padding: 24px; margin: 0; }
                    .container { max-width: 980px; margin: 0 auto; }
                    .header { margin-bottom: 24px; }
                    h1 { font-size: 24px; margin: 0 0 8px 0; color: #f8fafc; }
                    p.subtitle { color: #94a3b8; margin: 0; font-size: 14px; }
                    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
                    .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: gap: 12px; }
                    .info-banner { background: rgba(56, 189, 248, 0.1); border-left: 4px solid #38bdf8; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #e0f2fe; margin-bottom: 20px; line-height: 1.5; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th { text-align: left; padding: 12px; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #1e293b; background: rgba(15, 23, 42, 0.4); }
                    td { padding: 14px 12px; border-bottom: 1px solid #1e293b; color: #e2e8f0; vertical-align: middle; }
                    tr:hover td { background: rgba(255,255,255,0.02); }
                    .plate { font-family: monospace; font-size: 14px; font-weight: 700; background: #020617; border: 1px solid #334155; padding: 4px 8px; border-radius: 6px; color: #f8fafc; letter-spacing: 0.5px; }
                    .code { font-family: monospace; background: #090d16; padding: 2px 6px; border-radius: 4px; color: #94a3b8; font-size: 11px; }
                    .badge { font-size: 11px; padding: 3px 8px; border-radius: 20px; font-weight: 600; text-transform: uppercase; }
                    .badge-blue { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
                    .badge-orange { background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.3); }
                    .checkbox-cell { width: 44px; text-align: center; }
                    input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #ef4444; }
                    .btn-purge { background: #dc2626; color: white; border: none; padding: 14px 28px; font-size: 15px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
                    .btn-purge:hover { background: #b91c1c; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4); }
                    .btn-quick { background: #1e293b; color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 5px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
                    .btn-quick:hover { background: #ef4444; color: white; }
                    .btn-select { background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
                    .btn-select:hover { background: #334155; color: white; }
                    .count-chip { font-size: 12px; color: #94a3b8; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🚗 CarCare - Purge Sélective par Immatriculation</h1>
                        <p class="subtitle">Cochez précisément les véhicules à SUPPRIMER (y compris les doublons ou faux matricules de Picanto ou 308).</p>
                    </div>

                    <div class="info-banner">
                        💡 <strong>Mode d'emploi :</strong><br>
                        - Cochez les véhicules que vous souhaitez <strong>supprimer définitivement</strong>.<br>
                        - Pour chaque véhicule supprimé, toutes ses maintenances orphelines seront également effacées de Firestore.<br>
                        - Les véhicules <strong>non cochés</strong> resteront 100% intacts.
                    </div>

                    <form id="purgeForm" method="POST" action="/api/admin/vehicles?key=${encodeURIComponent(key)}">
                        <div class="card">
                            <div class="toolbar">
                                <div>
                                    <strong style="font-size: 15px;">Liste de tous les véhicules (${allVehicles.length})</strong>
                                    <div class="count-chip">Sélectionnez les lignes à supprimer :</div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button type="button" class="btn-select" onclick="selectAll(false)">Tout décocher</button>
                                    <button type="button" class="btn-select" onclick="selectNonTarget()">Cocher tout sauf 308 & Picanto</button>
                                </div>
                            </div>

                            <table>
                                <thead>
                                    <tr>
                                        <th class="checkbox-cell">Suppr.</th>
                                        <th>Matricule</th>
                                        <th>Véhicule</th>
                                        <th>ID Firestore</th>
                                        <th>Entretiens</th>
                                        <th>Action directe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${allVehicles.map(v => `
                                        <tr>
                                            <td class="checkbox-cell">
                                                <input 
                                                    type="checkbox" 
                                                    name="vehicleIds" 
                                                    value="${v.id}" 
                                                    data-is-target="${v.is308orPicanto ? 'true' : 'false'}"
                                                    ${!v.is308orPicanto ? 'checked' : ''}
                                                    onchange="updateSelectionCount()"
                                                />
                                            </td>
                                            <td><span class="plate">${v.licensePlate}</span></td>
                                            <td>
                                                <strong>${v.brand} ${v.model}</strong>
                                                ${v.is308orPicanto ? '<span class="badge badge-blue" style="margin-left: 6px;">308/Picanto</span>' : '<span class="badge badge-orange" style="margin-left: 6px;">Autre</span>'}
                                            </td>
                                            <td><span class="code">${v.id}</span></td>
                                            <td>
                                                <span style="color: ${v.maintenanceCount > 0 ? '#fbbf24' : '#94a3b8'}; font-weight: 600;">
                                                    ${v.maintenanceCount} entretien(s)
                                                </span>
                                            </td>
                                            <td>
                                                <button type="button" class="btn-quick" onclick="deleteSingle('${v.id}', '${v.brand} ${v.model}', '${v.licensePlate}')">
                                                    Supprimer seul
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>

                        <div class="card" style="text-align: center; background: rgba(220, 38, 38, 0.08); border-color: rgba(220, 38, 38, 0.3);">
                            <h3 style="margin: 0 0 8px 0; color: #f87171; font-size: 16px;">Confirmation de la purge</h3>
                            <p id="selectionSummary" style="margin: 0 0 16px 0; font-size: 14px; color: #e2e8f0;">
                                Calcul de la sélection...
                            </p>
                            <button type="submit" id="btnSubmit" class="btn-purge">
                                🗑️ Supprimer les véhicules cochés
                            </button>
                        </div>
                    </form>
                </div>

                <script>
                    function updateSelectionCount() {
                        const checked = document.querySelectorAll('input[name="vehicleIds"]:checked');
                        const count = checked.length;
                        const summary = document.getElementById('selectionSummary');
                        const btn = document.getElementById('btnSubmit');

                        if (count === 0) {
                            summary.innerHTML = "⚠️ Aucun véhicule sélectionné. Cochez les véhicules que vous souhaitez supprimer.";
                            btn.disabled = true;
                            btn.style.opacity = '0.5';
                        } else {
                            summary.innerHTML = "<strong>" + count + " véhicule(s)</strong> seront définitivement supprimés avec toutes leurs maintenances.";
                            btn.disabled = false;
                            btn.style.opacity = '1';
                        }
                    }

                    function selectAll(checked) {
                        document.querySelectorAll('input[name="vehicleIds"]').forEach(cb => cb.checked = checked);
                        updateSelectionCount();
                    }

                    function selectNonTarget() {
                        document.querySelectorAll('input[name="vehicleIds"]').forEach(cb => {
                            cb.checked = cb.getAttribute('data-is-target') !== 'true';
                        });
                        updateSelectionCount();
                    }

                    function deleteSingle(id, name, plate) {
                        if (confirm('Voulez-vous supprimer UNIQUEMENT ce véhicule ?\\n\\n' + name + ' (' + plate + ')\\nID: ' + id)) {
                            const form = document.createElement('form');
                            form.method = 'POST';
                            form.action = '/api/admin/vehicles?key=${encodeURIComponent(key)}';
                            const input = document.createElement('input');
                            input.type = 'hidden';
                            input.name = 'vehicleIds';
                            input.value = id;
                            form.appendChild(input);
                            document.body.appendChild(form);
                            form.submit();
                        }
                    }

                    document.getElementById('purgeForm').onsubmit = function(e) {
                        const count = document.querySelectorAll('input[name="vehicleIds"]:checked').length;
                        if (count === 0) {
                            alert('Veuillez cocher au moins un véhicule à supprimer.');
                            return false;
                        }
                        return confirm('ATTENTION : Vous êtes sur le point de supprimer ' + count + ' véhicule(s) ainsi que toutes leurs maintenances associées.\\n\\nCette action est irréversible. Confirmez-vous ?');
                    };

                    updateSelectionCount();
                </script>
            </body>
            </html>
        `;

        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error: any) {
        console.error('Erreur audit véhicules :', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Suppression précise des vehicleIds sélectionnés
export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key') || '';

    if (!checkAuthorization(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        let selectedIds: string[] = [];

        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            selectedIds = formData.getAll('vehicleIds').map(String);
        } else {
            const body = await request.json().catch(() => ({}));
            if (Array.isArray(body.vehicleIds)) {
                selectedIds = body.vehicleIds;
            } else if (body.vehicleId) {
                selectedIds = [body.vehicleId];
            }
        }

        // Permet aussi de passer ?deleteId= dans l'URL
        const deleteIdParam = searchParams.get('deleteId');
        if (deleteIdParam) {
            selectedIds.push(deleteIdParam);
        }

        selectedIds = Array.from(new Set(selectedIds)).filter(Boolean);

        if (selectedIds.length === 0) {
            return NextResponse.json({
                error: 'Aucun véhicule sélectionné',
                hint: 'Envoyez les IDs à supprimer sous le champ "vehicleIds".',
            }, { status: 400 });
        }

        const idsToDelete = new Set<string>(selectedIds);

        const [vehiclesSnap, maintenanceSnap, repairsSnap, fuelLogsSnap] = await Promise.all([
            adminDb.collection('vehicles').get(),
            adminDb.collection('maintenance').get(),
            adminDb.collection('repairs').get(),
            adminDb.collection('fuelLogs').get(),
        ]);

        const deletedVehicles: any[] = [];
        const keptVehicles: any[] = [];

        vehiclesSnap.docs.forEach(doc => {
            const data = doc.data();
            const info = {
                id: doc.id,
                brand: data.brand || '',
                model: data.model || '',
                licensePlate: data.licensePlate || '',
            };
            if (idsToDelete.has(doc.id)) {
                deletedVehicles.push(info);
            } else {
                keptVehicles.push(info);
            }
        });

        // Suppression par batch
        let batch = adminDb.batch();
        let opCount = 0;
        let deletedMaintenancesCount = 0;
        let deletedRepairsCount = 0;
        let deletedFuelLogsCount = 0;

        // 1. Supprimer les maintenances
        for (const doc of maintenanceSnap.docs) {
            if (idsToDelete.has(doc.data().vehicleId)) {
                batch.delete(doc.ref);
                deletedMaintenancesCount++;
                opCount++;
                if (opCount >= 450) {
                    await batch.commit();
                    batch = adminDb.batch();
                    opCount = 0;
                }
            }
        }

        // 2. Supprimer les réparations
        for (const doc of repairsSnap.docs) {
            if (idsToDelete.has(doc.data().vehicleId)) {
                batch.delete(doc.ref);
                deletedRepairsCount++;
                opCount++;
                if (opCount >= 450) {
                    await batch.commit();
                    batch = adminDb.batch();
                    opCount = 0;
                }
            }
        }

        // 3. Supprimer les pleins
        for (const doc of fuelLogsSnap.docs) {
            if (idsToDelete.has(doc.data().vehicleId)) {
                batch.delete(doc.ref);
                deletedFuelLogsCount++;
                opCount++;
                if (opCount >= 450) {
                    await batch.commit();
                    batch = adminDb.batch();
                    opCount = 0;
                }
            }
        }

        // 4. Supprimer les véhicules sélectionnés
        for (const vId of idsToDelete) {
            batch.delete(adminDb.collection('vehicles').doc(vId));
            opCount++;
            if (opCount >= 450) {
                await batch.commit();
                batch = adminDb.batch();
                opCount = 0;
            }
        }

        if (opCount > 0) {
            await batch.commit();
        }

        if (isHtmlRequest(request)) {
            return new NextResponse(`
                <!DOCTYPE html>
                <html lang="fr">
                <head>
                    <meta charset="UTF-8">
                    <title>Purge Terminée - CarCare</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #f1f5f9; padding: 40px; text-align: center; }
                        .card { max-width: 600px; margin: 40px auto; background: #131b2e; padding: 36px; border-radius: 16px; border: 1px solid #1e293b; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
                        h1 { color: #4ade80; font-size: 24px; margin: 0 0 12px 0; }
                        p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0; }
                        .stat-list { text-align: left; background: #090d16; padding: 16px 24px; border-radius: 8px; margin-bottom: 24px; font-size: 14px; }
                        .stat-list li { margin: 8px 0; color: #e2e8f0; }
                        .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
                        .btn:hover { background: #1d4ed8; }
                        .plate { font-family: monospace; font-weight: 700; color: #f87171; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>✅ Purge Terminée !</h1>
                        <p>Les véhicules sélectionnés ont été supprimés avec succès.</p>
                        <div class="stat-list">
                            <ul>
                                <li><strong>${deletedVehicles.length}</strong> véhicule(s) supprimé(s) :
                                    ${deletedVehicles.map(v => `<br>&nbsp;&nbsp;• ${v.brand} ${v.model} (<span class="plate">${v.licensePlate}</span>)`).join('')}
                                </li>
                                <li><strong>${deletedMaintenancesCount}</strong> maintenance(s) supprimée(s)</li>
                                <li><strong>${deletedRepairsCount}</strong> réparation(s) supprimée(s)</li>
                                <li><strong>${deletedFuelLogsCount}</strong> plein(s) supprimé(s)</li>
                                <li style="color: #4ade80; margin-top: 12px;"><strong>${keptVehicles.length}</strong> véhicule(s) conservé(s) au total</li>
                            </ul>
                        </div>
                        <a href="/api/admin/vehicles?key=${encodeURIComponent(key)}" class="btn">← Revenir à la liste des véhicules</a>
                    </div>
                </body>
                </html>
            `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        return NextResponse.json({
            success: true,
            message: 'Nettoyage des véhicules sélectionnés effectué avec succès.',
            deletedVehicles,
            keptVehicles,
            stats: {
                vehiclesDeleted: deletedVehicles.length,
                maintenancesDeleted: deletedMaintenancesCount,
                repairsDeleted: deletedRepairsCount,
                fuelLogsDeleted: deletedFuelLogsCount,
            }
        });

    } catch (error: any) {
        console.error('Erreur suppression véhicules :', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
