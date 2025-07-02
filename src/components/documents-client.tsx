'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import type { Vehicle, Document } from '@/lib/types';
import { getVehicles } from '@/lib/data';
import { addLocalDocument, deleteLocalDocument, getLocalDocumentsForVehicle } from '@/lib/local-db';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from './ui/skeleton';
import { PlusCircle, FileText, Trash2, Download, Loader2, Car } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DialogFooter } from './ui/dialog';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { format } from "date-fns";
import { fr } from "date-fns/locale";


const safeFormatDate = (dateInput: any, formatString: string = 'P') => {
  try {
    if (!dateInput) return 'N/A';
    let date;
    if (typeof dateInput === 'object' && dateInput !== null && typeof (dateInput as any).toDate === 'function') {
      date = (dateInput as any).toDate();
    } else {
      date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) {
      return 'Date invalide';
    }
    return format(date, formatString, { locale: fr });
  } catch (error) {
    return 'Erreur date';
  }
};

export function DocumentsClient() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Document | null>(null);
  const [objectUrls, setObjectUrls] = useState<Map<number, string>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    async function fetchVehicles() {
      if (!user) return;
      setIsLoadingVehicles(true);
      const vehiclesData = await getVehicles(user.uid);
      setVehicles(vehiclesData);
      if (vehiclesData.length > 0) {
        setSelectedVehicleId(vehiclesData[0].id);
      }
      setIsLoadingVehicles(false);
    }
    fetchVehicles();
  }, [user]);

  useEffect(() => {
    async function fetchDocuments() {
      if (!selectedVehicleId) {
        setDocuments([]);
        return;
      };
      setIsLoadingDocuments(true);
      const documentsData = await getLocalDocumentsForVehicle(selectedVehicleId);
      setDocuments(documentsData);
      setIsLoadingDocuments(false);
    }
    fetchDocuments();
  }, [selectedVehicleId]);

  useEffect(() => {
    const newUrls = new Map<number, string>();
    documents.forEach(doc => {
        if (doc.file instanceof File) {
            newUrls.set(doc.id, URL.createObjectURL(doc.file));
        }
    });
    setObjectUrls(newUrls);

    return () => {
        newUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [documents]);

  const onDataChange = async () => {
    if (!selectedVehicleId) return;
    setIsLoadingDocuments(true);
    const documentsData = await getLocalDocumentsForVehicle(selectedVehicleId);
    setDocuments(documentsData);
    setIsLoadingDocuments(false);
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
        await deleteLocalDocument(itemToDelete.id);
        toast({ title: 'Succès', description: 'Document supprimé.' });
        onDataChange();
        setItemToDelete(null);
    } catch (error) {
        toast({ title: 'Erreur', description: "Impossible de supprimer le document.", variant: 'destructive' });
    } finally {
        setIsDeleting(false);
    }
  };

  if (isLoadingVehicles) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (vehicles.length === 0) {
    return (
      <Card className="mt-6">
          <CardHeader>
              <CardTitle>Aucun véhicule</CardTitle>
              <CardDescription>Vous devez d'abord ajouter un véhicule pour pouvoir gérer ses documents.</CardDescription>
          </CardHeader>
          <CardContent className="text-center py-12 text-muted-foreground">
             <Car className="mx-auto h-12 w-12 mb-4" />
             <h3 className="text-lg font-semibold">Aucun véhicule trouvé</h3>
             <p>Veuillez retourner au tableau de bord pour ajouter un véhicule.</p>
          </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mt-6 items-center">
        <Select onValueChange={setSelectedVehicleId} defaultValue={selectedVehicleId || undefined}>
          <SelectTrigger className="w-full sm:w-[300px]">
            <SelectValue placeholder="Sélectionnez un véhicule" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map(vehicle => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.brand} {vehicle.model} ({vehicle.licensePlate})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={() => setIsAddDialogOpen(true)} className="w-full sm:w-auto ml-auto" disabled={!selectedVehicleId}>
          <PlusCircle className="mr-2 h-4 w-4" />Ajouter un document
        </Button>
      </div>

      <Card className="mt-6">
          <CardHeader>
              <CardTitle>Documents du Véhicule</CardTitle>
              <CardDescription>Stockez et consultez tous vos documents importants.</CardDescription>
          </CardHeader>
          <CardContent>
              {isLoadingDocuments ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin mb-4" />
                  <p>Chargement des documents...</p>
                </div>
              ) : documents.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {documents.map((doc) => {
                          const docUrl = objectUrls.get(doc.id);
                          return (
                          <Card key={doc.id} className="group relative">
                              <CardHeader>
                                  <CardTitle className="flex items-center gap-2 text-lg">
                                      <FileText className="h-5 w-5 text-primary" />
                                      <span className="truncate">{doc.name}</span>
                                  </CardTitle>
                                  <CardDescription>{doc.type} - Ajouté le {safeFormatDate(doc.createdAt)}</CardDescription>
                              </CardHeader>
                              <CardContent>
                                  <div className="flex gap-2">
                                      <Button asChild variant="secondary" className="flex-1" disabled={!docUrl}>
                                          <Link href={docUrl || '#'} target="_blank" rel="noopener noreferrer">
                                              <Download className="mr-2 h-4 w-4"/> Voir
                                          </Link>
                                      </Button>
                                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setItemToDelete(doc)}>
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </div>
                              </CardContent>
                          </Card>
                      )})}
                  </div>
              ) : (
                  <div className="text-center py-12 text-muted-foreground">
                      <FileText className="mx-auto h-12 w-12 mb-4" />
                      <h3 className="text-lg font-semibold">Aucun document</h3>
                      <p>Ajoutez les documents importants de votre véhicule.</p>
                  </div>
              )}
          </CardContent>
      </Card>
      {selectedVehicleId && <AddDocumentDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        vehicleId={selectedVehicleId}
        onDataChange={onDataChange}
      />}

      <DeleteConfirmationDialog 
          open={!!itemToDelete}
          onOpenChange={() => setItemToDelete(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
          title="Supprimer le document ?"
          description="Cette action est irréversible et supprimera définitivement le fichier localement."
      />
    </>
  );
}

