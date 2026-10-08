import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Véhicules à conserver obligatoirement
function isVehicleToKeep(brand?: string, model?: string): boolean {
    const full = `${brand || ''} ${model || ''}`.toLowerCase().trim();
    const isPeugeot308 = full.includes('peugeot') && full.includes('308');
    const isKiaPicanto = full.includes('kia') && full.includes('picanto');
    return isPeugeot308 || isKiaPicanto;
}

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

// GET: Inspection et diagnostic des véhicules dans Firestore
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
                        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center; }
                        .card { max-width: 500px; margin: 40px auto; background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #334155; }
                        h1 { color: #ef4444; font-size: 20px; }
                        p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
                        code { background: #0f172a; padding: 4px 8px; border-radius: 4px; color: #38bdf8; }
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

        const keptVehicles: any[] = [];
        const vehiclesToDelete: any[] = [];

        vehiclesSnap.docs.forEach(doc => {
            const data = doc.data();
            const vehicleInfo = {
                id: doc.id,
                brand: data.brand || '',
                model: data.model || '',
                licensePlate: data.licensePlate || '',
                userId: data.userId || '',
                maintenanceCount: maintenanceCountByVehicle.get(doc.id) || 0,
                repairsCount: repairsCountByVehicle.get(doc.id) || 0,
                fuelLogsCount: fuelLogsCountByVehicle.get(doc.id) || 0,
            };

            if (isVehicleToKeep(data.brand, data.model)) {
                keptVehicles.push(vehicleInfo);
            } else {
                vehiclesToDelete.push(vehicleInfo);
            }
        });

        const totalMaintenancesToDelete = vehiclesToDelete.reduce((sum, v) => sum + v.maintenanceCount, 0);

        if (!isHtmlRequest(request)) {
            return NextResponse.json({
                success: true,
                summary: {
                    totalVehiclesInDb: vehiclesSnap.size,
                    totalKept: keptVehicles.length,
                    totalToDelete: vehiclesToDelete.length,
                    totalMaintenancesToDelete,
                },
                keptVehicles,
                vehiclesToDelete,
            });
        }

        // Vue HTML interactive pour navigateur
        const html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CarCare - Audit et Purge des Véhicules</title>
                <style>
                    :root { color-scheme: dark; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #f1f5f9; padding: 24px; margin: 0; }
                    .container { max-width: 900px; margin: 0 auto; }
                    .header { margin-bottom: 24px; }
                    h1 { font-size: 24px; margin: 0 0 8px 0; color: #f8fafc; }
                    p.subtitle { color: #94a3b8; margin: 0; font-size: 14px; }
                    .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
                    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #1e293b; padding-bottom: 12px; }
                    .card-title { font-size: 16px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
                    .badge { font-size: 12px; padding: 4px 10px; border-radius: 20px; font-weight: 600; }
                    .badge-green { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
                    .badge-red { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th { text-align: left; padding: 10px 12px; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #1e293b; }
                    td { padding: 12px; border-bottom: 1px solid #1e293b; color: #e2e8f0; }
                    tr:last-child td { border-bottom: none; }
                    .code { font-family: monospace; background: #090d16; padding: 3px 6px; border-radius: 4px; color: #38bdf8; font-size: 12px; }
                    .btn-purge { background: #dc2626; color: white; border: none; padding: 14px 24px; font-size: 15px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
                    .btn-purge:hover { background: #b91c1c; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4); }
                    .btn-purge:disabled { opacity: 0.5; cursor: not-allowed; }
                    .alert-empty { padding: 16px; text-align: center; color: #94a3b8; font-style: italic; }
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
                    .stat-box { background: #131b2e; border: 1px solid #1e293b; border-radius: 10px; padding: 16px; }
                    .stat-value { font-size: 24px; font-weight: 800; color: #f8fafc; }
                    .stat-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🚗 CarCare - Audit des Véhicules Firestore</h1>
                        <p class="subtitle">Vérification avant suppression définitive des véhicules et des données associées.</p>
                    </div>

                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-value" style="color: #4ade80;">${keptVehicles.length}</div>
                            <div class="stat-label">Véhicules Conservés (Peugeot 308, Kia Picanto)</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value" style="color: #f87171;">${vehiclesToDelete.length}</div>
                            <div class="stat-label">Véhicules à Supprimer</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value" style="color: #f59e0b;">${totalMaintenancesToDelete}</div>
                            <div class="stat-label">Maintenances orphelines à purger</div>
                        </div>
                    </div>

                    <!-- 1. VÉHICULES CONSERVÉS -->
                    <div class="card" style="border-left: 4px solid #22c55e;">
                        <div class="card-header">
                            <h2 class="card-title">
                                <span>✅ Véhicules qui seront CONSERVÉS</span>
                            </h2>
                            <span class="badge badge-green">${keptVehicles.length} véhicule(s) protégé(s)</span>
                        </div>
                        ${keptVehicles.length === 0 ? '<div class="alert-empty">⚠️ Attention : Aucun véhicule correspondant à Peugeot 308 ou Kia Picanto n\'a été trouvé !</div>' : `
                            <table>
                                <thead>
                                    <tr>
                                        <th>Véhicule</th>
                                        <th>Immatriculation</th>
                                        <th>ID Firestore</th>
                                        <th>Entretiens</th>
                                        <th>Statut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${keptVehicles.map(v => `
                                        <tr>
                                            <td><strong>${v.brand} ${v.model}</strong></td>
                                            <td>${v.licensePlate || 'N/A'}</td>
                                            <td><span class="code">${v.id}</span></td>
                                            <td>${v.maintenanceCount} entretien(s) conservé(s)</td>
                                            <td><span class="badge badge-green">CONSERVÉ</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>

                    <!-- 2. VÉHICULES À SUPPRIMER -->
                    <div class="card" style="border-left: 4px solid #ef4444;">
                        <div class="card-header">
                            <h2 class="card-title">
                                <span>🗑️ Véhicules qui seront SUPPRIMÉS</span>
                            </h2>
                            <span class="badge badge-red">${vehiclesToDelete.length} à supprimer</span>
                        </div>
                        ${vehiclesToDelete.length === 0 ? '<div class="alert-empty" style="color: #4ade80;">✨ La base de données est déjà propre ! Aucun autre véhicule à supprimer.</div>' : `
                            <table>
                                <thead>
                                    <tr>
                                        <th>Véhicule</th>
                                        <th>Immatriculation</th>
                                        <th>ID Firestore</th>
                                        <th>Entretiens associés</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${vehiclesToDelete.map(v => `
                                        <tr>
                                            <td><strong>${v.brand || 'Sans marque'} ${v.model || 'Sans modèle'}</strong></td>
                                            <td>${v.licensePlate || 'N/A'}</td>
                                            <td><span class="code">${v.id}</span></td>
                                            <td><strong style="color: #f87171;">${v.maintenanceCount}</strong> entretien(s) à supprimer</td>
                                            <td><span class="badge badge-red">SUPPRESSION</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>

                    <!-- 3. BOUTON DE CONFIRMATION -->
                    ${vehiclesToDelete.length > 0 ? `
                        <div class="card" style="text-align: center; background: rgba(220, 38, 38, 0.08); border-color: rgba(220, 38, 38, 0.3);">
                            <h3 style="margin: 0 0 8px 0; color: #f87171; font-size: 16px;">Prêt pour la purge ?</h3>
                            <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8;">
                                La Peugeot 308 et la Kia Picanto ainsi que leurs données resteront totalement intactes.<br>
                                Les ${vehiclesToDelete.length} autres véhicules et leurs ${totalMaintenancesToDelete} maintenances seront définitivement supprimés.
                            </p>
                            <form method="POST" action="/api/admin/vehicles?key=${encodeURIComponent(key)}&confirm=true" onsubmit="return confirm('Êtes-vous absolument certain de vouloir supprimer ces ${vehiclesToDelete.length} véhicule(s) et leurs données associées ? Cette action est irréversible.');">
                                <button type="submit" class="btn-purge">
                                    🗑️ Confirmer et lancer la suppression définitive
                                </button>
                            </form>
                        </div>
                    ` : `
                        <div style="text-align: center; padding: 20px;">
                            <a href="/" style="color: #38bdf8; text-decoration: none; font-weight: 600; font-size: 14px;">← Retour à l'application</a>
                        </div>
                    `}
                </div>
            </body>
            </html>
        `;

        return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error: any) {
        console.error('Erreur audit véhicules :', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Suppression sécurisée des véhicules et de leurs maintenances associées
export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key') || '';

    if (!checkAuthorization(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const confirmed = searchParams.get('confirm') === 'true' || body.confirm === true;

        if (!confirmed) {
            return NextResponse.json({
                error: 'Confirmation requise',
                hint: 'Pour exécuter la suppression, passez ?confirm=true dans l\'URL ou { "confirm": true } dans le corps de la requête.',
            }, { status: 400 });
        }

        const [vehiclesSnap, maintenanceSnap, repairsSnap, fuelLogsSnap] = await Promise.all([
            adminDb.collection('vehicles').get(),
            adminDb.collection('maintenance').get(),
            adminDb.collection('repairs').get(),
            adminDb.collection('fuelLogs').get(),
        ]);

        const idsToDelete = new Set<string>();
        const keptVehicles: any[] = [];
        const deletedVehicles: any[] = [];

        vehiclesSnap.docs.forEach(doc => {
            const data = doc.data();
            if (isVehicleToKeep(data.brand, data.model)) {
                keptVehicles.push({
                    id: doc.id,
                    brand: data.brand,
                    model: data.model,
                    licensePlate: data.licensePlate,
                });
            } else {
                idsToDelete.add(doc.id);
                deletedVehicles.push({
                    id: doc.id,
                    brand: data.brand,
                    model: data.model,
                    licensePlate: data.licensePlate,
                });
            }
        });

        if (idsToDelete.size === 0) {
            if (isHtmlRequest(request)) {
                return new NextResponse(`
                    <!DOCTYPE html>
                    <html lang="fr">
                    <head><meta charset="UTF-8"><title>Déjà Propre</title>
                    <style>body { font-family: sans-serif; background: #090d16; color: #fff; text-align: center; padding: 40px; } .card { max-width: 500px; margin: auto; background: #131b2e; padding: 30px; border-radius: 12px; } a { color: #38bdf8; }</style>
                    </head>
                    <body>
                        <div class="card">
                            <h2 style="color: #4ade80;">✨ Aucun véhicule à supprimer</h2>
                            <p>Tous les véhicules présents sont déjà Peugeot 308 ou Kia Picanto.</p>
                            <a href="/api/admin/vehicles?key=${encodeURIComponent(key)}">← Revoir la liste</a>
                        </div>
                    </body>
                    </html>
                `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
            return NextResponse.json({
                success: true,
                message: 'Aucun véhicule à supprimer trouvé.',
                keptVehicles,
                deletedCount: 0,
            });
        }

        // Suppression par batch (véhicules + maintenances + réparations + pleins)
        let batch = adminDb.batch();
        let opCount = 0;
        let deletedMaintenancesCount = 0;
        let deletedRepairsCount = 0;
        let deletedFuelLogsCount = 0;

        // 1. Supprimer les maintenances associées aux véhicules supprimés
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

        // 2. Supprimer les réparations associées
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

        // 3. Supprimer les pleins associés
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

        // 4. Supprimer les documents véhicules eux-mêmes
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
                    <title>Purge Réussie - CarCare</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #f1f5f9; padding: 40px; text-align: center; }
                        .card { max-width: 600px; margin: 40px auto; background: #131b2e; padding: 36px; border-radius: 16px; border: 1px solid #1e293b; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
                        h1 { color: #4ade80; font-size: 24px; margin: 0 0 12px 0; }
                        p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0; }
                        .stat-list { text-align: left; background: #090d16; padding: 16px 24px; border-radius: 8px; margin-bottom: 24px; font-size: 14px; }
                        .stat-list li { margin: 8px 0; color: #e2e8f0; }
                        .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
                        .btn:hover { background: #1d4ed8; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>✅ Purge Réussie !</h1>
                        <p>Les véhicules indésirables et toutes leurs données ont été nettoyés avec succès de Firestore.</p>
                        <div class="stat-list">
                            <ul>
                                <li><strong>${idsToDelete.size}</strong> véhicule(s) supprimé(s)</li>
                                <li><strong>${deletedMaintenancesCount}</strong> entretien(s) supprimé(s)</li>
                                <li><strong>${deletedRepairsCount}</strong> réparation(s) supprimée(s)</li>
                                <li><strong>${deletedFuelLogsCount}</strong> plein(s) supprimé(s)</li>
                                <li style="color: #4ade80;"><strong>${keptVehicles.length}</strong> véhicules conservés (Peugeot 308 & Kia Picanto)</li>
                            </ul>
                        </div>
                        <a href="/api/admin/vehicles?key=${encodeURIComponent(key)}" class="btn">Vérifier l'état de la base</a>
                    </div>
                </body>
                </html>
            `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        return NextResponse.json({
            success: true,
            message: 'Nettoyage des véhicules effectué avec succès.',
            keptVehicles,
            deletedVehicles,
            stats: {
                vehiclesDeleted: idsToDelete.size,
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
