import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Définissez la région sur une plus proche de vous si nécessaire, par exemple 'europe-west1'
const region = "us-central1"; 

export const checkDeadlinesAndSendNotifications = functions
  .region(region)
  .pubsub.schedule("every 24 hours") // S'exécute tous les jours à minuit
  .timeZone("Africa/Tunis") // Fuseau horaire pour l'exécution
  .onRun(async (context) => {
    const now = new Date();
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(now.getDate() + 7);

    const maintenanceRef = db.collection("maintenance");
    
    // Convertir les dates en format YYYY-MM-DD pour la comparaison avec les chaînes de la BDD
    const todayString = now.toISOString().split("T")[0];
    const oneWeekFromNowString = oneWeekFromNow.toISOString().split("T")[0];

    // Cherche les échéances dans exactement 7 jours
    const querySnapshot = await maintenanceRef
      .where("nextDueDate", ">=", todayString)
      .where("nextDueDate", "<=", oneWeekFromNowString)
      .get();

    if (querySnapshot.empty) {
      console.log("No upcoming deadlines found for the next 7 days.");
      return null;
    }

    console.log(`Found ${querySnapshot.size} upcoming deadlines.`);

    const tokensRef = db.collection("fcmTokens");

    for (const doc of querySnapshot.docs) {
      const maintenance = doc.data();
      const userId = maintenance.userId;

      // Trouvez les jetons pour cet utilisateur
      const userTokensSnapshot = await tokensRef
        .where("userId", "==", userId).get();

      if (!userTokensSnapshot.empty) {
        const tokens = userTokensSnapshot.docs.map((t) => t.data().token);
        
        let vehicleName = "votre véhicule";
        try {
            const vehicleDoc = await db.collection("vehicles")
              .doc(maintenance.vehicleId).get();
            if (vehicleDoc.exists) {
                const vehicleData = vehicleDoc.data();
                vehicleName = `${vehicleData?.brand || ''} ${vehicleData?.model || ''}`.trim();
            }
        } catch (e) {
            console.error(`Could not fetch vehicle ${maintenance.vehicleId}`, e);
        }

        const dueDate = new Date(maintenance.nextDueDate).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
        });

        const message = {
          notification: {
            title: "Rappel d'entretien CarCare Pro",
            body: `Échéance pour ${maintenance.task} sur ${vehicleName} le ${dueDate}.`,
            icon: "/android-chrome-192x192.png" // Icône pour la notification
          },
          tokens: tokens,
        };
        
        console.log(`Sending notification to user ${userId} for task "${maintenance.task}"`);
        await messaging.sendEachForMulticast(message);
      }
    }
    return null;
  });