// Re-using these small components here to avoid creating more files
function AddDocumentDialog({ open, onOpenChange, vehicleId, onDataChange }: { open: boolean, onOpenChange: (open: boolean) => void, vehicleId: string, onDataChange: () => void }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [docType, setDocType] = useState<Document['type'] | ''>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const documentTypes: Document['type'][] = ['Carte Grise', 'Assurance', 'Facture', 'Visite Technique', 'Autre'];

    useEffect(() => {
        if (!open) {
            setFile(null);
            setDocType('');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [open]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setFile(event.target.files[0]);
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!file || !docType) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner un fichier et un type de document.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        const name = formData.get('name') as string || file.name;

        try {
            await addLocalDocument(vehicleId, file, { name, type: docType });
            toast({ title: "Succès", description: "Document ajouté localement." });
            onOpenChange(false);
            onDataChange();
        } catch (error) {
             const errorMessage = error instanceof Error ? error.message : "Impossible d'ajouter le document localement.";
             toast({ title: "Erreur de stockage local", description: errorMessage, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ajouter un document</DialogTitle>
                    <DialogDescription>Téléchargez un fichier (PDF, image) qui sera stocké dans votre navigateur.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <label htmlFor="file-upload">Fichier</label>
                        <Input id="file-upload" type="file" required onChange={handleFileChange} ref={fileInputRef} />
                    </div>
                     <div className="space-y-2">
                        <label>Type de document</label>
                        <Select onValueChange={(value) => setDocType(value as Document['type'])} value={docType} required>
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionnez un type" />
                            </SelectTrigger>
                            <SelectContent>
                                {documentTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="doc-name">Nom du document (optionnel)</label>
                        <Input id="doc-name" name="name" placeholder="Ex: Facture garage du 15/05" />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Annuler</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function DeleteConfirmationDialog({ open, onOpenChange, onConfirm, isDeleting, title, description }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: () => void, isDeleting: boolean, title: string, description: string }) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={isDeleting}
                        onClick={onConfirm}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isDeleting ? 'Suppression...' : 'Supprimer'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
