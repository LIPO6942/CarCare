'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Vehicle, Repair, Maintenance, FuelLog } from '@/lib/types';
import { getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';
import { VehicleTabs } from '@/components/vehicle-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import ErrorBoundary from './error-boundary';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Download, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface VehicleDetailModalProps {
  vehicle: Vehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

const safeFormatCurrency = (numInput: any): string => {
    try {
        const num = Number(numInput);
        if (isNaN(num)) return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
        return num.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    } catch {
        return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    }
}

const generateVehicleHistoryPDF = (vehicle: Vehicle, repairs: Repair[], maintenance: Maintenance[]) => {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(22);
  doc.text("Historique du Véhicule", 14, 22);
  doc.setFontSize(12);
  doc.text(`${vehicle.brand} ${vehicle.model} - ${vehicle.licensePlate}`, 14, 30);
  doc.line(14, 32, 196, 32);

  // Vehicle Details
  doc.setFontSize(16);
  doc.text("Informations du Véhicule", 14, 42);
  (doc as any).autoTable({
    startY: 45,
    body: [
      ['Marque', vehicle.brand],
      ['Modèle', vehicle.model],
      ['Année', vehicle.year.toString()],
      ['Plaque', vehicle.licensePlate],
      ['Carburant', vehicle.fuelType],
      ['Puissance Fiscale', `${vehicle.fiscalPower || 'N/A'} CV`],
    ],
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [22, 163, 74] },
  });

  let finalY = (doc as any).lastAutoTable.finalY + 15;

  // Repairs
  if (repairs.length > 0) {
    doc.setFontSize(16);
    doc.text("Réparations", 14, finalY);
    (doc as any).autoTable({
      startY: finalY + 3,
      head: [['Date', 'Description', 'Kilométrage', 'Coût']],
      body: repairs.map(r => [
        format(new Date(r.date), 'dd/MM/yyyy', { locale: fr }),
        r.description,
        `${r.mileage.toLocaleString('fr-FR')} km`,
        safeFormatCurrency(r.cost)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [31, 41, 55] },
    });
    finalY = (doc as any).lastAutoTable.finalY + 15;
  }
  
  // Maintenance
  if (maintenance.length > 0) {
    doc.setFontSize(16);
    doc.text("Entretiens", 14, finalY);
     (doc as any).autoTable({
      startY: finalY + 3,
      head: [['Date', 'Tâche', 'Kilométrage', 'Coût']],
      body: maintenance.map(m => [
        format(new Date(m.date), 'dd/MM/yyyy', { locale: fr }),
        m.task,
        `${m.mileage.toLocaleString('fr-FR')} km`,
        safeFormatCurrency(m.cost)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [31, 41, 55] },
    });
    finalY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for(let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Page ${i} sur ${pageCount}`, 14, doc.internal.pageSize.height - 10);
    doc.text(`Rapport généré le ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })} par CarCare Pro`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 10, { align: 'right' });
  }


  doc.save(`historique-${vehicle.brand}-${vehicle.model}-${vehicle.licensePlate}.pdf`);
};


export function VehicleDetailModal({ vehicle, open, onOpenChange, onDataChange }: VehicleDetailModalProps) {
  const { user } = useAuth();
  
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  const fetchVehicleSubCollections = useCallback(async () => {
    if (user && vehicle) {
      setIsLoading(true);
      try {
        const [repairsData, maintenanceData, fuelLogsData] = await Promise.all([
          getRepairsForVehicle(vehicle.id, user.uid),
          getMaintenanceForVehicle(vehicle.id, user.uid),
          getFuelLogsForVehicle(vehicle.id, user.uid),
        ]);
        setRepairs(repairsData);
        setMaintenance(maintenanceData);
        setFuelLogs(fuelLogsData);
      } catch (error) {
        console.error("Failed to fetch vehicle details.", error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [vehicle, user]);

  useEffect(() => {
    if (open && vehicle) {
      fetchVehicleSubCollections();
    }
  }, [open, vehicle, fetchVehicleSubCollections]);

  const handleDataChange = () => {
    fetchVehicleSubCollections();
    onDataChange(); // Also refetch dashboard data
  }

  const handleExportPdf = () => {
    if (!vehicle) return;
    setIsGeneratingPdf(true);
    // Use a timeout to allow the UI to update to show the loading state
    setTimeout(() => {
        try {
            generateVehicleHistoryPDF(vehicle, repairs, maintenance);
        } catch (error) {
            console.error("PDF Generation Error:", error);
        } finally {
            setIsGeneratingPdf(false);
        }
    }, 50);
  }


  if (!open || !vehicle) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-full w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-4xl flex flex-col">
        <DialogHeader className="p-4 border-b flex flex-row justify-between items-center">
          <div>
            <DialogTitle className="text-xl sm:text-2xl">{`${vehicle.brand || 'Marque'} ${vehicle.model || 'Modèle'}`}</DialogTitle>
            <DialogDescription>{`${vehicle.year || 'N/A'} - ${vehicle.licensePlate || 'N/A'}`}</DialogDescription>
          </div>
          <Button variant="outline" onClick={handleExportPdf} disabled={isLoading || isGeneratingPdf}>
            {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {isGeneratingPdf ? 'Génération...' : 'Exporter en PDF'}
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ErrorBoundary>
            {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
            ) : (
              <VehicleTabs 
                  vehicle={vehicle}
                  repairs={repairs} 
                  maintenance={maintenance} 
                  fuelLogs={fuelLogs}
                  onDataChange={handleDataChange}
                  initialTab="history"
              />
            )}
          </ErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}
