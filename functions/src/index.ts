
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();

// Scheduled function that runs once every 24 hours
export const sendMaintenanceReminders = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async (context) => {
    console.log("Running daily maintenance check...");

    const now = new Date();
    const reminderThresholdDate = new Date();
    reminderThresholdDate.setDate(now.getDate() + 20); // Reminders for tasks due in the next 20 days

    try {
      // Get all maintenance tasks that have a due date
      const maintenanceSnapshot = await db
        .collection("maintenance")
        .where("nextDueDate", "!=", null)
        .get();

      if (maintenanceSnapshot.empty) {
        console.log("No maintenance tasks with due dates found.");
        return null;
      }

      const remindersToSend: Promise<any>[] = [];

      for (const doc of maintenanceSnapshot.docs) {
        const maintenanceTask = doc.data();
        const dueDate = new Date(maintenanceTask.nextDueDate);

        // Check if the due date is within our reminder threshold (and not in the past)
        if (dueDate <= reminderThresholdDate && dueDate >= now) {
          const userId = maintenanceTask.userId;
          const vehicleId = maintenanceTask.vehicleId;

          // Get user's FCM tokens
          const tokensSnapshot = await db
            .collection("fcmTokens")
            .where("userId", "==", userId)
            .get();

          if (tokensSnapshot.empty) {
            console.log(`No FCM tokens found for user ${userId}.`);
            continue; // Skip to the next task
          }

          // Get vehicle info for a more descriptive notification
          const vehicleDoc = await db.collection("vehicles").doc(vehicleId).get();
          const vehicle = vehicleDoc.data();
          const vehicleName = vehicle ? `${vehicle.brand} ${vehicle.model}` : "votre véhicule";
          const formattedDueDate = dueDate.toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });

          // Prepare notification payload
          const payload = {
            notification: {
              title: "Rappel d'Entretien CarCare Pro",
              body: `Échéance proche : ${maintenanceTask.task} pour ${vehicleName} le ${formattedDueDate}.`,
              icon: "/apple-touch-icon.png",
            },
          };

          // Send notification to all tokens for that user
          const userTokens = tokensSnapshot.docs.map((tokenDoc) => tokenDoc.data().token);
          
          userTokens.forEach((token) => {
             console.log(`Sending reminder for task ${maintenanceTask.task} to user ${userId}`);
             remindersToSend.push(admin.messaging().sendToDevice(token, payload));
          });
        }
      }

      await Promise.all(remindersToSend);
      console.log("All reminders have been sent.");

    } catch (error) {
      console.error("Error sending maintenance reminders:", error);
    }
    return null;
  });
